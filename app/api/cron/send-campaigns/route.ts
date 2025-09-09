import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaigns, updateCampaignStatus, getEmailContacts, updateCampaignProgress } from '@/lib/cosmic'
import { resend } from '@/lib/resend'
import { EmailContact } from '@/types'

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting campaign send job...')
    
    // Verify authorization (simple check for cron job)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('❌ Unauthorized cron request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all campaigns that are in 'Scheduled' status and ready to send
    const campaigns = await getMarketingCampaigns()
    const now = new Date()
    const todayDate = now.toISOString().split('T')[0]
    
    const campaignsToSend = campaigns.filter(campaign => {
      const isScheduled = campaign.metadata.status.value === 'Scheduled'
      const sendDate = campaign.metadata.send_date
      const isReadyToSend = sendDate && sendDate <= todayDate
      
      console.log(`Campaign ${campaign.title}: status=${campaign.metadata.status.value}, sendDate=${sendDate}, isReadyToSend=${isReadyToSend}`)
      
      return isScheduled && isReadyToSend
    })

    console.log(`📊 Found ${campaignsToSend.length} campaigns ready to send`)

    if (campaignsToSend.length === 0) {
      return NextResponse.json({ 
        message: 'No campaigns ready to send',
        processed: 0
      })
    }

    const results = []

    for (const campaign of campaignsToSend) {
      console.log(`📧 Processing campaign: ${campaign.title}`)
      
      try {
        // Update status to 'Sending'
        await updateCampaignStatus(campaign.id, 'Sending')
        
        // Get all contacts for this campaign - FIX: Extract contacts array from paginated response
        const contactsResponse = await getEmailContacts()
        const allContacts = contactsResponse.contacts // Extract the contacts array
        
        // Filter contacts based on campaign targeting
        let targetContacts: EmailContact[] = []
        
        // If specific contacts are targeted
        if (campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0) {
          targetContacts = allContacts.filter((contact: EmailContact) => 
            campaign.metadata.target_contacts?.includes(contact.id)
          )
        }
        
        // If targeting by tags
        if (campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0) {
          const tagFilteredContacts = allContacts.filter((contact: EmailContact) => {
            const contactTags = contact.metadata.tags || []
            return campaign.metadata.target_tags?.some(tag => contactTags.includes(tag))
          })
          
          // Combine with existing target contacts (union)
          const targetIds = new Set(targetContacts.map(c => c.id))
          tagFilteredContacts.forEach(contact => {
            if (!targetIds.has(contact.id)) {
              targetContacts.push(contact)
            }
          })
        }
        
        // If no specific targeting, send to all active contacts
        if ((!campaign.metadata.target_contacts || campaign.metadata.target_contacts.length === 0) &&
            (!campaign.metadata.target_tags || campaign.metadata.target_tags.length === 0)) {
          targetContacts = allContacts.filter((contact: EmailContact) => 
            contact.metadata.status.value === 'Active'
          )
        }

        console.log(`👥 Target contacts for campaign ${campaign.title}: ${targetContacts.length}`)

        if (targetContacts.length === 0) {
          console.log(`⚠️ No target contacts found for campaign ${campaign.title}`)
          await updateCampaignStatus(campaign.id, 'Cancelled')
          results.push({
            campaignId: campaign.id,
            success: false,
            error: 'No target contacts found',
            sent: 0
          })
          continue
        }

        // Send emails in batches to avoid overwhelming the email service
        const batchSize = 50
        let totalSent = 0
        let totalFailed = 0
        const batches = []
        
        for (let i = 0; i < targetContacts.length; i += batchSize) {
          batches.push(targetContacts.slice(i, i + batchSize))
        }

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex]
          console.log(`📤 Sending batch ${batchIndex + 1}/${batches.length} (${batch.length} emails)`)
          
          const batchPromises = batch.map(async (contact) => {
            try {
              // Get template content (assuming template is populated)
              const template = campaign.metadata.template
              if (!template || typeof template !== 'object') {
                throw new Error('Campaign template not found or invalid')
              }

              // Send email using Resend
              await resend.emails.send({
                from: process.env.EMAIL_FROM || 'noreply@example.com',
                to: [contact.metadata.email],
                subject: template.metadata.subject,
                html: template.metadata.content,
                headers: {
                  'X-Campaign-ID': campaign.id,
                  'X-Contact-ID': contact.id
                }
              })

              console.log(`✅ Sent email to ${contact.metadata.email}`)
              return { success: true, contact: contact.metadata.email }
            } catch (error) {
              console.error(`❌ Failed to send email to ${contact.metadata.email}:`, error)
              return { success: false, contact: contact.metadata.email, error }
            }
          })

          const batchResults = await Promise.allSettled(batchPromises)
          
          // Count results
          const batchSent = batchResults.filter(result => 
            result.status === 'fulfilled' && result.value.success
          ).length
          const batchFailed = batchResults.length - batchSent
          
          totalSent += batchSent
          totalFailed += batchFailed

          console.log(`📊 Batch ${batchIndex + 1} complete: ${batchSent} sent, ${batchFailed} failed`)

          // Update campaign progress
          const progressPercentage = Math.round(((batchIndex + 1) / batches.length) * 100)
          await updateCampaignProgress(campaign.id, {
            sent: totalSent,
            failed: totalFailed,
            total: targetContacts.length,
            progress_percentage: progressPercentage,
            last_batch_completed: new Date().toISOString()
          })

          // Add delay between batches to respect rate limits
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay
          }
        }

        // Update final campaign status and stats
        const finalStats = {
          sent: totalSent,
          delivered: totalSent, // Assume delivered = sent for now
          opened: 0,
          clicked: 0,
          bounced: totalFailed,
          unsubscribed: 0,
          open_rate: '0%',
          click_rate: '0%'
        }

        await updateCampaignStatus(campaign.id, 'Sent', finalStats)

        console.log(`🎉 Campaign ${campaign.title} completed: ${totalSent} sent, ${totalFailed} failed`)

        results.push({
          campaignId: campaign.id,
          success: true,
          sent: totalSent,
          failed: totalFailed
        })

      } catch (error) {
        console.error(`❌ Error processing campaign ${campaign.title}:`, error)
        
        // Update campaign status to cancelled on error
        await updateCampaignStatus(campaign.id, 'Cancelled')
        
        results.push({
          campaignId: campaign.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          sent: 0
        })
      }
    }

    console.log(`✅ Campaign send job completed. Processed ${results.length} campaigns`)

    return NextResponse.json({
      message: 'Campaign send job completed',
      processed: results.length,
      results
    })

  } catch (error) {
    console.error('❌ Campaign send job failed:', error)
    return NextResponse.json(
      { error: 'Campaign send job failed' },
      { status: 500 }
    )
  }
}