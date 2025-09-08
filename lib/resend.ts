import { Resend } from 'resend'
import { getSettings } from './cosmic'
import { addEmailTracking } from './email-tracking'

// Initialize Resend client
let resendClient: Resend | null = null

async function getResendClient(): Promise<Resend> {
  if (!resendClient) {
    const settings = await getSettings()
    const apiKey = settings?.metadata?.resend_api_key || process.env.RESEND_API_KEY
    
    if (!apiKey) {
      throw new Error('Resend API key not found in settings or environment variables')
    }
    
    resendClient = new Resend(apiKey)
  }
  
  return resendClient
}

interface EmailData {
  to: string[]
  subject: string
  html: string
  campaignId?: string
}

interface BulkEmailResult {
  successful: Array<{
    email: string
    id: string
  }>
  failed: Array<{
    email: string
    error: string
  }>
}

/**
 * Send a single email
 */
export async function sendEmail({
  to,
  subject,
  html,
  campaignId
}: EmailData): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const resend = await getResendClient()
    const settings = await getSettings()
    
    // Get from email and name from settings
    const fromEmail = settings?.metadata?.from_email || process.env.FROM_EMAIL || 'noreply@yourdomain.com'
    const fromName = settings?.metadata?.from_name || process.env.FROM_NAME || 'Your Company'
    
    // Add tracking if campaign ID is provided
    let trackedHtml = html
    if (campaignId && to.length === 1) {
      trackedHtml = addEmailTracking(html, campaignId, to[0])
    }
    
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      html: trackedHtml,
      // Add unsubscribe header
      headers: {
        'List-Unsubscribe': `<${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/unsubscribe>`
      }
    })
    
    return {
      success: true,
      id: result.data?.id
    }
  } catch (error) {
    console.error('Error sending email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Send multiple emails in bulk
 */
export async function sendBulkEmails(emails: EmailData[]): Promise<BulkEmailResult> {
  const results: BulkEmailResult = {
    successful: [],
    failed: []
  }
  
  // Process emails in smaller batches to avoid rate limits
  const batchSize = 10
  const batches = []
  
  for (let i = 0; i < emails.length; i += batchSize) {
    batches.push(emails.slice(i, i + batchSize))
  }
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (emailData) => {
      const result = await sendEmail(emailData)
      
      if (result.success) {
        results.successful.push({
          email: emailData.to[0],
          id: result.id || ''
        })
      } else {
        results.failed.push({
          email: emailData.to[0],
          error: result.error || 'Unknown error'
        })
      }
    })
    
    // Wait for current batch to complete
    await Promise.all(batchPromises)
    
    // Add small delay between batches
    if (batches.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return results
}

/**
 * Send test email
 */
export async function sendTestEmail({
  to,
  subject,
  html,
  testNote
}: {
  to: string[]
  subject: string
  html: string
  testNote?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Add test note to subject if provided
    const testSubject = testNote ? `[TEST] ${subject}` : `[TEST] ${subject}`
    
    const result = await sendEmail({
      to,
      subject: testSubject,
      html
    })
    
    return result
  } catch (error) {
    console.error('Error sending test email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Validate Resend API key
 */
export async function validateResendApiKey(apiKey: string): Promise<boolean> {
  try {
    const testResend = new Resend(apiKey)
    
    // Try to get domains to validate the key
    await testResend.domains.list()
    return true
  } catch (error) {
    console.error('Invalid Resend API key:', error)
    return false
  }
}

/**
 * Get Resend account information
 */
export async function getResendAccountInfo(): Promise<{
  domains: any[]
  apiKeys: any[]
} | null> {
  try {
    const resend = await getResendClient()
    
    const [domains, apiKeys] = await Promise.all([
      resend.domains.list(),
      resend.apiKeys.list()
    ])
    
    return {
      domains: domains.data || [],
      apiKeys: apiKeys.data || []
    }
  } catch (error) {
    console.error('Error getting Resend account info:', error)
    return null
  }
}