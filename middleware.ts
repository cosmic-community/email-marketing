import { NextRequest, NextResponse } from 'next/server'
import { isValidOrigin, verifyAccessCode, shouldBypassSecurity, createSecurityResponse } from './lib/security'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Skip middleware for static assets and specific routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname === '/dashboard-console-capture.js'
  ) {
    return NextResponse.next()
  }

  // Handle API route security
  if (pathname.startsWith('/api/')) {
    // Skip security checks for specific public routes
    if (shouldBypassSecurity(pathname)) {
      return NextResponse.next()
    }
    
    // Special handling for cron jobs - they use CRON_SECRET
    if (pathname.startsWith('/api/cron/')) {
      const cronSecret = request.headers.get('authorization')
      const expectedSecret = process.env.CRON_SECRET
      
      if (!expectedSecret) {
        console.warn('CRON_SECRET not configured')
        return createSecurityResponse('CRON_SECRET_NOT_CONFIGURED')
      }
      
      if (!cronSecret || cronSecret !== `Bearer ${expectedSecret}`) {
        console.warn(`Unauthorized cron access attempt: ${pathname}`)
        return createSecurityResponse('INVALID_CRON_SECRET')
      }
      
      return NextResponse.next()
    }
    
    // Check domain origin for all other API routes
    const validOrigin = isValidOrigin(request)
    const validAccessCode = verifyAccessCode(request)
    
    if (!validOrigin && !validAccessCode) {
      const origin = request.headers.get('origin')
      const referer = request.headers.get('referer')
      
      console.warn(`Unauthorized API access attempt:`, {
        pathname,
        origin,
        referer,
        userAgent: request.headers.get('user-agent'),
        ip: request.ip || request.headers.get('x-forwarded-for')
      })
      
      return createSecurityResponse('INVALID_ORIGIN_OR_ACCESS_CODE')
    }
  }
  
  // Handle page authentication (existing logic)
  if (
    pathname === '/login' ||
    pathname.startsWith('/subscribe') || // Allow all subscribe pages including /subscribe/verified
    pathname === '/api/subscribe' ||
    pathname === '/api/auth' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/unsubscribe') ||
    pathname.startsWith('/api/track') ||
    pathname.startsWith('/public/campaigns/') // Allow public campaign access
  ) {
    return NextResponse.next()
  }

  // Check if user is authenticated for protected pages
  const authCookie = request.cookies.get('email-marketing-auth')
  
  if (!authCookie || authCookie.value !== 'authenticated') {
    // Redirect to login page
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}