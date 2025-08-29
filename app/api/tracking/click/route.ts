import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('c')
    const contactId = searchParams.get('u')
    const originalUrl = searchParams.get('url')

    if (!campaignId || !contactId || !originalUrl) {
      return NextResponse.redirect('https://cosmicjs.com', { status: 302 })
    }

    // Record the click event (don't await to not delay redirect)
    recordClickEvent(campaignId, contactId, originalUrl).catch(error => {
      console.error('Error recording click event:', error)
    })

    // Decode and redirect to the original URL
    const decodedUrl = decodeURIComponent(originalUrl)
    
    // Validate URL to prevent open redirects
    if (isValidRedirectUrl(decodedUrl)) {
      return NextResponse.redirect(decodedUrl, { status: 302 })
    } else {
      return NextResponse.redirect('https://cosmicjs.com', { status: 302 })
    }
  } catch (error) {
    console.error('Error in click tracking:', error)
    return NextResponse.redirect('https://cosmicjs.com', { status: 302 })
  }
}

async function recordClickEvent(campaignId: string, contactId: string, url: string) {
  try {
    // Get the campaign to update its stats
    const { object: campaign } = await cosmic.objects.findOne({
      id: campaignId,
      type: 'marketing-campaigns'
    }).props(['id', 'metadata'])

    if (!campaign) {
      throw new Error('Campaign not found')
    }

    const currentStats = campaign.metadata?.stats || {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
      open_rate: '0%',
      click_rate: '0%'
    }

    // Track unique clicks by storing clicked contact IDs
    let clickedContacts = campaign.metadata?.clicked_contacts || []
    
    if (!clickedContacts.includes(contactId)) {
      // This is a unique click
      clickedContacts.push(contactId)
      
      const newClicked = currentStats.clicked + 1
      const clickRate = currentStats.sent > 0 ? 
        Math.round((newClicked / currentStats.sent) * 100) + '%' : '0%'

      const updatedStats = {
        ...currentStats,
        clicked: newClicked,
        click_rate: clickRate
      }

      // Update the campaign with new stats and clicked contacts list
      await cosmic.objects.updateOne(campaignId, {
        metadata: {
          stats: updatedStats,
          clicked_contacts: clickedContacts
        }
      })
    }

    // Create a tracking event record (for all clicks, not just unique ones)
    await cosmic.objects.insertOne({
      title: `Click Event - ${campaign.title}`,
      type: 'tracking-events',
      metadata: {
        event_type: 'click',
        campaign_id: campaignId,
        contact_id: contactId,
        clicked_url: url,
        timestamp: new Date().toISOString(),
        user_agent: '',
        ip_address: ''
      }
    })

    console.log(`Recorded click event for campaign ${campaignId}, contact ${contactId}, URL: ${url}`)
  } catch (error) {
    console.error('Error recording click event:', error)
    throw error
  }
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    // Only allow http and https protocols
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}