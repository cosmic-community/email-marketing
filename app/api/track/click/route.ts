import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Changed: Read 'campaign' and 'contact' to match what email-tracking.ts generates
    // Also support legacy 'c' and 'u' params for backward compatibility
    const campaignId = searchParams.get('campaign') || searchParams.get('c')
    const contactId = searchParams.get('contact') || searchParams.get('u')
    const url = searchParams.get('url')

    if (!campaignId || !url) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    try {
      // Get the current campaign to update click stats
      const { object: campaign } = await cosmic.objects.findOne({
        type: 'marketing-campaigns',
        id: campaignId
      }).props(['id', 'metadata'])

      if (campaign?.metadata?.stats) {
        const currentStats = campaign.metadata.stats
        const newClickCount = (currentStats.clicked || 0) + 1
        const totalSent = currentStats.sent || 1
        const newClickRate = `${Math.round((newClickCount / totalSent) * 100)}%`

        // Update campaign stats with new click data
        await cosmic.objects.updateOne(campaignId, {
          metadata: {
            stats: {
              ...currentStats,
              clicked: newClickCount,
              click_rate: newClickRate
            }
          }
        })
      }
    } catch (statsError) {
      // Log stats update error but don't fail the redirect
      console.error('Error updating click stats:', statsError)
    }

    // Create tracking event (optional - for detailed analytics)
    try {
      await cosmic.objects.insertOne({
        type: 'email-tracking-events',
        title: `Click Event - ${new Date().toISOString()}`,
        status: 'published',
        metadata: {
          event_type: 'Click',
          campaign: campaignId,
          contact: contactId,
          url: url,
          timestamp: new Date().toISOString(),
          user_agent: request.headers.get('user-agent') || '',
          ip_address: request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
        }
      })
    } catch (trackingError) {
      // Log tracking error but don't fail the redirect
      console.error('Error creating tracking event:', trackingError)
    }

    // Decode the URL and clean up any HTML entities that may have leaked through
    // Changed: Clean up &amp; entities in case they made it through to the tracking URL
    const decodedUrl = decodeURIComponent(url).replace(/&amp;/g, '&')

    // Redirect to the actual URL
    return NextResponse.redirect(decodedUrl)

  } catch (error) {
    console.error('Error in click tracking:', error)
    
    // Provide a safe fallback - extract the URL parameter and redirect if possible
    try {
      const { searchParams } = new URL(request.url)
      const fallbackUrl = searchParams.get('url')
      
      if (fallbackUrl) {
        const cleanedFallback = decodeURIComponent(fallbackUrl).replace(/&amp;/g, '&')
        return NextResponse.redirect(cleanedFallback)
      }
    } catch (fallbackError) {
      console.error('Fallback redirect failed:', fallbackError)
    }

    // If we can't redirect, show an error page
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Link Error</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
              max-width: 600px; 
              margin: 100px auto; 
              padding: 20px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <h1>Unable to Process Link</h1>
          <p>We encountered an error while processing your request. Please try again later.</p>
          <p><a href="https://cosmicjs.com">Return to Home</a></p>
        </body>
      </html>
      `,
      { 
        status: 500,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    )
  }
}