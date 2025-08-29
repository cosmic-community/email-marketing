// app/api/campaigns/[id]/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaign, getEmailContacts } from '@/lib/cosmic'

interface AnalyticsEvent {
  type: 'open' | 'click';
  contact_id: string;
  timestamp: string;
}

interface CampaignWithContacts {
  id: string;
  metadata: {
    name: string;
    stats?: {
      sent?: number;
      delivered?: number;
      opened?: number;
      clicked?: number;
      bounced?: number;
      unsubscribed?: number;
      open_rate?: string;
      click_rate?: string;
    };
    target_contacts?: Array<{ id: string; metadata: { email: string; first_name?: string; last_name?: string } }>;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    if (!id) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      )
    }

    const campaign = await getMarketingCampaign(id) as CampaignWithContacts | null
    
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Get analytics events (mock data for now since we don't have a tracking system yet)
    const analyticsEvents: AnalyticsEvent[] = []

    // Calculate analytics data
    const analytics = {
      overview: {
        total_sent: campaign.metadata?.stats?.sent || 0,
        total_delivered: campaign.metadata?.stats?.delivered || 0,
        total_opened: campaign.metadata?.stats?.opened || 0,
        total_clicked: campaign.metadata?.stats?.clicked || 0,
        total_bounced: campaign.metadata?.stats?.bounced || 0,
        total_unsubscribed: campaign.metadata?.stats?.unsubscribed || 0,
        open_rate: campaign.metadata?.stats?.open_rate || '0%',
        click_rate: campaign.metadata?.stats?.click_rate || '0%'
      },
      timeline: generateTimelineData(analyticsEvents),
      top_performers: await getTopPerformers(analyticsEvents),
      recent_activities: getRecentActivities(analyticsEvents)
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

function generateTimelineData(events: AnalyticsEvent[]) {
  // Group events by date
  const timelineData = events.reduce((acc: Record<string, { opens: number; clicks: number }>, event: AnalyticsEvent) => {
    const date = event.timestamp.split('T')[0]
    if (!acc[date]) {
      acc[date] = { opens: 0, clicks: 0 }
    }
    if (event.type === 'open') {
      acc[date].opens++
    } else if (event.type === 'click') {
      acc[date].clicks++
    }
    return acc
  }, {})

  // Convert to array format
  return Object.entries(timelineData).map(([date, data]) => ({
    date,
    opens: data.opens,
    clicks: data.clicks
  })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

async function getTopPerformers(events: AnalyticsEvent[]) {
  try {
    const contacts = await getEmailContacts()
    const contactEngagement = events.reduce((acc: Record<string, { opens: number; clicks: number }>, event: AnalyticsEvent) => {
      const contactId = event.contact_id
      if (contactId && !acc[contactId]) {
        acc[contactId] = { opens: 0, clicks: 0 }
      }
      if (contactId) {
        if (event.type === 'open') {
          acc[contactId].opens++
        } else if (event.type === 'click') {
          acc[contactId].clicks++
        }
      }
      return acc
    }, {})

    // Get top 10 most engaged contacts
    return Object.entries(contactEngagement)
      .map(([contactId, engagement]) => {
        const contact = contacts.find((c: any) => c.id === contactId)
        return {
          contact_id: contactId,
          contact_name: contact ? `${contact.metadata?.first_name || ''} ${contact.metadata?.last_name || ''}`.trim() : 'Unknown',
          contact_email: contact?.metadata?.email || 'Unknown',
          total_engagement: engagement.opens + engagement.clicks,
          opens: engagement.opens,
          clicks: engagement.clicks
        }
      })
      .sort((a, b) => b.total_engagement - a.total_engagement)
      .slice(0, 10)
  } catch (error) {
    console.error('Error getting top performers:', error)
    return []
  }
}

function getRecentActivities(events: AnalyticsEvent[]) {
  return events
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20)
    .map((event: AnalyticsEvent) => ({
      type: event.type,
      contact_id: event.contact_id,
      timestamp: event.timestamp,
      description: event.type === 'open' ? 'Opened email' : 'Clicked link'
    }))
}