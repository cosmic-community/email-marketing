import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'

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
    const { content, templateType, context_items } = await request.json()
    
    if (!content) {
      return NextResponse.json(
        { error: 'Email content is required' },
        { status: 400 }
      )
    }

    // Create AI prompt for subject generation based on email content
    const aiPrompt = `Based on the following email content, generate a compelling email subject line that:
    - Is clear and engaging
    - Matches the tone and purpose of the email
    - Is appropriate for a ${templateType || 'professional email'}
    - Is 50 characters or less
    - Will encourage recipients to open the email

Email content:
${content}

IMPORTANT: Return ONLY the subject line text, no quotes, no explanation, no additional text.`

    try {
      // Extract first media URL from context items for AI analysis
      const firstMediaUrl = getFirstMediaUrl(context_items || [])

      // Generate subject with Cosmic AI (non-streaming for simplicity) - include media_url if available
      const aiRequestOptions: any = {
        prompt: aiPrompt,
        max_tokens: 50,
        stream: false
      }

      // Add media_url if we have a media file in context
      if (firstMediaUrl) {
        aiRequestOptions.media_url = firstMediaUrl
      }

      const aiResponse = await cosmic.ai.generateText(aiRequestOptions)

      // Handle the response with proper type checking
      let generatedSubject = ''
      
      if (aiResponse) {
        if (typeof aiResponse === 'string') {
          generatedSubject = aiResponse
        } else if (typeof aiResponse === 'object' && aiResponse !== null && 'text' in aiResponse) {
          const responseData = aiResponse as { text: unknown }
          if (typeof responseData.text === 'string') {
            generatedSubject = responseData.text
          }
        }
      }

      // Only call trim() if we have a valid string
      if (generatedSubject && typeof generatedSubject === 'string') {
        generatedSubject = generatedSubject.trim()
        
        // Clean up the subject - remove quotes and extra formatting
        generatedSubject = generatedSubject.replace(/^["']|["']$/g, '')
        generatedSubject = generatedSubject.replace(/`/g, '')
        generatedSubject = generatedSubject.trim()
      }

      if (!generatedSubject) {
        throw new Error('No subject generated')
      }

      return NextResponse.json({ 
        success: true, 
        subject: generatedSubject 
      })

    } catch (aiError) {
      console.error('AI subject generation error:', aiError)
      
      // Fallback subject generation based on template type
      let fallbackSubject = ''
      if (templateType === 'Newsletter') {
        fallbackSubject = 'Your Monthly Newsletter Update'
      } else if (templateType === 'Welcome Email') {
        fallbackSubject = 'Welcome! Let\'s get started 🎉'
      } else if (templateType === 'Promotional') {
        fallbackSubject = 'Special Offer Just for You'
      } else {
        fallbackSubject = 'Important Update'
      }

      return NextResponse.json({ 
        success: true, 
        subject: fallbackSubject,
        fallback: true 
      })
    }

  } catch (error) {
    console.error('Error in subject generation:', error)
    return NextResponse.json(
      { error: 'Failed to generate subject line' },
      { status: 500 }
    )
  }
}