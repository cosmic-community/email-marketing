import { NextRequest, NextResponse } from 'next/server'
import { cosmic, getSettings } from '@/lib/cosmic'
import { TextStreamingResponse } from '@cosmicjs/sdk'

// Helper function to fetch webpage content
async function fetchWebpageContent(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CosmicAI/1.0)'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const html = await response.text()
    
    // Extract text content and images from HTML
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000) // Limit content length
    
    // Extract image URLs
    const imageMatches = html.match(/<img[^>]+src="([^"]+)"/gi) || []
    const images = imageMatches
      .map(match => {
        const srcMatch = match.match(/src="([^"]+)"/)
        return srcMatch ? srcMatch[1] : null
      })
      .filter(Boolean)
      .slice(0, 10) // Limit number of images
    
    return {
      title: html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'Webpage',
      content: textContent,
      images: images
    }
  } catch (error) {
    console.error('Error fetching webpage:', error)
    return {
      title: 'Error loading webpage',
      content: `Failed to load content from ${url}`,
      images: []
    }
  }
}

// Helper function to process media files by uploading to Cosmic
async function processMediaFile(url: string) {
  try {
    // For direct media URLs, upload to Cosmic media library
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status}`)
    }
    
    const buffer = await response.arrayBuffer()
    const filename = url.split('/').pop() || 'media-file'
    
    // Upload to Cosmic media library - removed invalid 'name' property
    const mediaResponse = await cosmic.media.insertOne({
      media: new Blob([buffer], { 
        type: response.headers.get('content-type') || 'application/octet-stream' 
      })
    })
    
    return {
      title: filename,
      media_url: mediaResponse.media?.url || url,
      imgix_url: mediaResponse.media?.imgix_url || url
    }
  } catch (error) {
    console.error('Error processing media file:', error)
    return {
      title: 'Media file',
      media_url: url,
      imgix_url: url
    }
  }
}

// Helper function to extract first media URL from context items
function getFirstMediaUrl(contextItems: any[]): string | undefined {
  for (const item of contextItems) {
    if (item.type === 'file') {
      return item.url
    }
    // For webpages, check if any images were found during processing
    if (item.type === 'webpage' && item.images && item.images.length > 0) {
      return item.images[0]
    }
  }
  return undefined
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, type, context_items } = await request.json()
    
    if (!prompt || !type) {
      return NextResponse.json(
        { error: 'Prompt and type are required' },
        { status: 400 }
      )
    }

    // Create a readable stream for Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        
        // Send initial loading message
        controller.enqueue(
          encoder.encode('data: {"type":"status","message":"Connecting to Cosmic AI...","progress":10}\n\n')
        )
        
        // Generate AI content using Cosmic AI streaming
        setTimeout(async () => {
          try {
            let processedContext = ''
            
            // Process context items if provided
            if (context_items && context_items.length > 0) {
              controller.enqueue(
                encoder.encode('data: {"type":"status","message":"Processing context items...","progress":20}\n\n')
              )
              
              const contextPromises = context_items.map(async (item: any) => {
                if (item.type === 'webpage') {
                  controller.enqueue(
                    encoder.encode('data: {"type":"status","message":"Fetching webpage content...","progress":25}\n\n')
                  )
                  const webContent = await fetchWebpageContent(item.url)
                  return `\nWebpage: ${webContent.title}\nContent: ${webContent.content}\n${webContent.images.length > 0 ? `Images found: ${webContent.images.join(', ')}` : ''}\n---\n`
                } else if (item.type === 'file') {
                  controller.enqueue(
                    encoder.encode('data: {"type":"status","message":"Processing media file...","progress":25}\n\n')
                  )
                  const mediaData = await processMediaFile(item.url)
                  return `\nMedia File: ${mediaData.title}\nURL: ${mediaData.media_url}\n${mediaData.imgix_url ? `Optimized URL: ${mediaData.imgix_url}` : ''}\n---\n`
                }
                return `\nReference: ${item.url}\n---\n`
              })
              
              const contextResults = await Promise.all(contextPromises)
              processedContext = contextResults.join('')
              
              controller.enqueue(
                encoder.encode('data: {"type":"status","message":"Context analysis complete. Generating content...","progress":35}\n\n')
              )
            }

            controller.enqueue(
              encoder.encode('data: {"type":"status","message":"Generating email content...","progress":40}\n\n')
            )

            // Get settings for brand guidelines and company info
            const settings = await getSettings()
            const brandGuidelines = settings?.metadata.brand_guidelines || ''
            const companyName = settings?.metadata.company_name || 'Your Company'
            const aiTone = settings?.metadata.ai_tone?.value || 'Professional'
            const primaryColor = settings?.metadata.primary_brand_color || '#3b82f6'

            // Get current year for copyright
            const currentYear = new Date().getFullYear()

            // Create AI prompt based on template type - ONLY for body content
            let aiPrompt = ''
            const baseInstructions = `
            Company: ${companyName}
            Tone: ${aiTone}
            Primary Brand Color: ${primaryColor}
            Current Year: ${currentYear} (use this for copyright footer)
            ${brandGuidelines ? `Brand Guidelines: ${brandGuidelines}` : ''}
            ${processedContext ? `\nContext Information:\n${processedContext}` : ''}
            ${processedContext ? `\nIMPORTANT: I have provided context information above. Please analyze and incorporate relevant information, styling cues, or content from this context into the email template.` : ''}
            `

            if (type === 'Newsletter') {
              aiPrompt = `Create ONLY the HTML body content for an email newsletter template based on "${prompt}". 
              
              ${baseInstructions}
              
              Include:
              - A header with gradient background using the brand color
              - Welcome greeting with {{first_name}} placeholder
              - Main content section with highlights and bullet points
              - Call-to-action button using brand colors
              - Professional footer with company name and copyright ${currentYear}
              - Responsive design with modern styling
              - Use inline CSS for email compatibility
              
              IMPORTANT: DO NOT include an unsubscribe link - this will be added automatically to all emails. Return ONLY the HTML body content, no subject line, no backticks or code block markers, no explanation text. Start directly with HTML content.`
            } else if (type === 'Welcome Email') {
              aiPrompt = `Create ONLY the HTML body content for a welcome email template for "${prompt}".
              
              ${baseInstructions}
              
              Include:
              - Warm welcome header with celebration emoji using brand colors
              - Personalized greeting with {{first_name}} placeholder
              - Welcome message explaining what to expect
              - Getting started section with benefits
              - Prominent call-to-action button using brand colors
              - Friendly footer with company name and copyright ${currentYear}
              - Modern, friendly design with inline CSS
              
              IMPORTANT: DO NOT include an unsubscribe link - this will be added automatically to all emails. Return ONLY the HTML body content, no subject line, no backticks or code block markers, no explanation text. Start directly with HTML content.`
            } else {
              aiPrompt = `Create ONLY the HTML body content for an email template for "${prompt}" (${type}).
              
              ${baseInstructions}
              
              Include:
              - Professional header design using brand colors
              - Personalized greeting with {{first_name}} placeholder
              - Clear main content section
              - Call-to-action button using brand colors
              - Footer with company name and copyright ${currentYear}
              - Clean, modern styling with inline CSS for email compatibility
              
              IMPORTANT: DO NOT include an unsubscribe link - this will be added automatically to all emails. Return ONLY the HTML body content, no subject line, no backticks or code block markers, no explanation text. Start directly with HTML content.`
            }

            controller.enqueue(
              encoder.encode('data: {"type":"status","message":"Processing with Cosmic AI...","progress":50}\n\n')
            )

            // Extract first media URL from context items for AI analysis
            const firstMediaUrl = getFirstMediaUrl(context_items || [])

            // Generate content with Cosmic AI streaming - include media_url if available
            const aiRequestOptions: any = {
              model: 'claude-opus-5',
              prompt: aiPrompt,
              max_tokens: 60000,
              stream: true
            }

            // Add media_url if we have a media file in context
            if (firstMediaUrl) {
              aiRequestOptions.media_url = firstMediaUrl
            }

            const aiResponse = await cosmic.ai.generateText(aiRequestOptions)

            // Check if aiResponse is a streaming response by checking for the 'on' method
            const isStreamingResponse = aiResponse && 
              typeof aiResponse === 'object' && 
              'on' in aiResponse && 
              typeof aiResponse.on === 'function';

            if (!isStreamingResponse) {
              throw new Error('AI stream not available or invalid')
            }

            // Now we can safely use the streaming response
            const aiStream = aiResponse as TextStreamingResponse;
            
            let generatedContent = ''
            let isComplete = false

            // Process the AI stream using event listeners
            aiStream.on('text', (text: string) => {
              generatedContent += text
              
              // Stream the content in real-time
              controller.enqueue(
                encoder.encode(`data: {"type":"content","text":"${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}","progress":70}\n\n`)
              )
            })

            aiStream.on('usage', () => {
              controller.enqueue(
                encoder.encode('data: {"type":"status","message":"Finalizing template...","progress":80}\n\n')
              )
            })

            aiStream.on('end', () => {
              try {
                if (isComplete) return
                isComplete = true

                controller.enqueue(
                  encoder.encode('data: {"type":"status","message":"Template generated successfully!","progress":100}\n\n')
                )

                // Use the content as-is since we instructed AI not to use backticks
                const finalContent = generatedContent.trim()

                // Send complete response
                controller.enqueue(
                  encoder.encode(`data: {"type":"complete","data":{"content":"${finalContent.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"}}\n\n`)
                )

                // Close the stream
                controller.close()

              } catch (endError) {
                console.error('Stream end error:', endError)
                controller.enqueue(
                  encoder.encode('data: {"type":"error","error":"Failed to finalize content"}\n\n')
                )
                controller.close()
              }
            })

            aiStream.on('error', (error: any) => {
              console.error('AI stream error:', error)
              if (!isComplete) {
                controller.enqueue(
                  encoder.encode('data: {"type":"error","error":"AI generation failed"}\n\n')
                )
                controller.close()
              }
            })

          } catch (error) {
            console.error('Generation error:', error)
            controller.enqueue(
              encoder.encode('data: {"type":"error","error":"Failed to generate content"}\n\n')
            )
            controller.close()
          }
        }, 1000)
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}