import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'
import { sendBulkEmails } from '@/lib/resend'
import { MarketingCampaign, EmailContact } from '@/types'

interface BatchProcessingCampaign extends MarketingCampaign {
  metadata: MarketingCampaign['metadata'] & {
    batch_size?: number
    batch_delay_minutes?: number
    total_recipients?: number
    current_batch?: number
    last_batch_sent_at?: string
    priority?: { key: string; value: 'Low' | 'Normal' | 'High' }
    max_retry_attempts?: number
    retry_count?: number
    error_log?: Array<{
      timestamp: string
      batch: number
      error: string
      retry_count: number
    }>
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron job authorization
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'your-secure-cron-secret'
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🚀 Starting campaign cron job execution')

    // Find campaigns that need processing
    const { objects: campaigns } = await cosmic.objects
      .find({ type: 'marketing-campaigns' })
      .props(['id', 'title', 'slug', 'metadata'])
      .depth(1)

    if (!campaigns || campaigns.length === 0) {
      console.log('No campaigns found')
      return NextResponse.json({ message: 'No campaigns to process' })
    }

    const campaignsToProcess = (campaigns as BatchProcessingCampaign[]).filter(campaign => {
      const status = campaign.metadata?.status?.value
      const sendDate = campaign.metadata?.send_date
      const currentTime = new Date()
      
      // Process campaigns that are:
      // 1. Scheduled and ready to send (send_date <= current time)
      // 2. Currently sending (status = 'Sending')
      if (status === 'Scheduled' && sendDate) {
        const scheduledTime = new Date(sendDate)
        return scheduledTime <= currentTime
      }
      
      if (status === 'Sending') {
        return true
      }
      
      return false
    })

    console.log(`Found ${campaignsToProcess.length} campaigns to process`)

    const results = []
    
    for (const campaign of campaignsToProcess) {
      try {
        const result = await processCampaignBatch(campaign)
        results.push({ campaignId: campaign.id, result })
      } catch (error) {
        console.error(`Error processing campaign ${campaign.id}:`, error)
        
        // Log error and increment retry count
        await logCampaignError(campaign, error as Error)
        
        results.push({ 
          campaignId: campaign.id, 
          error: (error as Error).message 
        })
      }
    }

    return NextResponse.json({ 
      message: 'Cron job completed',
      processedCampaigns: results.length,
      results 
    })
    
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: 'Cron job failed', details: (error as Error).message },
      { status: 500 }
    )
  }
}

async function processCampaignBatch(campaign: BatchProcessingCampaign) {
  console.log(`Processing campaign: ${campaign.metadata?.name} (${campaign.id})`)
  
  const batchSize = campaign.metadata?.batch_size || 100
  const batchDelayMinutes = campaign.metadata?.batch_delay_minutes || 5
  const currentBatch = campaign.metadata?.current_batch || 0
  const lastBatchSentAt = campaign.metadata?.last_batch_sent_at
  
  // Check if we need to wait for batch delay
  if (lastBatchSentAt && campaign.metadata?.status?.value === 'Sending') {
    const lastSentTime = new Date(lastBatchSentAt)
    const timeSinceLastBatch = Date.now() - lastSentTime.getTime()
    const delayInMs = batchDelayMinutes * 60 * 1000
    
    if (timeSinceLastBatch < delayInMs) {
      const waitTimeRemaining = Math.ceil((delayInMs - timeSinceLastBatch) / 60000)
      console.log(`Campaign ${campaign.id} needs to wait ${waitTimeRemaining} more minutes`)
      return { status: 'waiting', waitTimeRemaining }
    }
  }

  // Get recipients for this campaign
  const recipients = await getCampaignRecipients(campaign)
  const totalRecipients = recipients.length
  
  // Update total recipients count if not set
  if (!campaign.metadata?.total_recipients) {
    await cosmic.objects.updateOne(campaign.id, {
      metadata: { total_recipients: totalRecipients }
    })
  }

  // Calculate batch boundaries
  const startIndex = currentBatch * batchSize
  const endIndex = Math.min(startIndex + batchSize, totalRecipients)
  
  if (startIndex >= totalRecipients) {
    // Campaign is complete
    console.log(`Campaign ${campaign.id} completed. Total sent: ${totalRecipients}`)
    
    await cosmic.objects.updateOne(campaign.id, {
      metadata: {
        status: { key: 'sent', value: 'Sent' },
        stats: {
          ...campaign.metadata?.stats,
          sent: totalRecipients,
          delivered: totalRecipients // Will be updated by webhook
        }
      }
    })
    
    return { status: 'completed', totalSent: totalRecipients }
  }

  // Get current batch of recipients
  const batchRecipients = recipients.slice(startIndex, endIndex)
  console.log(`Sending batch ${currentBatch + 1}: contacts ${startIndex + 1}-${endIndex} of ${totalRecipients}`)

  // Update campaign status to 'Sending' if this is the first batch
  if (currentBatch === 0 && campaign.metadata?.status?.value !== 'Sending') {
    await cosmic.objects.updateOne(campaign.id, {
      metadata: {
        status: { key: 'sending', value: 'Sending' },
        template_snapshot: await createTemplateSnapshot(campaign)
      }
    })
  }

  // Send emails for this batch
  const sendResults = await sendCampaignBatch(campaign, batchRecipients)
  
  // Update campaign with batch progress
  await cosmic.objects.updateOne(campaign.id, {
    metadata: {
      current_batch: currentBatch + 1,
      last_batch_sent_at: new Date().toISOString(),
      stats: {
        ...campaign.metadata?.stats,
        sent: (campaign.metadata?.stats?.sent || 0) + sendResults.successCount,
        bounced: (campaign.metadata?.stats?.bounced || 0) + sendResults.errorCount
      }
    }
  })

  return {
    status: 'batch_sent',
    batch: currentBatch + 1,
    sent: sendResults.successCount,
    errors: sendResults.errorCount,
    progress: `${endIndex}/${totalRecipients}`
  }
}

