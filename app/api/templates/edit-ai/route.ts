import { NextRequest } from 'next/server'
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
    const { prompt, currentContent, currentSubject, templateId, context_items } = await request.json()
    
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Create a readable stream for Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        
        // Send initial loading message
        controller.enqueue(
          encoder.encode('data: {"type":"status","message":"Starting AI content editing...","progress":10}\n\n')
        )
        
        // Process AI editing after initial delay
        setTimeout(async () => {
          try {
            controller.enqueue(
              encoder.encode('data: {"type":"status","message":"Analyzing current content...","progress":30}\n\n')
            )

            let processedContext = ''
            
            // Process context items if provided
            if (context_items && context_items.length > 0) {
              controller.enqueue(
                encoder.encode('data: {"type":"status","message":"Processing context items for reference...","progress":35}\n\n')
              )
              
              const contextPromises = context_items.map(async (item: any) => {
                if (item.type === 'webpage') {
                  controller.enqueue(
                    encoder.encode('data: {"type":"status","message":"Analyzing webpage for style references...","progress":40}\n\n')
                  )
                  const webContent = await fetchWebpageContent(item.url)
                  return `\nStyle Reference - ${webContent.title}:\nContent: ${webContent.content}\n${webContent.images.length > 0 ? `Images found: ${webContent.images.join(', ')}` : ''}\n---\n`
                } else if (item.type === 'file') {
                  controller.enqueue(
                    encoder.encode('data: {"type":"status","message":"Processing reference media...","progress":40}\n\n')
                  )
                  const mediaData = await processMediaFile(item.url)
                  return `\nReference Media: ${mediaData.title}\nURL: ${mediaData.media_url}\n${mediaData.imgix_url ? `Optimized URL: ${mediaData.imgix_url}` : ''}\n---\n`
                }
                return `\nReference: ${item.url}\n---\n`
              })
              
              const contextResults = await Promise.all(contextPromises)
              processedContext = contextResults.join('')
              
              controller.enqueue(
                encoder.encode('data: {"type":"status","message":"Context analysis complete. Applying improvements...","progress":45}\n\n')
              )
            }

            // Get settings for brand guidelines and company info
            const settings = await getSettings()
            const brandGuidelines = settings?.metadata.brand_guidelines || ''
            const companyName = settings?.metadata.company_name || 'Your Company'
            const aiTone = settings?.metadata.ai_tone?.value || 'Professional'
            const primaryColor = settings?.metadata.primary_brand_color || '#3b82f6'

            // Get current year for copyright
            const currentYear = new Date().getFullYear()

            // Create AI prompt for editing - ONLY for body content
            const aiPrompt = `Please improve this HTML email template based on the following instructions: "${prompt}"

Current email template:
${currentContent}

Brand Context:
Company: ${companyName}
Tone: ${aiTone}
Primary Brand Color: ${primaryColor}
Current Year: ${currentYear} (use this for copyright footer if updating footer)
${brandGuidelines ? `Brand Guidelines: ${brandGuidelines}` : ''}
${processedContext ? `\nReference Context:\n${processedContext}` : ''}
${processedContext ? `\nIMPORTANT: I have provided reference context above. Please use this information as inspiration for the improvements. Analyze the content, design elements, styling cues, or visual references and incorporate relevant aspects into the email template improvements.` : ''}

Instructions:
- Maintain the HTML structure and email compatibility
- Keep all existing merge fields like {{first_name}}
- Apply the requested improvements while preserving functionality
- Ensure the result is still a complete, valid HTML email template
- Use inline CSS for email client compatibility
- Make improvements that enhance readability and visual appeal
- Apply brand guidelines and colors where appropriate
- Use the specified tone for any text modifications
- If updating footer copyright, use ${currentYear} as the current year

IMPORTANT: DO NOT include or modify any unsubscribe links - these are added automatically to all emails. Return ONLY the improved HTML email template without any backticks, code block markers, or additional text. Start directly with the HTML content.`

            controller.enqueue(
              encoder.encode('data: {"type":"status","message":"Applying AI improvements...","progress":60}\n\n')
            )

            // Extract first media URL from context items for AI analysis
            const firstMediaUrl = getFirstMediaUrl(context_items || [])

            // Generate improved content with Cosmic AI streaming - include media_url if available
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

            // Handle both streaming and non-streaming responses
            if (aiResponse && typeof aiResponse === 'object' && 'on' in aiResponse) {
              // Streaming response
              const aiStream = aiResponse as TextStreamingResponse
              let improvedContent = ''
              let isComplete = false

              aiStream.on('text', (text: string) => {
                improvedContent += text
                
                // Stream the content in real-time
                controller.enqueue(
                  encoder.encode(`data: {"type":"content","text":"${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}","progress":75}\n\n`)
                )
              })

              aiStream.on('end', () => {
                try {
                  if (isComplete) return
                  isComplete = true

                  controller.enqueue(
                    encoder.encode('data: {"type":"status","message":"AI editing completed successfully!","progress":100}\n\n')
                  )

                  // Use the content as-is since we instructed AI not to use backticks
                  const finalContent = improvedContent.trim()

                  // Send complete response with content only
                  controller.enqueue(
                    encoder.encode(`data: {"type":"complete","data":{"content":"${finalContent.replace(/"/g, '\\"').replace(/\n/g, '\\n')}","subject":"${currentSubject?.replace(/"/g, '\\"') || ''}"}}\n\n`)
                  )

                  controller.close()
                } catch (endError) {
                  console.error('Stream end error:', endError)
                  controller.enqueue(
                    encoder.encode('data: {"type":"error","error":"Failed to complete editing"}\n\n')
                  )
                  controller.close()
                }
              })

              aiStream.on('error', (error: any) => {
                console.error('AI stream error:', error)
                if (!isComplete) {
                  controller.enqueue(
                    encoder.encode('data: {"type":"error","error":"AI editing failed"}\n\n')
                  )
                  controller.close()
                }
              })

            } else {
              // Non-streaming response fallback
              const content = typeof aiResponse === 'string' ? aiResponse : 'Failed to generate content'
              
              controller.enqueue(
                encoder.encode('data: {"type":"status","message":"Processing complete!","progress":100}\n\n')
              )
              
              controller.enqueue(
                encoder.encode(`data: {"type":"complete","data":{"content":"${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}","subject":"${currentSubject?.replace(/"/g, '\\"') || ''}"}}\n\n`)
              )
              
              controller.close()
            }

          } catch (error) {
            console.error('AI editing error:', error)
            controller.enqueue(
              encoder.encode('data: {"type":"error","error":"Failed to edit content"}\n\n')
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
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}