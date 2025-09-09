import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'
import { sendEmail } from '@/lib/resend'
import { MarketingCampaign, EmailContact, EmailTemplate, TemplateSnapshot } from '@/types'

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting campaign send cron job...')
    
    // Get current date in YYYY-MM-DD format
    const today = new Date()
    const todayDate = today.toISOString().split('T')[0]
    
    // Safety check for todayDate
    if (!todayDate) {
      console.error('❌ Failed to generate today date')
      return NextResponse.json({ error: 'Failed to generate current date' }, { status: 500 })
    }

    console.log(`📅 Looking for campaigns scheduled for: ${todayDate}`)

    // Find campaigns that are scheduled to be sent today
    const { objects: scheduledCampaigns } = await cosmic.objects
      .find({
        type: 'marketing-campaigns',
        'metadata.status.value': 'Scheduled',
        'metadata.send_date': todayDate
      })
      .props(['id', 'title', 'metadata'])
      .depth(1)

    console.log(`📊 Found ${scheduledCampaigns.length} scheduled campaigns`)

    if (scheduledCampaigns.length === 0) {
      return NextResponse.json({ 
        message: 'No campaigns scheduled for today',
        scheduledCount: 0,
        processedCount: 0
      })
    }

    const results = []

    // Process each scheduled campaign
    for (const campaign of scheduledCampaigns as MarketingCampaign[]) {
      try {
        console.log(`🎯 Processing campaign: ${campaign.title}`)
        
        // Update campaign status to "Sending"
        await cosmic.objects.updateOne(campaign.id, {
          metadata: {
            status: {
              key: 'sending',
              value: 'Sending'
            }
          }
        })

        // Get the template
        let template: EmailTemplate | null = null
        if (typeof campaign.metadata.template === 'string') {
          const { object } = await cosmic.objects.findOne({
            id: campaign.metadata.template
          }).props(['id', 'title', 'metadata']).depth(1)
          template = object as EmailTemplate
        } else if (campaign.metadata.template && typeof campaign.metadata.template === 'object') {
          template = campaign.metadata.template as EmailTemplate
        }

        if (!template) {
          console.error(`❌ Template not found for campaign: ${campaign.title}`)
          await cosmic.objects.updateOne(campaign.id, {
            metadata: {
              status: {
                key: 'cancelled',
                value: 'Cancelled'
              }
            }
          })
          continue
        }

        // Create template snapshot
        const templateSnapshot: TemplateSnapshot = {
          name: template.metadata.name,
          subject: template.metadata.subject,
          content: template.metadata.content,
          template_type: template.metadata.template_type,
          snapshot_date: new Date().toISOString(),
          original_template_id: template.id
        }

        // Get target contacts
        let targetContacts: EmailContact[] = []
        
        // Get contacts by IDs if specified
        if (campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0) {
          const contactPromises = campaign.metadata.target_contacts.map(async (contactId) => {
            try {
              const { object } = await cosmic.objects.findOne({ id: contactId })
                .props(['id', 'title', 'metadata'])
                .depth(1)
              return object as EmailContact
            } catch (error) {
              console.warn(`⚠️ Contact not found: ${contactId}`)
              return null
            }
          })
          
          const contactResults = await Promise.all(contactPromises)
          targetContacts = contactResults.filter((contact): contact is EmailContact => contact !== null)
        }

        // Get contacts by tags if specified
        if (campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0) {
          // Note: This is a simplified approach. In production, you might want more sophisticated tag matching
          for (const tag of campaign.metadata.target_tags) {
            try {
              const { objects: taggedContacts } = await cosmic.objects
                .find({
                  type: 'email-contacts',
                  'metadata.tags': tag
                })
                .props(['id', 'title', 'metadata'])
                .depth(1)
              
              // Add contacts that aren't already in the list
              taggedContacts.forEach(contact => {
                const typedContact = contact as EmailContact
                if (!targetContacts.find(c => c.id === typedContact.id)) {
                  targetContacts.push(typedContact)
                }
              })
            } catch (error) {
              console.warn(`⚠️ Error fetching contacts for tag: ${tag}`, error)
            }
          }
        }

        // Filter only active contacts
        const activeContacts = targetContacts.filter(contact => 
          contact.metadata.status.value === 'Active'
        )

        console.log(`📧 Sending to ${activeContacts.length} active contacts`)

        if (activeContacts.length === 0) {
          console.log(`⚠️ No active contacts found for campaign: ${campaign.title}`)
          await cosmic.objects.updateOne(campaign.id, {
            metadata: {
              status: {
                key: 'cancelled',
                value: 'Cancelled'
              },
              template_snapshot: templateSnapshot
            }
          })
          results.push({
            campaignId: campaign.id,
            campaignName: campaign.title,
            status: 'cancelled',
            reason: 'No active contacts'
          })
          continue
        }

        // Send emails in batches to avoid overwhelming the email service
        const batchSize = 50
        const batches = []
        for (let i = 0; i < activeContacts.length; i += batchSize) {
          batches.push(activeContacts.slice(i, i + batchSize))
        }

        let totalSent = 0
        let totalFailed = 0

        // Process each batch
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i]
          
          // Safety check for batch
          if (!batch) {
            console.error(`❌ Batch ${i} is undefined`)
            continue
          }

          console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} contacts)`)

          // Send emails to this batch
          const batchPromises = batch.map(async (contact) => {
            try {
              await sendEmail({
                to: contact.metadata.email,
                subject: template.metadata.subject,
                html: template.metadata.content,
                from_name: 'Email Marketing',
                from_email: 'noreply@example.com'
              })
              return { success: true, contactId: contact.id }
            } catch (error) {
              console.error(`❌ Failed to send email to ${contact.metadata.email}:`, error)
              return { success: false, contactId: contact.id, error }
            }
          })

          const batchResults = await Promise.all(batchPromises)
          const batchSent = batchResults.filter(r => r.success).length
          const batchFailed = batchResults.filter(r => !r.success).length

          totalSent += batchSent
          totalFailed += batchFailed

          console.log(`✅ Batch ${i + 1} completed: ${batchSent} sent, ${batchFailed} failed`)

          // Add a small delay between batches
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }

        // Update campaign with final results
        const finalStats = {
          sent: totalSent,
          delivered: totalSent, // Assuming all sent emails are delivered for now
          opened: 0,
          clicked: 0,
          bounced: totalFailed,
          unsubscribed: 0,
          open_rate: '0%',
          click_rate: '0%'
        }

        await cosmic.objects.updateOne(campaign.id, {
          metadata: {
            status: {
              key: 'sent',
              value: 'Sent'
            },
            stats: finalStats,
            template_snapshot: templateSnapshot
          }
        })

        console.log(`✅ Campaign completed: ${campaign.title} - ${totalSent} sent, ${totalFailed} failed`)

        results.push({
          campaignId: campaign.id,
          campaignName: campaign.title,
          status: 'sent',
          sent: totalSent,
          failed: totalFailed
        })

      } catch (error) {
        console.error(`❌ Error processing campaign ${campaign.title}:`, error)
        
        // Mark campaign as failed
        try {
          await cosmic.objects.updateOne(campaign.id, {
            metadata: {
              status: {
                key: 'cancelled',
                value: 'Cancelled'
              }
            }
          })
        } catch (updateError) {
          console.error(`❌ Failed to update campaign status:`, updateError)
        }

        results.push({
          campaignId: campaign.id,
          campaignName: campaign.title,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log('✅ Cron job completed')

    return NextResponse.json({
      message: 'Campaign send job completed',
      scheduledCount: scheduledCampaigns.length,
      processedCount: results.length,
      results
    })

  } catch (error) {
    console.error('❌ Error in campaign send cron job:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process scheduled campaigns',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Also handle POST requests for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}