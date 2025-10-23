import { NextRequest } from 'next/server'

// Rate limiting storage (in production, use Redis or a database)
const rateLimitStore = new Map<string, { count: number; firstRequest: number }>()

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (now - value.firstRequest > 15 * 60 * 1000) { // 15 minutes
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

interface BotProtectionData {
  bot_protection?: {
    time_spent: number
    user_interacted: boolean
    form_start_time: number
    submission_time: number
    honeypot_filled: boolean
    user_agent: string
    screen_resolution: string
    timezone: string
    language: string
  }
}

interface ValidationResult {
  isValid: boolean
  score: number
  reason?: string
}

export async function isRateLimited(clientIP: string): Promise<boolean> {
  const now = Date.now()
  const key = `rate_limit:${clientIP}`
  const existing = rateLimitStore.get(key)
  
  if (!existing) {
    rateLimitStore.set(key, { count: 1, firstRequest: now })
    return false
  }
  
  // Reset if outside time window (15 minutes)
  if (now - existing.firstRequest > 15 * 60 * 1000) {
    rateLimitStore.set(key, { count: 1, firstRequest: now })
    return false
  }
  
  existing.count++
  
  // Allow max 5 submissions per 15 minutes per IP
  return existing.count > 5
}

export async function validateBotProtection(
  body: BotProtectionData,
  request: NextRequest
): Promise<ValidationResult> {
  let score = 0
  const reasons: string[] = []
  
  const protection = body.bot_protection
  if (!protection) {
    return {
      isValid: false,
      score: 0,
      reason: 'Missing bot protection data'
    }
  }

  // Check honeypot field
  if (protection.honeypot_filled) {
    return {
      isValid: false,
      score: 0,
      reason: 'Honeypot field was filled'
    }
  }
  score += 20

  // Check time spent on form (too fast = likely bot)
  if (protection.time_spent < 2000) {
    reasons.push('Submitted too quickly')
    score -= 30
  } else if (protection.time_spent > 5000) {
    score += 15 // Good human-like timing
  } else {
    score += 10
  }

  // Check user interaction
  if (!protection.user_interacted) {
    reasons.push('No user interaction detected')
    score -= 25
  } else {
    score += 15
  }

  // Validate User-Agent
  const userAgent = request.headers.get('user-agent') || ''
  if (!userAgent || userAgent.length < 10) {
    reasons.push('Invalid or missing User-Agent')
    score -= 20
  } else if (userAgent.includes('bot') || userAgent.includes('crawler') || userAgent.includes('spider')) {
    reasons.push('Bot-like User-Agent detected')
    score -= 30
  } else {
    score += 10
  }

  // Check for common bot patterns in User-Agent
  const botPatterns = [
    /headless/i,
    /phantom/i,
    /selenium/i,
    /webdriver/i,
    /puppeteer/i,
    /playwright/i,
    /automation/i
  ]
  
  if (botPatterns.some(pattern => pattern.test(userAgent))) {
    reasons.push('Automation tool detected in User-Agent')
    score -= 25
  } else {
    score += 5
  }

  // Validate screen resolution (basic check)
  if (protection.screen_resolution) {
    const [width, height] = protection.screen_resolution.split('x').map(Number)
    if (width && height && width > 200 && height > 200) {
      score += 10
    }
  }

  // Validate timezone (basic check)
  if (protection.timezone && protection.timezone.includes('/')) {
    score += 5
  }

  // Validate language
  if (protection.language && protection.language.length >= 2) {
    score += 5
  }

  // Check for missing JavaScript capabilities
  if (!protection.screen_resolution || !protection.timezone || !protection.language) {
    reasons.push('Missing browser capabilities (possible server-side submission)')
    score -= 15
  }

  // Check request headers for additional validation
  const acceptHeader = request.headers.get('accept') || ''
  if (!acceptHeader.includes('text/html')) {
    reasons.push('Non-browser Accept header')
    score -= 10
  } else {
    score += 5
  }

  const acceptLanguage = request.headers.get('accept-language')
  if (!acceptLanguage) {
    reasons.push('Missing Accept-Language header')
    score -= 5
  } else {
    score += 5
  }

  const acceptEncoding = request.headers.get('accept-encoding')
  if (!acceptEncoding || !acceptEncoding.includes('gzip')) {
    reasons.push('Unusual Accept-Encoding header')
    score -= 5
  } else {
    score += 5
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score))

  // Determine if submission is valid (threshold: 70)
  const isValid = score >= 70

  return {
    isValid,
    score,
    reason: reasons.length > 0 ? reasons.join(', ') : undefined
  }
}

export function logSuspiciousActivity(
  clientIP: string,
  email: string,
  reason: string,
  score: number,
  userAgent?: string
) {
  console.warn('🤖 Suspicious subscription attempt:', {
    ip: clientIP,
    email,
    reason,
    score,
    userAgent,
    timestamp: new Date().toISOString()
  })
}

// Additional utility functions for enhanced protection
export function detectVPN(clientIP: string): boolean {
  // Basic VPN detection - in production, use a service like IPQualityScore
  const vpnRanges = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16'
  ]
  
  // This is a simplified check - implement proper IP range checking
  return vpnRanges.some(range => clientIP.startsWith(range.split('/')[0].slice(0, -1)))
}

export function analyzeEmailPattern(email: string): {
  isTemporary: boolean
  isSuspicious: boolean
  risk_score: number
} {
  const temporaryDomains = [
    '10minutemail.com',
    'guerrillamail.com',
    'mailinator.com',
    'tempmail.org',
    'throwaway.email'
  ]
  
  const domain = email.split('@')[1]?.toLowerCase()
  const localPart = email.split('@')[0]
  
  let risk_score = 0
  let isTemporary = false
  let isSuspicious = false
  
  // Check for temporary email services
  if (domain && temporaryDomains.includes(domain)) {
    isTemporary = true
    risk_score += 50
  }
  
  // Check for suspicious patterns
  if (localPart && localPart.length > 30) {
    isSuspicious = true
    risk_score += 20
  }
  
  if (/\d{5,}/.test(localPart)) {
    isSuspicious = true
    risk_score += 15
  }
  
  if (/^[a-z]+\d+$/.test(localPart)) {
    risk_score += 10
  }
  
  return {
    isTemporary,
    isSuspicious,
    risk_score: Math.min(100, risk_score)
  }
}