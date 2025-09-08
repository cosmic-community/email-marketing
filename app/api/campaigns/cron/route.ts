import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaigns, updateCampaignStatus, getEmailTemplate, getEmailContacts } from '@/lib/cosmic'
import { sendBulkEmails } from '@/lib/resend'
import { replaceEmailVariables } from '@/lib/email-tracking'

export async function GET(request: NextRequest) {
  try {
    console.log('🕐 Cron job started:', new Date().toISOString())
    
    // Verify this is a cron request (optional security check)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.log('❌ Unauthorized cron request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all campaigns
    const campaigns = await getMarketingCampaigns()
    console.log(`📧 Found ${campaigns.length} total campaigns`)

    let processedCount = 0
    let sentCount = 0
    let errorCount = 0

    for (const campaign of campaigns) {
      try {
        const status = campaign.metadata.status?.value
        const sendDate = campaign.metadata.send_date
        
        console.log(`🔍 Processing campaign: ${campaign.metadata.name} (Status: ${status})`)

        // Skip if not scheduled
        if (status !== 'Scheduled') {
          console.log(`⏭️ Skipping campaign ${campaign.metadata.name} - not scheduled (status: ${status})`)
          continue
        }

        // Skip if no send date
        if (!sendDate) {
          console.log(`⏭️ Skipping campaign ${campaign.metadata.name} - no send date`)
          continue
        }

        // Check if it's time to send
        const scheduledTime = new Date(sendDate)
        const now = new Date()
        
        if (scheduledTime > now) {
          console.log(`⏰ Campaign ${campaign.metadata.name} scheduled for ${scheduledTime.toISOString()}, current time: ${now.toISOString()}`)
          continue
        }

        console.log(`🚀 Processing scheduled campaign: ${campaign.metadata.name}`)
        processedCount++

        // Update status to "Sending"
        await updateCampaignStatus(campaign.id, 'Sending')

        // Get template
        const templateId = campaign.metadata.template_id || 
                          (typeof campaign.metadata.template === 'object' ? campaign.metadata.template.id : campaign.metadata.template)
        
        if (!templateId) {
          console.error(`❌ No template ID found for campaign ${campaign.metadata.name}`)
          await updateCampaignStatus(campaign.id, 'Draft')
          errorCount++
          continue
        }

        const template = await getEmailTemplate(templateId)
        if (!template) {
          console.error(`❌ Template not found for campaign ${campaign.metadata.name}`)
          await updateCampaignStatus(campaign.id, 'Draft')
          errorCount++
          continue
        }

        // Get all contacts
        const allContacts = await getEmailContacts()
        
        // Filter recipients
        let recipients: any[] = []
        
        if (campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0) {
          // Target specific contacts
          const targetContactIds = campaign.metadata.target_contacts.map(contact => 
            typeof contact === 'string' ? contact : contact.id
          )
          
          recipients = allContacts.filter(contact => 
            targetContactIds.includes(contact.id) &&
            contact.metadata.status?.value === 'Active'
          )
        } else if (campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0) {
          // Target by tags
          recipients = allContacts.filter(contact => {
            if (contact.metadata.status?.value !== 'Active') return false
            if (!contact.metadata.tags || !Array.isArray(contact.metadata.tags)) return false
            
            return campaign.metadata.target_tags!.some(tag => 
              contact.metadata.tags!.includes(tag)
            )
          })
        }

        if (recipients.length === 0) {
          console.log(`⚠️ No active recipients found for campaign ${campaign.metadata.name}`)
          await updateCampaignStatus(campaign.id, 'Draft')
          continue
        }

        console.log(`📬 Sending to ${recipients.length} recipients for campaign ${campaign.metadata.name}`)

        // Create template snapshot for sent campaign
        const templateSnapshot = {
          name: template.metadata.name,
          subject: template.metadata.subject,
          content: template.metadata.content,
          template_type: template.metadata.template_type,
          snapshot_date: new Date().toISOString(),
          original_template_id: template.id
        }

        // Batch processing settings
        const batchSize = campaign.metadata.batch_size || 50
        const batchDelay = (campaign.metadata.batch_delay_minutes || 5) * 60 * 1000 // Convert to milliseconds

        let totalSent = 0
        let totalDelivered = 0
        let totalBounced = 0
        const batches = Math.ceil(recipients.length / batchSize)

        console.log(`📦 Processing ${batches} batch(es) of ${batchSize} recipients each`)

        // Process in batches
        for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
          const start = batchIndex * batchSize
          const end = Math.min(start + batchSize, recipients.length)
          const batchRecipients = recipients.slice(start, end)

          console.log(`📤 Sending batch ${batchIndex + 1}/${batches} (${batchRecipients.length} recipients)`)

          try {
            // Prepare emails for this batch
            const emails = batchRecipients.map(contact => {
              const personalizedContent = replaceEmailVariables(template.metadata.content, {
                first_name: contact.metadata.first_name,
                last_name: contact.metadata.last_name || '',
                email: contact.metadata.email,
                unsubscribe_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(contact.metadata.email)}`
              })

              const personalizedSubject = replaceEmailVariables(template.metadata.subject, {
                first_name: contact.metadata.first_name,
                last_name: contact.metadata.last_name || '',
                email: contact.metadata.email
              })

              return {
                to: [contact.metadata.email],
                subject: personalizedSubject,
                html: personalizedContent
              }
            })

            // Send batch
            const batchResults = await sendBulkEmails(emails)
            
            // Count results
            totalSent += batchResults.successful.length
            totalDelivered += batchResults.successful.length // Assume successful sends are delivered for now
            totalBounced += batchResults.failed.length

            console.log(`✅ Batch ${batchIndex + 1} complete: ${batchResults.successful.length} sent, ${batchResults.failed.length} failed`)

            // Update campaign with current progress
            const currentStats = {
              sent: totalSent,
              delivered: totalDelivered,
              opened: 0,
              clicked: 0,
              bounced: totalBounced,
              unsubscribed: 0,
              open_rate: '0%',
              click_rate: '0%'
            }

            await updateCampaignStatus(campaign.id, batches > 1 && batchIndex < batches - 1 ? 'Sending' : 'Sent', currentStats, templateSnapshot)

            // Add delay between batches (except for the last batch)
            if (batchIndex < batches - 1 && batchDelay > 0) {
              console.log(`⏳ Waiting ${batchDelay / 1000}s before next batch...`)
              await new Promise(resolve => setTimeout(resolve, batchDelay))
            }

          } catch (batchError) {
            console.error(`❌ Error in batch ${batchIndex + 1}:`, batchError)
            // Continue with next batch, but log the error
          }
        }

        // Final stats update
        const finalStats = {
          sent: totalSent,
          delivered: totalDelivered,
          opened: 0,
          clicked: 0,
          bounced: totalBounced,
          unsubscribed: 0,
          open_rate: '0%',
          click_rate: '0%'
        }

        await updateCampaignStatus(campaign.id, 'Sent', finalStats, templateSnapshot)

        console.log(`✅ Campaign ${campaign.metadata.name} sent successfully to ${totalSent}/${recipients.length} recipients`)
        sentCount++

      } catch (campaignError) {
        console.error(`❌ Error processing campaign ${campaign.metadata.name}:`, campaignError)
        
        // Try to update campaign status to indicate error
        try {
          await updateCampaignStatus(campaign.id, 'Draft')
        } catch (statusUpdateError) {
          console.error('Failed to update campaign status after error:', statusUpdateError)
        }
        
        errorCount++
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      totalCampaigns: campaigns.length,
      processedCampaigns: processedCount,
      sentCampaigns: sentCount,
      errorCampaigns: errorCount,
      message: `Cron job completed successfully. Processed ${processedCount} campaigns, sent ${sentCount}, ${errorCount} errors.`
    }

    console.log('🎯 Cron job completed:', summary)

    return NextResponse.json(summary)

  } catch (error) {
    console.error('💥 Fatal cron job error:', error)
    
    return NextResponse.json({
      error: 'Cron job failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Also handle POST requests for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}