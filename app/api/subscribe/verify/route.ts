import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'
import { sendEmail } from '@/lib/resend'
import { getSettings } from '@/lib/cosmic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')
    const email = searchParams.get('email')

    // Validate required parameters
    if (!token || !email) {
      return NextResponse.redirect(
        new URL('/subscribe?error=invalid_verification_link', request.url)
      )
    }

    // Find the contact by email
    const { objects } = await cosmic.objects
      .find({
        type: 'email-contacts',
        'metadata.email': email.toLowerCase().trim()
      })
      .props(['id', 'slug', 'metadata'])
      .limit(1)

    if (objects.length === 0) {
      return NextResponse.redirect(
        new URL('/subscribe?error=contact_not_found', request.url)
      )
    }

    const contact = objects[0]
    const status = contact.metadata?.status?.value || contact.metadata?.status

    // Check if already verified/active
    if (status === 'Active') {
      return NextResponse.redirect(
        new URL('/subscribe/verified?already_verified=true', request.url)
      )
    }

    // Verify the token matches
    if (contact.metadata.verification_token !== token) {
      return NextResponse.redirect(
        new URL('/subscribe?error=invalid_token', request.url)
      )
    }

    // Check if token has expired
    const expirationDate = new Date(contact.metadata.verification_token_expires)
    const now = new Date()
    
    if (now > expirationDate) {
      return NextResponse.redirect(
        new URL('/subscribe?error=token_expired', request.url)
      )
    }

    // Update contact to Active status and remove verification token
    await cosmic.objects.updateOne(contact.id, {
      metadata: {
        status: {
          key: 'active',
          value: 'Active'
        },
        verification_token: '',
        verification_token_expires: '',
        verified_at: new Date().toISOString(),
        // Update tags to reflect verification
        tags: (contact.metadata.tags || [])
          .filter((tag: string) => tag !== 'Awaiting Verification')
          .concat(['Email Verified'])
      }
    })

    console.log(`✓ Email verified for ${email}`)

    // Send welcome email now that they're verified
    try {
      const settings = await getSettings()
      if (settings && settings.metadata.from_name && settings.metadata.from_email) {
        const fromEmail = `${settings.metadata.from_name} <${settings.metadata.from_email}>`
        const subscriberName = contact.metadata.first_name || 'there'
        const companyName = settings.metadata.company_name || settings.metadata.from_name || 'Our Team'
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        const welcomeSubject = `Welcome to ${companyName}! 🎉`
        const welcomeContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: ${settings.metadata.primary_brand_color || '#3b82f6'}; margin: 0; font-size: 28px;">
                Welcome to ${companyName}!
              </h1>
            </div>
            
            <div style="background-color: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
              <p style="color: #166534; margin: 0; font-size: 16px;">
                <strong>✓ Your email has been verified!</strong><br>
                You're now subscribed and will receive our updates.
              </p>
            </div>
            
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #1e293b; margin-top: 0;">Hi ${subscriberName},</h2>
              
              <p style="color: #475569; line-height: 1.6; margin-bottom: 16px;">
                Thank you for confirming your subscription! We're excited to have you as part of our community.
              </p>
              
              <p style="color: #475569; line-height: 1.6; margin-bottom: 16px;">
                You'll receive updates about our latest content, exclusive offers, and valuable insights directly in your inbox.
              </p>
              
              <div style="background-color: #ffffff; border-left: 4px solid ${settings.metadata.primary_brand_color || '#3b82f6'}; padding: 16px; margin: 20px 0;">
                <h3 style="color: #1e293b; margin: 0 0 8px 0; font-size: 16px;">What to expect:</h3>
                <ul style="color: #475569; margin: 0; padding-left: 20px;">
                  <li>Regular updates with valuable content</li>
                  <li>Exclusive subscriber-only offers</li>
                  <li>Tips and insights from our team</li>
                  <li>No spam - we respect your inbox</li>
                </ul>
              </div>
            </div>
            
            ${settings.metadata.website_url ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${settings.metadata.website_url}" 
                 style="background-color: ${settings.metadata.primary_brand_color || '#3b82f6'}; 
                        color: white; 
                        padding: 12px 24px; 
                        text-decoration: none; 
                        border-radius: 6px; 
                        font-weight: 500;
                        display: inline-block;">
                Visit Our Website
              </a>
            </div>
            ` : ''}
            
            <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; text-align: center;">
              <p style="color: #64748b; font-size: 14px; margin: 0 0 10px 0;">
                You received this email because you verified your subscription to our mailing list.
              </p>
              <p style="color: #64748b; font-size: 12px; margin: 0;">
                If you no longer wish to receive these emails, you can 
                <a href="${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}" 
                   style="color: #64748b; text-decoration: underline;">unsubscribe here</a>.
              </p>
              ${settings.metadata.company_address ? `
              <p style="color: #94a3b8; font-size: 11px; margin: 10px 0 0 0;">
                ${settings.metadata.company_address.replace(/\n/g, '<br>')}
              </p>
              ` : ''}
            </div>
          </div>
        `

        await sendEmail({
          from: fromEmail,
          to: email,
          subject: welcomeSubject,
          html: welcomeContent,
          reply_to: settings.metadata.reply_to_email || settings.metadata.from_email,
          headers: {
            'X-Email-Type': 'welcome-email',
            'X-Subscriber-Email': email,
            'X-Verification-Status': 'verified'
          }
        })

        console.log(`✓ Welcome email sent to ${email}`)
      }
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError)
      // Don't fail the verification if welcome email fails
    }

    // Redirect to success page
    return NextResponse.redirect(
      new URL('/subscribe/verified?success=true', request.url)
    )
  } catch (error) {
    console.error('Error verifying email:', error)
    return NextResponse.redirect(
      new URL('/subscribe?error=verification_failed', request.url)
    )
  }
}

