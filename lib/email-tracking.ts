/**
 * Injects tracking elements into email HTML content
 */
export function injectEmailTracking(
  htmlContent: string,
  campaignId: string,
  contactId: string,
  baseUrl: string
): string {
  let trackedContent = htmlContent

  // 1. Inject tracking pixel at the end of the email
  const trackingPixel = `<img src="${baseUrl}/api/tracking/open/${campaignId}/${contactId}" width="1" height="1" style="display:none" alt="">`
  
  // Insert before closing body tag, or at the end if no body tag
  if (trackedContent.includes('</body>')) {
    trackedContent = trackedContent.replace('</body>', `${trackingPixel}</body>`)
  } else {
    trackedContent += trackingPixel
  }

  // 2. Wrap all links with click tracking
  trackedContent = injectLinkTracking(trackedContent, campaignId, contactId, baseUrl)

  return trackedContent
}

/**
 * Wraps all links in email content with click tracking
 */
function injectLinkTracking(
  htmlContent: string,
  campaignId: string,
  contactId: string,
  baseUrl: string
): string {
  // Regular expression to find all href attributes
  const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi
  
  return htmlContent.replace(hrefRegex, (match, originalUrl) => {
    // Skip tracking pixel URLs and unsubscribe links
    if (originalUrl.includes('/api/tracking/') || originalUrl.includes('/api/unsubscribe/')) {
      return match
    }

    // Create tracking URL
    const trackingUrl = `${baseUrl}/api/tracking/click?c=${campaignId}&u=${contactId}&url=${encodeURIComponent(originalUrl)}`
    
    return `href="${trackingUrl}"`
  })
}

/**
 * Personalizes email content with contact data
 */
export function personalizeEmailContent(
  htmlContent: string,
  contact: {
    metadata: {
      first_name?: string
      last_name?: string
      email?: string
    }
  },
  campaignId: string,
  baseUrl: string
): string {
  let personalizedContent = htmlContent

  // Replace common placeholders
  const replacements: Record<string, string> = {
    '{{first_name}}': contact.metadata.first_name || 'Friend',
    '{{last_name}}': contact.metadata.last_name || '',
    '{{full_name}}': `${contact.metadata.first_name || ''} ${contact.metadata.last_name || ''}`.trim() || 'Friend',
    '{{email}}': contact.metadata.email || '',
  }

  // Apply replacements
  for (const [placeholder, value] of Object.entries(replacements)) {
    personalizedContent = personalizedContent.replace(new RegExp(placeholder, 'g'), value)
  }

  // Add unsubscribe link if not present
  const unsubscribeUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(contact.metadata.email || '')}&campaign=${campaignId}`
  
  if (!personalizedContent.includes('unsubscribe')) {
    const unsubscribeLink = `<p style="font-size: 12px; color: #666; text-align: center; margin-top: 20px;">
      <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe</a> from these emails
    </p>`
    
    // Add before closing body tag or at the end
    if (personalizedContent.includes('</body>')) {
      personalizedContent = personalizedContent.replace('</body>', `${unsubscribeLink}</body>`)
    } else {
      personalizedContent += unsubscribeLink
    }
  }

  return personalizedContent
}

/**
 * Validates tracking data
 */
export function validateTrackingIds(campaignId: string, contactId: string): boolean {
  // Basic validation - ensure IDs are non-empty strings
  return Boolean(campaignId && typeof campaignId === 'string' && campaignId.length > 0) &&
         Boolean(contactId && typeof contactId === 'string' && contactId.length > 0)
}

/**
 * Generates tracking report data
 */
export interface TrackingReport {
  campaignId: string
  totalSent: number
  totalOpened: number
  totalClicked: number
  openRate: string
  clickRate: string
  openedContacts: string[]
  clickedContacts: string[]
}

export function generateTrackingReport(campaign: any): TrackingReport {
  const stats = campaign.metadata?.stats || {}
  const openedContacts = campaign.metadata?.opened_contacts || []
  const clickedContacts = campaign.metadata?.clicked_contacts || []

  return {
    campaignId: campaign.id,
    totalSent: stats.sent || 0,
    totalOpened: stats.opened || 0,
    totalClicked: stats.clicked || 0,
    openRate: stats.open_rate || '0%',
    clickRate: stats.click_rate || '0%',
    openedContacts,
    clickedContacts
  }
}