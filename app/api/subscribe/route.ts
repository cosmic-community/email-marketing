import { NextRequest, NextResponse } from 'next/server'
import { createEmailContact, getSettings } from '@/lib/cosmic'
import { sendEmail } from '@/lib/resend'
import { validateBotProtection, isRateLimited } from '@/lib/bot-protection'
import { cosmic } from '@/lib/cosmic'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    
    // Check rate limiting first
    if (await isRateLimited(clientIP)) {
      return NextResponse.json(
        { error: 'Too many subscription attempts. Please wait before trying again.' },
        { status: 429 }
      )
    }
    
    // Validate required fields
    if (!body.email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      )
    }

    // Check if email is already subscribed
    try {
      const { objects } = await cosmic.objects
        .find({
          type: 'email-contacts',
          'metadata.email': body.email.toLowerCase().trim()
        })
        .props(['id', 'metadata.status'])
        .limit(1)

      if (objects.length > 0) {
        const existingContact = objects[0]
        const status = existingContact.metadata?.status?.value || existingContact.metadata?.status
        
        if (status === 'Active') {
          return NextResponse.json(
            { error: 'This email is already subscribed to our list' },
            { status: 409 }
          )
        } else if (status === 'Unsubscribed') {
          return NextResponse.json(
            { error: 'This email was previously unsubscribed. Please contact support to reactivate your subscription.' },
            { status: 409 }
          )
        }
      }
    } catch (duplicateCheckError) {
      // If duplicate check fails, log but continue (don't block subscription)
      console.warn('Duplicate email check failed:', duplicateCheckError)
    }

    // Advanced bot protection validation
    const botValidation = await validateBotProtection(body, request)
    if (!botValidation.isValid) {
      console.warn(`Bot detected from IP ${clientIP}:`, botValidation.reason)
      return NextResponse.json(
        { error: 'Automated submission detected. Please try again manually.' },
        { status: 400 }
      )
    }

    // Get settings for email configuration
    const settings = await getSettings()
    if (!settings || !settings.metadata.from_name || !settings.metadata.from_email) {
      return NextResponse.json(
        { error: 'Email system not configured. Please contact support.' },
        { status: 500 }
      )
    }

    // Generate a secure verification token
    const verificationToken = crypto.randomBytes(32).toString('hex')
    
    // Set token expiration to 24 hours from now
    const expirationDate = new Date()
    expirationDate.setHours(expirationDate.getHours() + 24)
    const verificationTokenExpires = expirationDate.toISOString()

    // Create the contact with PENDING status (requires email verification)
    const result = await createEmailContact({
      first_name: body.first_name || 'Subscriber',
      last_name: body.last_name || '',
      email: body.email,
      status: 'Pending', // Changed from 'Active' to require verification
      tags: ['Public Signup', 'Bot Protection Verified', 'Awaiting Verification', ...(body.tags || [])],
      subscribe_date: new Date().toISOString().split('T')[0],
      notes: `${body.source ? `Subscribed via: ${body.source}` : 'Public subscription'}. IP: ${clientIP}. Bot score: ${botValidation.score}/100. Awaiting email verification.`,
      verification_token: verificationToken,
      verification_token_expires: verificationTokenExpires
    })

    // Prepare email configuration
    const fromEmail = `${settings.metadata.from_name} <${settings.metadata.from_email}>`
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const subscriberName = body.first_name || 'there'
    const companyName = settings.metadata.company_name || settings.metadata.from_name || 'Our Team'

    // Send verification email to subscriber (Double Opt-In)
    const verificationUrl = `${baseUrl}/api/subscribe/verify?token=${verificationToken}&email=${encodeURIComponent(body.email)}`
    
    try {
      const confirmationSubject = `Please Verify Your Email - ${companyName}`
      const confirmationContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: ${settings.metadata.primary_brand_color || '#3b82f6'}; margin: 0; font-size: 28px;">
              Verify Your Email Address
            </h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #1e293b; margin-top: 0;">Hi ${subscriberName},</h2>
            
            <p style="color: #475569; line-height: 1.6; margin-bottom: 16px;">
              Thank you for subscribing to ${companyName}! To complete your subscription and start receiving our emails, please verify your email address.
            </p>
            
            <p style="color: #475569; line-height: 1.6; margin-bottom: 16px;">
              <strong>Why verify?</strong> This ensures we only send emails to people who genuinely want to hear from us and protects you from being signed up by someone else.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background-color: ${settings.metadata.primary_brand_color || '#3b82f6'}; 
                        color: white; 
                        padding: 16px 32px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: 600;
                        font-size: 16px;
                        display: inline-block;">
                ✓ Verify My Email Address
              </a>
            </div>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 20px 0;">
              <p style="color: #856404; margin: 0; font-size: 14px;">
                <strong>⏱ This link expires in 24 hours.</strong><br>
                Please verify your email soon to complete your subscription.
              </p>
            </div>
            
            <p style="color: #64748b; font-size: 14px; margin-top: 20px; line-height: 1.5;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${verificationUrl}" style="color: #3b82f6; word-break: break-all;">${verificationUrl}</a>
            </p>
          </div>
          
          <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h3 style="color: #0c4a6e; margin: 0 0 8px 0; font-size: 16px;">What to expect after verification:</h3>
            <ul style="color: #0c4a6e; margin: 0; padding-left: 20px; font-size: 14px;">
              <li>Regular updates with valuable content</li>
              <li>Exclusive subscriber-only offers</li>
              <li>Tips and insights from our team</li>
              <li>No spam - we respect your inbox</li>
            </ul>
          </div>
          
          <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 10px 0;">
              You received this email because someone (hopefully you!) subscribed to our mailing list.
            </p>
            <p style="color: #64748b; font-size: 12px; margin: 0;">
              If you didn't request this subscription, you can safely ignore this email. You won't be subscribed unless you click the verification button.
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
        to: body.email,
        subject: confirmationSubject,
        html: confirmationContent,
        reply_to: settings.metadata.reply_to_email || settings.metadata.from_email,
        headers: {
          'X-Email-Type': 'email-verification',
          'X-Subscriber-Email': body.email,
          'X-Bot-Protection': 'verified',
          'X-Verification-Token': verificationToken
        }
      })

      console.log(`✓ Verification email sent to ${body.email}`)
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError)
      // Don't fail the subscription if verification email fails
    }

    // Send notification email to company
    try {
      const notificationEmail = settings.metadata.support_email || settings.metadata.from_email
      const notificationSubject = `New Subscription (Pending Verification): ${body.email}`
      const notificationContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e293b; margin: 0; font-size: 24px;">
              New Email Subscription - Awaiting Verification
            </h1>
          </div>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              <strong>⏱ Status: Pending Email Verification</strong><br>
              This subscriber needs to verify their email address before becoming active and receiving campaigns.
            </p>
          </div>
          
          <div style="background-color: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #0c4a6e; margin-top: 0; font-size: 18px;">Subscriber Details</h2>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151; width: 120px;">Email:</td>
                <td style="padding: 8px 0; color: #1f2937;">${body.email}</td>
              </tr>
              ${body.first_name ? `
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151;">First Name:</td>
                <td style="padding: 8px 0; color: #1f2937;">${body.first_name}</td>
              </tr>
              ` : ''}
              ${body.last_name ? `
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151;">Last Name:</td>
                <td style="padding: 8px 0; color: #1f2937;">${body.last_name}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151;">Source:</td>
                <td style="padding: 8px 0; color: #1f2937;">${body.source || 'Public subscription'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151;">Date:</td>
                <td style="padding: 8px 0; color: #1f2937;">${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151;">IP Address:</td>
                <td style="padding: 8px 0; color: #1f2937;">${clientIP}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151;">Bot Score:</td>
                <td style="padding: 8px 0; color: #059669; font-weight: 500;">${botValidation.score}/100 (${botValidation.score >= 70 ? 'Human' : 'Suspicious'})</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151;">Status:</td>
                <td style="padding: 8px 0; color: #f59e0b; font-weight: 500;">Pending Verification</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 500; color: #374151;">Token Expires:</td>
                <td style="padding: 8px 0; color: #1f2937;">24 hours from now</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #fafafa; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
            <h3 style="color: #374151; margin: 0 0 8px 0; font-size: 16px;">Tags Applied:</h3>
            <span style="background-color: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">
              Public Signup
            </span>
            <span style="background-color: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; margin-left: 4px;">
              Bot Protection Verified
            </span>
            ${body.tags && body.tags.length > 0 ? body.tags.map((tag: string) => `
            <span style="background-color: #f3f4f6; color: #374151; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 4px;">
              ${tag}
            </span>
            `).join('') : ''}
          </div>
          
          <div style="text-align: center; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              The subscriber has been added with <strong>Pending</strong> status and sent a verification email. They will become <strong>Active</strong> once they verify their email address.
            </p>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 20px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              This is an automated notification from your email marketing system.
            </p>
          </div>
        </div>
      `

      await sendEmail({
        from: fromEmail,
        to: notificationEmail,
        subject: notificationSubject,
        html: notificationContent,
        reply_to: settings.metadata.reply_to_email || settings.metadata.from_email,
        headers: {
          'X-Email-Type': 'subscription-notification',
          'X-Subscriber-Email': body.email,
          'X-Notification-Type': 'new-subscription',
          'X-Bot-Protection': 'verified'
        }
      })

      console.log(`✓ Notification email sent to ${notificationEmail}`)
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError)
      // Don't fail the subscription if notification email fails
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Almost there! Please check your email and click the verification link to complete your subscription.',
      data: result 
    })
  } catch (error) {
    console.error('Error creating subscription:', error)
    
    // Check if it's a duplicate email error from createEmailContact
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = (error as Error).message
      if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        return NextResponse.json(
          { error: 'This email is already subscribed to our list' },
          { status: 409 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to process subscription. Please try again.' },
      { status: 500 }
    )
  }
}