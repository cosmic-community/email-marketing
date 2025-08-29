import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'

// Force dynamic route to prevent static generation issues
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('c') || searchParams.get('campaign')
    const contactId = searchParams.get('u') || searchParams.get('contact') 
    const url = searchParams.get('url')

    console.log('Click tracking:', { campaignId, contactId, url })

    if (!campaignId || !contactId || !url) {
      console.error('Missing required parameters for click tracking')
      return NextResponse.redirect('https://cosmicjs.com')
    }

    // Record the click event
    await recordClickEvent(campaignId, contactId)

    // Redirect to the target URL
    return NextResponse.redirect(decodeURIComponent(url))
  } catch (error) {
    console.error('Error in click tracking:', error)
    // Redirect to a safe fallback URL on error
    return NextResponse.redirect('https://cosmicjs.com')
  }
}

async function recordClickEvent(campaignId: string, contactId: string) {
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

    // Check if this contact has already clicked this campaign
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

      // Create a tracking event record
      await cosmic.objects.insertOne({
        title: `Click Event - ${campaign.title}`,
        type: 'tracking-events',
        metadata: {
          event_type: 'click',
          campaign_id: campaignId,
          contact_id: contactId,
          timestamp: new Date().toISOString(),
          user_agent: '',
          ip_address: ''
        }
      })

      console.log(`Recorded click event for campaign ${campaignId}, contact ${contactId}`)
    }
  } catch (error) {
    console.error('Error recording click event:', error)
    // Don't throw here to avoid breaking the redirect
  }
}