import { NextRequest, NextResponse } from 'next/server'

// Force dynamic route to prevent static generation issues
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaign')
    const contactId = searchParams.get('contact')
    const url = searchParams.get('url')

    console.log('Click tracking:', { campaignId, contactId, url })

    if (!campaignId || !contactId || !url) {
      console.error('Missing required parameters for click tracking')
      return NextResponse.redirect('https://cosmicjs.com')
    }

    // Here you would typically:
    // 1. Update campaign stats in Cosmic
    // 2. Log the click event
    // 3. Redirect to the target URL
    
    // For now, just redirect to the target URL
    return NextResponse.redirect(decodeURIComponent(url))
  } catch (error) {
    console.error('Error in click tracking:', error)
    // Redirect to a safe fallback URL on error
    return NextResponse.redirect('https://cosmicjs.com')
  }
}