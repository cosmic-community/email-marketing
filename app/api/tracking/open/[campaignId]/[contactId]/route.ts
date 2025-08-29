// app/api/tracking/open/[campaignId]/[contactId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'

// 1x1 transparent pixel in base64
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string; contactId: string }> }
) {
  try {
    const { campaignId, contactId } = await params

    // Record the open event
    await recordOpenEvent(campaignId, contactId)

    // Return the tracking pixel
    return new NextResponse(TRACKING_PIXEL, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error) {
    console.error('Error tracking email open:', error)
    
    // Still return the pixel even if tracking fails
    return new NextResponse(TRACKING_PIXEL, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  }
}

async function recordOpenEvent(campaignId: string, contactId: string) {
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

    // Check if this contact has already opened this campaign
    // We'll track unique opens by storing opened contact IDs
    let openedContacts = campaign.metadata?.opened_contacts || []
    
    if (!openedContacts.includes(contactId)) {
      // This is a unique open
      openedContacts.push(contactId)
      
      const newOpened = currentStats.opened + 1
      const openRate = currentStats.sent > 0 ? 
        Math.round((newOpened / currentStats.sent) * 100) + '%' : '0%'

      const updatedStats = {
        ...currentStats,
        opened: newOpened,
        open_rate: openRate
      }

      // Update the campaign with new stats and opened contacts list
      await cosmic.objects.updateOne(campaignId, {
        metadata: {
          stats: updatedStats,
          opened_contacts: openedContacts
        }
      })

      // Create a tracking event record
      await cosmic.objects.insertOne({
        title: `Open Event - ${campaign.title}`,
        type: 'tracking-events',
        metadata: {
          event_type: 'open',
          campaign_id: campaignId,
          contact_id: contactId,
          timestamp: new Date().toISOString(),
          user_agent: '',
          ip_address: ''
        }
      })

      console.log(`Recorded open event for campaign ${campaignId}, contact ${contactId}`)
    }
  } catch (error) {
    console.error('Error recording open event:', error)
    throw error
  }
}