import { EmailContact } from '@/types'

/**
 * Generate a unique tracking pixel URL for email open tracking
 */
export function generateOpenTrackingPixel(campaignId: string, contactId: string, baseUrl?: string): string {
  const trackingBaseUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${trackingBaseUrl}/api/track/open?c=${encodeURIComponent(campaignId)}&e=${encodeURIComponent(contactId)}&t=${Date.now()}`
}

/**
 * Generate a click tracking URL that redirects to the original URL
 */
export function generateClickTrackingUrl(originalUrl: string, campaignId: string, contactId: string, baseUrl?: string): string {
  const trackingBaseUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${trackingBaseUrl}/api/track/click?c=${encodeURIComponent(campaignId)}&e=${encodeURIComponent(contactId)}&url=${encodeURIComponent(originalUrl)}&t=${Date.now()}`
}

/**
 * Add tracking pixel and click tracking to email HTML content
 */
export function addTrackingToEmail(
  htmlContent: string,
  campaignId: string,
  contactId: string,
  baseUrl?: string
): string {
  if (!htmlContent || !campaignId || !contactId) {
    console.warn('Missing required parameters for email tracking:', { htmlContent: !!htmlContent, campaignId, contactId })
    return htmlContent || ''
  }

  try {
    let trackedContent = htmlContent

    // Add open tracking pixel just before closing </body> tag or at the end
    const openPixelUrl = generateOpenTrackingPixel(campaignId, contactId, baseUrl)
    const trackingPixel = `<img src="${openPixelUrl}" alt="" width="1" height="1" style="display:none !important;" />`
    
    if (trackedContent.toLowerCase().includes('</body>')) {
      trackedContent = trackedContent.replace(
        /<\/body>/i,
        `${trackingPixel}\n</body>`
      )
    } else {
      trackedContent += `\n${trackingPixel}`
    }

    // Add click tracking to all links
    trackedContent = trackedContent.replace(
      /<a\s+([^>]*href\s*=\s*["']?)([^"'>\s]+)(["']?[^>]*)>/gi,
      (match, beforeUrl, originalUrl, afterUrl) => {
        // Skip if it's already a tracking URL or unsubscribe link or email link
        if (originalUrl.includes('/api/track/') || 
            originalUrl.includes('unsubscribe') || 
            originalUrl.startsWith('mailto:') ||
            originalUrl.startsWith('#') ||
            originalUrl.startsWith('javascript:')) {
          return match
        }

        // Fix: Add proper null checks for URL matching
        const urlMatch = originalUrl?.match(/^https?:\/\//)
        if (!urlMatch && originalUrl && !originalUrl.startsWith('/')) {
          // Relative URL without protocol, make it absolute
          const fullUrl = originalUrl.startsWith('/') ? originalUrl : `https://${originalUrl}`
          const clickTrackingUrl = generateClickTrackingUrl(fullUrl, campaignId, contactId, baseUrl)
          return `<a ${beforeUrl}${clickTrackingUrl}${afterUrl}>`
        }

        const clickTrackingUrl = generateClickTrackingUrl(originalUrl, campaignId, contactId, baseUrl)
        return `<a ${beforeUrl}${clickTrackingUrl}${afterUrl}>`
      }
    )

    return trackedContent
  } catch (error) {
    console.error('Error adding tracking to email:', error)
    return htmlContent || ''
  }
}

/**
 * Add basic email tracking for opens and clicks - EXPORTED FUNCTION
 */
export function addEmailTracking(
  htmlContent: string,
  campaignId: string,
  recipientEmail: string,
  baseUrl?: string
): string {
  // Use recipientEmail as contactId for backward compatibility
  return addTrackingToEmail(htmlContent, campaignId, recipientEmail, baseUrl)
}

/**
 * Extract tracking data from tracking URLs
 */
export function parseTrackingUrl(url: string): {
  campaignId?: string
  contactId?: string
  originalUrl?: string
  timestamp?: string
} {
  try {
    const urlObj = new URL(url)
    const searchParams = urlObj.searchParams
    
    return {
      campaignId: searchParams.get('c') || undefined,
      contactId: searchParams.get('e') || undefined,
      originalUrl: searchParams.get('url') || undefined,
      timestamp: searchParams.get('t') || undefined
    }
  } catch (error) {
    console.error('Error parsing tracking URL:', error)
    return {}
  }
}

/**
 * Record email open event
 */
export async function recordEmailOpen(campaignId: string, contactId: string): Promise<boolean> {
  try {
    // This would typically update campaign statistics in your database
    console.log(`Email opened - Campaign: ${campaignId}, Contact: ${contactId}`)
    
    // You can add your own logic here to update campaign stats
    // For example, increment open count in Cosmic CMS
    
    return true
  } catch (error) {
    console.error('Error recording email open:', error)
    return false
  }
}

/**
 * Record email click event
 */
export async function recordEmailClick(
  campaignId: string, 
  contactId: string, 
  clickedUrl: string
): Promise<boolean> {
  try {
    // This would typically update campaign statistics in your database
    console.log(`Email link clicked - Campaign: ${campaignId}, Contact: ${contactId}, URL: ${clickedUrl}`)
    
    // You can add your own logic here to update campaign stats
    // For example, increment click count in Cosmic CMS
    
    return true
  } catch (error) {
    console.error('Error recording email click:', error)
    return false
  }
}

/**
 * Generate unsubscribe URL for email campaigns
 */
export function generateUnsubscribeUrl(
  email: string, 
  campaignId: string, 
  baseUrl?: string
): string {
  const unsubscribeBaseUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${unsubscribeBaseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}&campaign=${encodeURIComponent(campaignId)}`
}

/**
 * Add unsubscribe footer to email content
 */
export function addUnsubscribeFooter(
  htmlContent: string,
  email: string,
  campaignId: string,
  companyAddress?: string,
  baseUrl?: string
): string {
  const unsubscribeUrl = generateUnsubscribeUrl(email, campaignId, baseUrl)
  
  const unsubscribeFooter = `
    <div style="margin-top: 40px; padding: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
      <p style="margin: 0 0 10px 0;">
        You received this email because you subscribed to our mailing list.
      </p>
      <p style="margin: 0 0 10px 0;">
        <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a> from future emails.
      </p>
      ${companyAddress ? `<p style="margin: 0; font-size: 11px;">${companyAddress.replace(/\n/g, '<br>')}</p>` : ''}
    </div>
  `
  
  // Add footer before closing body tag or at the end
  if (htmlContent.toLowerCase().includes('</body>')) {
    return htmlContent.replace(/<\/body>/i, `${unsubscribeFooter}\n</body>`)
  } else {
    return htmlContent + unsubscribeFooter
  }
}