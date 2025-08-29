// app/api/campaigns/[id]/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaign, getEmailTemplate, getEmailContacts, updateCampaignStatus, getSettings } from '@/lib/cosmic'
import { sendBulkEmail } from '@/lib/resend'
import { EmailContact } from '@/types'

interface ContactWithMetadata {
  id: string;
  metadata: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

export async function POST(
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

    // Get campaign details
    console.log(`Fetching campaign: ${id}`)
    const campaign = await getMarketingCampaign(id)
    
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    console.log(`Campaign found: ${campaign.metadata?.name}`)

    // Check if campaign is already sent
    if (campaign.metadata?.status?.value === 'Sent') {
      return NextResponse.json(
        { error: 'Campaign has already been sent' },
        { status: 400 }
      )
    }

    // Get template details
    const templateId = campaign.metadata?.template_id || (campaign.metadata?.template as any)?.id
    if (!templateId) {
      return NextResponse.json(
        { error: 'No template associated with this campaign' },
        { status: 400 }
      )
    }

    console.log(`Fetching template: ${templateId}`)
    const template = await getEmailTemplate(templateId)
    
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    console.log(`Template found: ${template.metadata?.name}`)

    // Get contacts to send to
    let targetContacts: EmailContact[] = []
    
    // If campaign has specific contact IDs, use those
    if (campaign.metadata?.target_contacts && Array.isArray(campaign.metadata.target_contacts)) {
      console.log(`Campaign has ${campaign.metadata.target_contacts.length} target contacts`)
      
      // Handle case where target_contacts might be an array of IDs or objects
      const contactIds: string[] = []
      
      for (const contactRef of campaign.metadata.target_contacts) {
        if (typeof contactRef === 'string') {
          // It's a contact ID
          contactIds.push(contactRef)
        } else if (contactRef && typeof contactRef === 'object' && 'id' in contactRef) {
          // It's a contact object
          contactIds.push(contactRef.id)
        }
      }
      
      console.log(`Extracted contact IDs: ${contactIds.join(', ')}`)
      
      // Fetch all contacts and filter by IDs
      const allContacts = await getEmailContacts()
      targetContacts = allContacts.filter(contact => contactIds.includes(contact.id))
      
      console.log(`Found ${targetContacts.length} matching contacts`)
    } else {
      // If no specific contacts, get all active contacts
      console.log('No specific contacts, fetching all active contacts')
      const allContacts = await getEmailContacts()
      targetContacts = allContacts.filter(contact => 
        contact.metadata?.status?.value === 'Active'
      )
      console.log(`Found ${targetContacts.length} active contacts`)
    }

    if (targetContacts.length === 0) {
      return NextResponse.json(
        { error: 'No valid contacts found to send to' },
        { status: 400 }
      )
    }

    // Get settings for sender info
    const settings = await getSettings()
    if (!settings) {
      return NextResponse.json(
        { error: 'Email settings not configured' },
        { status: 400 }
      )
    }

    // Prepare emails for sending
    const emailsToSend = []
    let sentCount = 0
    let failedCount = 0

    console.log(`Preparing ${targetContacts.length} emails...`)

    for (const contact of targetContacts) {
      // Validate contact has required data
      if (!contact || !contact.metadata?.email) {
        console.log(`Skipping contact - missing email data`)
        failedCount++
        continue
      }

      // Personalize template content
      let personalizedContent = template.metadata?.content || ''
      let personalizedSubject = template.metadata?.subject || ''
      
      // Replace placeholders with contact data
      const firstName = contact.metadata.first_name || 'there'
      const lastName = contact.metadata.last_name || ''
      const fullName = `${firstName} ${lastName}`.trim()
      
      personalizedContent = personalizedContent
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{last_name\}\}/g, lastName)
        .replace(/\{\{full_name\}\}/g, fullName)
        .replace(/\{\{email\}\}/g, contact.metadata.email)
      
      personalizedSubject = personalizedSubject
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{last_name\}\}/g, lastName)
        .replace(/\{\{full_name\}\}/g, fullName)

      emailsToSend.push({
        to: contact.metadata.email,
        subject: personalizedSubject,
        html: personalizedContent,
        contactId: contact.id
      })
    }

    console.log(`Sending ${emailsToSend.length} emails...`)

    // Send emails using Resend
    try {
      const sendResult = await sendBulkEmail({
        from: `${settings.metadata?.from_name} <${settings.metadata?.from_email}>`,
        replyTo: settings.metadata?.reply_to_email || settings.metadata?.from_email,
        emails: emailsToSend,
        campaignId: id
      })

      sentCount = sendResult.successful.length
      failedCount = sendResult.failed.length

      console.log(`Email sending complete: ${sentCount} sent, ${failedCount} failed`)
    } catch (sendError) {
      console.error('Error sending emails:', sendError)
      return NextResponse.json(
        { error: 'Failed to send emails' },
        { status: 500 }
      )
    }

    // Update campaign status and stats
    const stats = {
      sent: sentCount,
      delivered: sentCount, // Assume delivered equals sent for now
      opened: 0,
      clicked: 0,
      bounced: failedCount,
      unsubscribed: 0,
      open_rate: '0%',
      click_rate: '0%'
    }

    await updateCampaignStatus(id, 'Sent', stats)

    console.log(`Campaign ${id} marked as sent with stats:`, stats)

    return NextResponse.json({
      success: true,
      message: 'Campaign sent successfully',
      stats: {
        total_contacts: targetContacts.length,
        sent: sentCount,
        failed: failedCount
      }
    })

  } catch (error) {
    console.error('Send campaign error:', error)
    return NextResponse.json(
      { error: 'Failed to send campaign' },
      { status: 500 }
    )
  }
}