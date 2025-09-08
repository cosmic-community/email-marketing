import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaign, updateCampaignStatus } from '@/lib/cosmic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const campaignId = searchParams.get('campaign')
  const email = searchParams.get('email')
  
  // Return 1x1 transparent pixel
  const pixelBuffer = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  )
  
  if (campaignId) {
    try {
      // Track the open event
      const campaign = await getMarketingCampaign(campaignId)
      if (campaign && campaign.metadata.stats) {
        const currentOpened = campaign.metadata.stats.opened || 0
        const currentSent = campaign.metadata.stats.sent || 0
        
        const updatedStats = {
          ...campaign.metadata.stats,
          opened: currentOpened + 1,
          open_rate: currentSent > 0 ? `${Math.round(((currentOpened + 1) / currentSent) * 100)}%` : '0%'
        }
        
        await updateCampaignStatus(campaignId, campaign.metadata.status.value as any, updatedStats)
        console.log(`📖 Email opened for campaign ${campaignId} by ${email}`)
      }
    } catch (error) {
      console.error('Error tracking email open:', error)
    }
  }
  
  return new NextResponse(pixelBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
}