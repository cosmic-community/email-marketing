import { NextRequest, NextResponse } from 'next/server'
import { getMarketingCampaigns, updateCampaignStatus, getEmailContacts, updateCampaignProgress } from '@/lib/cosmic'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(request: NextRequest) {
  try {
    // Check for cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Cron job started: Checking for campaigns to send')

    // Get campaigns that are scheduled for today or earlier and haven't been sent
    const campaigns = await getMarketingCampaigns()
    
    const today = new Date()
    const todayDate = today.toISOString().split('T')[0]
    
    // Add null check for todayDate
    if (!todayDate) {
      console.error('Failed to get today\'s date')
      return NextResponse.json({ error: 'Date processing error' }, { status: 500 })
    }

    const campaignsToSend = campaigns.filter(campaign => {
      const shouldSend = campaign.metadata.status.value === 'Scheduled' &&
        campaign.metadata.send_date &&
        campaign.metadata.send_date <= todayDate
      
      if (shouldSend) {
        console.log(`Campaign "${campaign.metadata.name}" scheduled for ${campaign.metadata.send_date}`)
      }
      
      return shouldSend
    })

    console.log(`Found ${campaignsToSend.length} campaigns to send`)

    let processedCampaigns = 0
    let totalEmailsSent = 0

    for (const campaign of campaignsToSend) {
      try {
        console.log(`Processing campaign: ${campaign.metadata.name}`)
        
        // Update status to "Sending"
        await updateCampaignStatus(campaign.id, 'Sending')
        
        // Get target contacts based on campaign targeting
        let targetContacts: any[] = []
        
        // Get contacts by IDs if specified
        if (campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0) {
          for (const contactId of campaign.metadata.target_contacts) {
            try {
              const contact = await getEmailContacts({ page: 1, limit: 1 })
              const foundContact = contact.contacts.find(c => c.id === contactId)
              if (foundContact) {
                targetContacts.push(foundContact)
              }
            } catch (error) {
              console.error(`Error fetching contact ${contactId}:`, error)
            }
          }
        }
        
        // Get contacts by tags if specified
        if (campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0) {
          const allContacts = await getEmailContacts({ page: 1, limit: 1000 }) // Get more contacts for tag filtering
          
          const taggedContacts = allContacts.contacts.filter(contact => {
            const contactTags = contact.metadata.tags || []
            return campaign.metadata.target_tags?.some(tag => contactTags.includes(tag))
          })
          
          // Merge with existing contacts, avoiding duplicates
          const existingIds = new Set(targetContacts.map(c => c.id))
          const newTaggedContacts = taggedContacts.filter(c => !existingIds.has(c.id))
          targetContacts = [...targetContacts, ...newTaggedContacts]
        }
        
        // Filter for active contacts only
        const activeContacts = targetContacts.filter(contact => 
          contact.metadata.status.value === 'Active'
        )
        
        console.log(`Found ${activeContacts.length} active contacts for campaign "${campaign.metadata.name}"`)
        
        if (activeContacts.length === 0) {
          console.log('No active contacts found, marking campaign as sent')
          await updateCampaignStatus(campaign.id, 'Sent', {
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            bounced: 0,
            unsubscribed: 0,
            open_rate: '0%',
            click_rate: '0%'
          })
          processedCampaigns++
          continue
        }
        
        // Send emails in batches to avoid rate limits
        const BATCH_SIZE = 10
        const batches = []
        for (let i = 0; i < activeContacts.length; i += BATCH_SIZE) {
          batches.push(activeContacts.slice(i, i + BATCH_SIZE))
        }
        
        console.log(`Sending emails in ${batches.length} batches of ${BATCH_SIZE}`)
        
        let sentCount = 0
        let failedCount = 0
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex]
          
          // Add null check for batch
          if (!batch || batch.length === 0) {
            console.log(`Skipping empty batch ${batchIndex}`)
            continue
          }
          
          console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} contacts`)
          
          // Send emails in parallel within the batch
          const emailPromises = batch.map(async (contact) => {
            try {
              // Here you would get the actual template content and send the email
              // For now, we'll simulate the email sending
              console.log(`Sending email to ${contact.metadata.email}`)
              
              // Simulate email sending delay
              await new Promise(resolve => setTimeout(resolve, 100))
              
              return { success: true, contact: contact.metadata.email }
            } catch (error) {
              console.error(`Failed to send email to ${contact.metadata.email}:`, error)
              return { success: false, contact: contact.metadata.email, error }
            }
          })
          
          const results = await Promise.all(emailPromises)
          
          // Count results
          const batchSent = results.filter(r => r.success).length
          const batchFailed = results.filter(r => !r.success).length
          
          sentCount += batchSent
          failedCount += batchFailed
          
          console.log(`Batch ${batchIndex + 1} completed: ${batchSent} sent, ${batchFailed} failed`)
          
          // Update campaign progress
          const progressPercentage = Math.round(((batchIndex + 1) / batches.length) * 100)
          await updateCampaignProgress(campaign.id, {
            sent: sentCount,
            failed: failedCount,
            total: activeContacts.length,
            progress_percentage: progressPercentage,
            last_batch_completed: new Date().toISOString()
          })
          
          // Add delay between batches to respect rate limits
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
        
        // Update final campaign status and stats
        const finalStats = {
          sent: sentCount,
          delivered: sentCount, // Assume all sent emails are delivered for now
          opened: 0, // Will be updated by tracking
          clicked: 0, // Will be updated by tracking
          bounced: failedCount,
          unsubscribed: 0,
          open_rate: '0%', // Will be calculated later
          click_rate: '0%' // Will be calculated later
        }
        
        await updateCampaignStatus(campaign.id, 'Sent', finalStats)
        
        totalEmailsSent += sentCount
        processedCampaigns++
        
        console.log(`Campaign "${campaign.metadata.name}" completed: ${sentCount} sent, ${failedCount} failed`)
        
      } catch (error) {
        console.error(`Error processing campaign ${campaign.metadata.name}:`, error)
        
        // Update campaign status to indicate error
        try {
          await updateCampaignStatus(campaign.id, 'Cancelled')
        } catch (statusError) {
          console.error(`Failed to update campaign status for ${campaign.id}:`, statusError)
        }
      }
    }
    
    console.log(`Cron job completed: ${processedCampaigns} campaigns processed, ${totalEmailsSent} emails sent`)
    
    return NextResponse.json({
      success: true,
      processed: processedCampaigns,
      totalEmailsSent
    })
    
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}