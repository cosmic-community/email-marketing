import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaign, getSettings } from '@/lib/cosmic'
import { sendTestEmail } from '@/lib/resend'
import { addTrackingToEmail } from '@/lib/email-tracking'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { testEmails, testNote } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      )
    }

    if (!testEmails || !Array.isArray(testEmails) || testEmails.length === 0) {
      return NextResponse.json(
        { error: 'Test email addresses are required' },
        { status: 400 }
      )
    }

    // Get campaign details
    const campaign = await getMarketingCampaign(id)
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Get email template content
    const template = campaign.metadata?.template
    if (!template || !template.metadata) {
      return NextResponse.json(
        { error: 'Campaign template not found or invalid' },
        { status: 400 }
      )
    }

    // Get settings for email configuration
    const settings = await getSettings()
    if (!settings?.metadata) {
      return NextResponse.json(
        { error: 'Email settings not configured' },
        { status: 400 }
      )
    }

    // Get base URL for tracking
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

    // Personalize content for test (use sample data)
    let testContent = template.metadata.content
    testContent = testContent.replace(/\{\{first_name\}\}/g, 'Test User')

    let testSubject = template.metadata.subject
    testSubject = testSubject.replace(/\{\{first_name\}\}/g, 'Test User')

    // Add test banner to identify test emails
    const testBanner = `
      <div style="background-color: #f59e0b; color: white; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px;">
        🧪 TEST EMAIL - This is a test of your campaign "${campaign.title}"
        ${testNote ? `<br><small>${testNote}</small>` : ''}
      </div>
    `
    
    testContent = testBanner + testContent

    // Add click tracking (using first test email as contact ID for testing)
    const trackedContent = addTrackingToEmail(
      testContent,
      `test-${id}`, // Test campaign ID
      testEmails[0], // Use first email as contact ID for test tracking
      baseUrl
    )

    // Add unsubscribe footer with company address
    const companyAddress = settings.metadata.company_address
    const unsubscribeUrl = `${baseUrl}/api/unsubscribe?email=TEST_EMAIL&campaign=test-${id}`
    const unsubscribeFooter = `
      <div style="margin-top: 40px; padding: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
        <p style="margin: 0 0 10px 0;">
          This is a test email. You received this because you requested a test.
        </p>
        <p style="margin: 0 0 10px 0;">
          <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe link (test only)</a>
        </p>
        ${companyAddress ? `<p style="margin: 0; font-size: 11px;">${companyAddress.replace(/\n/g, '<br>')}</p>` : ''}
      </div>
    `

    const finalContent = trackedContent + unsubscribeFooter

    // Send test email - Fix TS2353: Remove 'from' property as it's not part of EmailData interface
    const result = await sendTestEmail({
      to: testEmails,
      subject: testSubject,
      html: finalContent,
      testNote
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send test email' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Test email sent successfully to ${testEmails.length} recipient(s)`,
      recipients: testEmails
    })

  } catch (error: any) {
    console.error('Test email error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to send test email',
        details: 'Check server logs for more information'
      },
      { status: 500 }
    )
  }
}