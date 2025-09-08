/**
 * Replace email template variables with actual values
 */
export function replaceEmailVariables(content: string, variables: Record<string, string>): string {
  let processedContent = content

  // Replace common variables
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi')
    processedContent = processedContent.replace(regex, value || '')
  })

  // Handle common missing variables with defaults
  processedContent = processedContent.replace(/{{[^}]+}}/g, '')

  return processedContent
}

/**
 * Add tracking pixels and click tracking to email content
 */
export function addEmailTracking(content: string, campaignId: string, recipientEmail: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  // Add tracking pixel for open tracking
  const trackingPixel = `<img src="${baseUrl}/api/track/open?campaign=${campaignId}&email=${encodeURIComponent(recipientEmail)}" width="1" height="1" style="display:none;" />`
  
  // Add tracking pixel before closing body tag
  let trackedContent = content.replace(/<\/body>/i, `${trackingPixel}</body>`)
  
  // If no body tag, add at the end
  if (!trackedContent.includes(trackingPixel)) {
    trackedContent = content + trackingPixel
  }
  
  // Track all links
  trackedContent = trackedContent.replace(
    /<a([^>]+)href=["']([^"']+)["']([^>]*)>/gi,
    (match, before, url, after) => {
      // Skip if already a tracking URL or unsubscribe link
      if (url.includes('/api/track/') || url.includes('/unsubscribe')) {
        return match
      }
      
      const trackingUrl = `${baseUrl}/api/track/click?campaign=${campaignId}&email=${encodeURIComponent(recipientEmail)}&url=${encodeURIComponent(url)}`
      return `<a${before}href="${trackingUrl}"${after}>`
    }
  )
  
  return trackedContent
}

/**
 * Extract and validate email addresses
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Generate unsubscribe link
 */
export function generateUnsubscribeLink(email: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/unsubscribe?email=${encodeURIComponent(email)}`
}

/**
 * Parse CSV content for bulk contact import
 */
export function parseCSVContacts(csvContent: string): Array<{
  first_name: string
  last_name?: string
  email: string
  tags?: string[]
}> {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) return []
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const contacts = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    
    if (values.length < headers.length) continue
    
    const contact: any = {}
    
    headers.forEach((header, index) => {
      const value = values[index]
      
      switch (header) {
        case 'first_name':
        case 'firstname':
        case 'first name':
          contact.first_name = value
          break
        case 'last_name':
        case 'lastname':
        case 'last name':
          contact.last_name = value
          break
        case 'email':
        case 'email_address':
        case 'email address':
          contact.email = value
          break
        case 'tags':
          contact.tags = value ? value.split(';').map(t => t.trim()).filter(Boolean) : []
          break
      }
    })
    
    if (contact.first_name && contact.email && validateEmail(contact.email)) {
      contacts.push(contact)
    }
  }
  
  return contacts
}

/**
 * Create email preview text (first 150 chars of text content)
 */
export function generatePreviewText(htmlContent: string): string {
  // Remove HTML tags and get plain text
  const textContent = htmlContent
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  return textContent.length > 150 
    ? textContent.substring(0, 150) + '...'
    : textContent
}