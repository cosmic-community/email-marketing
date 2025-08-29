import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface EmailData {
  to: string;
  subject: string;
  html: string;
  contactId?: string;
}

interface BulkEmailOptions {
  from: string;
  replyTo?: string;
  emails: EmailData[];
  campaignId?: string;
}

interface SendResult {
  successful: string[];
  failed: string[];
}

export async function sendBulkEmail(options: BulkEmailOptions): Promise<SendResult> {
  const { from, replyTo, emails, campaignId } = options
  const successful: string[] = []
  const failed: string[] = []

  // Send emails individually (Resend doesn't support true bulk sending in free tier)
  for (const email of emails) {
    try {
      // Add tracking parameters and unsubscribe link
      let htmlWithTracking = email.html
      
      // Add open tracking pixel if campaign ID is provided
      if (campaignId && email.contactId) {
        const trackingPixel = `<img src="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/tracking/open/${campaignId}/${email.contactId}" width="1" height="1" style="display:none;" alt="" />`
        htmlWithTracking += trackingPixel
      }
      
      // Add unsubscribe link
      const unsubscribeUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/unsubscribe?email=${encodeURIComponent(email.to)}&campaign=${campaignId || ''}`
      htmlWithTracking += `<br><br><small><a href="${unsubscribeUrl}">Unsubscribe</a></small>`

      const result = await resend.emails.send({
        from,
        to: [email.to],
        subject: email.subject,
        html: htmlWithTracking,
        replyTo: replyTo || from,
      })

      if (result.data?.id) {
        successful.push(email.to)
      } else {
        failed.push(email.to)
      }
    } catch (error) {
      console.error(`Failed to send email to ${email.to}:`, error)
      failed.push(email.to)
    }
  }

  return { successful, failed }
}

// Legacy function name for backward compatibility
export const sendEmail = sendBulkEmail