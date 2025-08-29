// app/api/campaigns/[id]/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaign, getEmailContacts, updateCampaignStatus, cosmic } from '@/lib/cosmic'
import { sendEmail } from '@/lib/resend'
import { injectEmailTracking, personalizeEmailContent } from '@/lib/email-tracking'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    console.log(`Starting campaign send for ID: ${id}`)
    
    // Get the campaign with full template data
    const campaign = await getMarketingCampaign(id)
    if (!campaign) {
      console.error(`Campaign not found: ${id}`)
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    console.log(`Campaign found: ${campaign.title}`)
    console.log(`Campaign status: ${campaign.metadata?.status?.value}`)
    console.log(`Target contacts: ${campaign.metadata?.target_contacts?.length || 0}`)

    // Validate campaign status
    if (campaign.metadata?.status?.value !== 'Draft' && campaign.metadata?.status?.value !== 'Scheduled') {
      return NextResponse.json(
        { error: 'Campaign can only be sent from Draft or Scheduled status' },
        { status: 400 }
      )
    }

    // Get the template
    const templateId = campaign.metadata?.template_id || 
                     (typeof campaign.metadata?.template === 'object' ? campaign.metadata.template.id : campaign.metadata?.template)
    
    if (!templateId) {
      console.error('No template ID found in campaign')
      return NextResponse.json(
        { error: 'Campaign template not found' },
        { status: 400 }
      )
    }

    console.log(`Template ID: ${templateId}`)
    
    // Get template details
    const { object: template } = await cosmic.objects.findOne({
      id: templateId,
      type: 'email-templates'
    }).props(['id', 'metadata'])

    if (!template) {
      console.error(`Template not found: ${templateId}`)
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 400 }
      )
    }

    console.log(`Template found: ${template.metadata?.name}`)

    // Get all contacts if we need to resolve contact IDs
    const allContacts = await getEmailContacts()
    
    // Get target contacts
    let targetContacts = []
    if (campaign.metadata?.target_contacts && campaign.metadata.target_contacts.length > 0) {
      // Handle both contact objects and contact IDs
      targetContacts = campaign.metadata.target_contacts
        .map(contact => {
          if (typeof contact === 'string') {
            // Contact ID - find the full contact object
            return allContacts.find(c => c.id === contact)
          }
          return contact // Already a contact object
        })
        .filter(Boolean) // Remove any undefined contacts
    } else {
      console.log('No target contacts specified')
      return NextResponse.json(
        { error: 'No target contacts specified' },
        { status: 400 }
      )
    }

    console.log(`Resolved ${targetContacts.length} target contacts`)

    // Filter active contacts only
    const activeContacts = targetContacts.filter(contact => 
      contact?.metadata?.status?.value === 'Active'
    )

    console.log(`${activeContacts.length} active contacts to send to`)

    if (activeContacts.length === 0) {
      return NextResponse.json(
        { error: 'No active contacts to send to' },
        { status: 400 }
      )
    }

    // Get base URL for tracking
    const baseUrl = request.nextUrl.origin

    // Send emails to all active contacts
    const sendResults = []
    let successCount = 0
    let errorCount = 0

    for (const contact of activeContacts) {
      try {
        console.log(`Sending to: ${contact.metadata?.email}`)
        
        // Personalize email content
        let personalizedContent = personalizeEmailContent(
          template.metadata?.content || '',
          contact,
          campaign.id,
          baseUrl
        )

        // Inject tracking elements
        const trackedContent = injectEmailTracking(
          personalizedContent,
          campaign.id,
          contact.id,
          baseUrl
        )

        // Send email
        const result = await sendEmail({
          to: contact.metadata?.email || '',
          subject: template.metadata?.subject || '',
          html: trackedContent,
        })

        sendResults.push({
          email: contact.metadata?.email,
          success: true,
          messageId: result.data?.id,
        })
        successCount++
        
        console.log(`Successfully sent to: ${contact.metadata?.email}`)
      } catch (error) {
        console.error(`Error sending to ${contact.metadata?.email}:`, error)
        sendResults.push({
          email: contact.metadata?.email,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        errorCount++
      }
    }

    console.log(`Send complete. Success: ${successCount}, Errors: ${errorCount}`)

    // Update campaign status and stats
    const updatedStats = {
      sent: successCount,
      delivered: successCount, // Assume delivered for now
      opened: 0,
      clicked: 0,
      bounced: errorCount,
      unsubscribed: 0,
      open_rate: '0%',
      click_rate: '0%'
    }

    // Update campaign with new status and stats
    await updateCampaignStatus(campaign.id, 'Sent', updatedStats)
    
    // Also initialize tracking arrays
    await cosmic.objects.updateOne(campaign.id, {
      metadata: {
        opened_contacts: [],
        clicked_contacts: [],
        sent_at: new Date().toISOString()
      }
    })

    console.log('Campaign updated with send results')

    return NextResponse.json({
      success: true,
      message: `Campaign sent successfully to ${successCount} contacts`,
      stats: {
        total: activeContacts.length,
        sent: successCount,
        failed: errorCount,
      },
      results: sendResults
    })

  } catch (error) {
    console.error('Campaign send error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to send campaign',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}