async function getCampaignRecipients(campaign: BatchProcessingCampaign): Promise<EmailContact[]> {
  const recipients: EmailContact[] = []
  
  // Get contacts from target_contacts
  if (campaign.metadata?.target_contacts && Array.isArray(campaign.metadata.target_contacts)) {
    for (const contact of campaign.metadata.target_contacts) {
      if (typeof contact === 'object' && contact.metadata?.status?.value === 'Active') {
        recipients.push(contact as EmailContact)
      }
    }
  }
  
  // Get contacts by tags
  if (campaign.metadata?.target_tags && Array.isArray(campaign.metadata.target_tags)) {
    const { objects: taggedContacts } = await cosmic.objects
      .find({ 
        type: 'email-contacts',
        'metadata.tags': { $in: campaign.metadata.target_tags }
      })
      .props(['id', 'title', 'slug', 'metadata'])
      .depth(1)
    
    if (taggedContacts) {
      for (const contact of taggedContacts as EmailContact[]) {
        if (contact.metadata?.status?.value === 'Active' && 
            !recipients.find(r => r.id === contact.id)) {
          recipients.push(contact)
        }
      }
    }
  }
  
  return recipients
}

async function sendCampaignBatch(
  campaign: BatchProcessingCampaign, 
  recipients: EmailContact[]
): Promise<{ successCount: number; errorCount: number }> {
  let successCount = 0
  let errorCount = 0
  
  const template = campaign.metadata?.template
  const templateSnapshot = campaign.metadata?.template_snapshot
  
  if (!template && !templateSnapshot) {
    throw new Error('No template found for campaign')
  }
  
  const emailData = templateSnapshot || template?.metadata
  
  for (const recipient of recipients) {
    try {
      await sendBulkEmails({
        to: [recipient.metadata?.email || ''],
        subject: emailData?.subject || 'Email Campaign',
        html: personalizeContent(emailData?.content || '', recipient),
        campaignId: campaign.id,
        recipientId: recipient.id
      })
      
      successCount++
    } catch (error) {
      console.error(`Failed to send email to ${recipient.metadata?.email}:`, error)
      errorCount++
    }
  }
  
  return { successCount, errorCount }
}

function personalizeContent(content: string, recipient: EmailContact): string {
  let personalizedContent = content
  
  // Replace common placeholders
  personalizedContent = personalizedContent
    .replace(/\{\{first_name\}\}/g, recipient.metadata?.first_name || 'Subscriber')
    .replace(/\{\{last_name\}\}/g, recipient.metadata?.last_name || '')
    .replace(/\{\{email\}\}/g, recipient.metadata?.email || '')
    .replace(/\{\{full_name\}\}/g, 
      `${recipient.metadata?.first_name || ''} ${recipient.metadata?.last_name || ''}`.trim() || 'Subscriber')
  
  // Add unsubscribe link
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(recipient.metadata?.email || '')}`
  personalizedContent = personalizedContent.replace(
    /\{\{unsubscribe_url\}\}/g, 
    unsubscribeUrl
  )
  
  return personalizedContent
}

async function createTemplateSnapshot(campaign: BatchProcessingCampaign) {
  const template = campaign.metadata?.template
  if (!template || typeof template !== 'object') return null
  
  return {
    name: template.metadata?.name,
    subject: template.metadata?.subject,
    content: template.metadata?.content,
    template_type: template.metadata?.template_type,
    snapshot_date: new Date().toISOString(),
    original_template_id: template.id
  }
}

async function logCampaignError(campaign: BatchProcessingCampaign, error: Error) {
  const currentRetryCount = (campaign.metadata?.retry_count || 0) + 1
  const maxRetryAttempts = campaign.metadata?.max_retry_attempts || 3
  
  const errorLog = campaign.metadata?.error_log || []
  errorLog.push({
    timestamp: new Date().toISOString(),
    batch: campaign.metadata?.current_batch || 0,
    error: error.message,
    retry_count: currentRetryCount
  })
  
  const updates: any = {
    retry_count: currentRetryCount,
    error_log: errorLog
  }
  
  // If max retries exceeded, pause the campaign
  if (currentRetryCount >= maxRetryAttempts) {
    updates.status = { key: 'paused', value: 'Paused' }
  }
  
  await cosmic.objects.updateOne(campaign.id, { metadata: updates })
}

// POST endpoint to manually trigger cron job (for testing)
export async function POST(request: NextRequest) {
  return GET(request)
}