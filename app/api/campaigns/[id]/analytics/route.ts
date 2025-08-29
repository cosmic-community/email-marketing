// app/api/campaigns/[id]/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaign, cosmic } from '@/lib/cosmic'
import { generateTrackingReport } from '@/lib/email-tracking'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Get the campaign with detailed stats
    const campaign = await getMarketingCampaign(id)
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Generate tracking report
    const report = generateTrackingReport(campaign)

    // Get detailed tracking events
    let trackingEvents = []
    try {
      const { objects } = await cosmic.objects.find({
        type: 'tracking-events',
        'metadata.campaign_id': id
      }).props(['id', 'metadata', 'created_at'])
      
      trackingEvents = objects.map(event => ({
        id: event.id,
        type: event.metadata?.event_type,
        contactId: event.metadata?.contact_id,
        timestamp: event.metadata?.timestamp || event.created_at,
        clickedUrl: event.metadata?.clicked_url,
      }))
    } catch (error) {
      console.error('Error fetching tracking events:', error)
    }

    // Get contact details for opened/clicked lists
    const openedContactDetails = []
    const clickedContactDetails = []
    
    if (report.openedContacts.length > 0 || report.clickedContacts.length > 0) {
      try {
        const { objects: contacts } = await cosmic.objects.find({
          type: 'email-contacts'
        }).props(['id', 'metadata'])
        
        const contactMap = new Map(contacts.map(c => [c.id, c]))
        
        // Get details for opened contacts
        for (const contactId of report.openedContacts) {
          const contact = contactMap.get(contactId)
          if (contact) {
            openedContactDetails.push({
              id: contactId,
              email: contact.metadata?.email,
              firstName: contact.metadata?.first_name,
              lastName: contact.metadata?.last_name
            })
          }
        }

        // Get details for clicked contacts
        for (const contactId of report.clickedContacts) {
          const contact = contactMap.get(contactId)
          if (contact) {
            clickedContactDetails.push({
              id: contactId,
              email: contact.metadata?.email,
              firstName: contact.metadata?.first_name,
              lastName: contact.metadata?.last_name
            })
          }
        }
      } catch (error) {
        console.error('Error fetching contact details:', error)
      }
    }

    // Calculate additional metrics
    const analytics = {
      ...report,
      openedContactDetails,
      clickedContactDetails,
      trackingEvents,
      engagement: {
        totalEngagement: report.totalOpened + report.totalClicked,
        engagementRate: report.totalSent > 0 ? 
          Math.round(((report.totalOpened + report.totalClicked) / report.totalSent) * 100) + '%' : '0%'
      },
      timeline: generateEngagementTimeline(trackingEvents)
    }

    return NextResponse.json({
      success: true,
      analytics
    })

  } catch (error) {
    console.error('Analytics fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

function generateEngagementTimeline(events: any[]) {
  const timeline: Record<string, { opens: number; clicks: number }> = {}
  
  events.forEach(event => {
    if (!event.timestamp) return
    
    const date = new Date(event.timestamp).toISOString().split('T')[0] // Get YYYY-MM-DD
    
    if (!timeline[date]) {
      timeline[date] = { opens: 0, clicks: 0 }
    }
    
    if (event.type === 'open') {
      timeline[date].opens++
    } else if (event.type === 'click') {
      timeline[date].clicks++
    }
  })
  
  return Object.entries(timeline)
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date))
}