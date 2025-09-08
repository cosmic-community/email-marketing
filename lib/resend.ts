import { Resend } from 'resend'
import { getSettings } from './cosmic'

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

// Define proper email options interface that matches Resend's expected format
interface SendEmailOptions {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  reply_to?: string
  headers?: Record<string, string>
}

interface EmailData {
  to: string[]
  subject: string
  html: string
  text: string
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
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const resend = await getResendClient()
    
    // Fix TS2345: Ensure all required fields are present and properly typed
    const emailData = {
      from: options.from, // Already a string from the caller
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''), // Provide fallback text
      reply_to: options.reply_to,
      headers: options.headers
    }
    
    const result = await resend.emails.send(emailData)
    
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
  
  const settings = await getSettings()
  
  // Fix TS2322: Add proper null checks and ensure strings are not undefined
  if (!settings?.metadata?.from_email || !settings?.metadata?.from_name) {
    throw new Error('Email settings not configured: missing from_email or from_name')
  }
  
  // Ensure these are strings, not undefined
  const fromEmail: string = settings.metadata.from_email
  const fromName: string = settings.metadata.from_name
  const replyToEmail: string | undefined = settings.metadata.reply_to_email
  
  // Process emails in smaller batches to avoid rate limits
  const batchSize = 10
  const batches = []
  
  for (let i = 0; i < emails.length; i += batchSize) {
    batches.push(emails.slice(i, i + batchSize))
  }
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (emailData) => {
      try {
        const emailOptions: SendEmailOptions = {
          from: `${fromName} <${fromEmail}>`,
          to: emailData.to,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
          reply_to: replyToEmail
        }
        
        const result = await sendEmail(emailOptions)
        
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
      } catch (error) {
        results.failed.push({
          email: emailData.to[0],
          error: error instanceof Error ? error.message : 'Unknown error'
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
    const settings = await getSettings()
    
    // Fix TS2322: Add proper null checks and ensure strings are not undefined
    if (!settings?.metadata?.from_email || !settings?.metadata?.from_name) {
      throw new Error('Email settings not configured: missing from_email or from_name')
    }
    
    // Ensure these are strings, not undefined
    const fromEmail: string = settings.metadata.from_email
    const fromName: string = settings.metadata.from_name
    const replyToEmail: string | undefined = settings.metadata.reply_to_email
    
    // Add test note to subject if provided
    const testSubject = testNote ? `[TEST] ${subject}` : `[TEST] ${subject}`
    
    const emailOptions: SendEmailOptions = {
      from: `${fromName} <${fromEmail}>`,
      to,
      subject: testSubject,
      html,
      text: html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      reply_to: replyToEmail
    }
    
    const result = await sendEmail(emailOptions)
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
    
    // Fix TS2322: Ensure arrays are returned even if data is undefined
    const domainsArray = domains.data || []
    const apiKeysArray = apiKeys.data || []
    
    return {
      domains: domainsArray,
      apiKeys: apiKeysArray
    }
  } catch (error) {
    console.error('Error getting Resend account info:', error)
    return null
  }
}