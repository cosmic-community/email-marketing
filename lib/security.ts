import { NextRequest } from "next/server";

// Allowed domains for API access
const ALLOWED_DOMAINS = [
  "https://www.cosmicmailer.com",
  "https://cosmicmailer.com",
  "http://localhost:3000", // For development
  "http://localhost:3001", // Alternative dev port
];

// Development/staging patterns (for Vercel deployments)
const ALLOWED_DOMAIN_PATTERNS = [
  /^https:\/\/.*\.vercel\.app$/,
  /^https:\/\/.*-cosmic-community\.vercel\.app$/,
];

export function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // For direct API calls, check origin header
  if (origin) {
    if (ALLOWED_DOMAINS.includes(origin)) {
      return true;
    }

    // Check against patterns for staging/preview environments
    return ALLOWED_DOMAIN_PATTERNS.some((pattern) => pattern.test(origin));
  }

  // For navigation/form submissions, check referer
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;

      if (ALLOWED_DOMAINS.includes(refererOrigin)) {
        return true;
      }

      return ALLOWED_DOMAIN_PATTERNS.some((pattern) =>
        pattern.test(refererOrigin)
      );
    } catch {
      return false;
    }
  }

  return false;
}

export function verifyAccessCode(request: NextRequest): boolean {
  // Check for server access code in headers (for server-to-server communication)
  const serverAccessCode = request.headers.get("x-access-code");
  const expectedAccessCode = process.env.ACCESS_CODE;

  if (
    serverAccessCode &&
    expectedAccessCode &&
    serverAccessCode === expectedAccessCode
  ) {
    return true;
  }

  return false;
}

export function shouldBypassSecurity(pathname: string): boolean {
  // Routes that should bypass security checks (public endpoints)
  const publicRoutes = [
    "/api/subscribe", // Includes /api/subscribe/verify
    "/api/unsubscribe",
    "/api/track",
    "/api/auth/login",
    "/api/auth/check",
    "/api/cron/", // Cron jobs have their own security
    "/api/inngest", // Inngest webhook endpoint
  ];

  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route)
  );
}

export function createSecurityResponse(reason: string) {
  return new Response(
    JSON.stringify({
      error: "Access denied",
      message: "This API endpoint is restricted to authorized domains only.",
      code: "SECURITY_VIOLATION",
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "X-Security-Reason": reason,
      },
    }
  );
}
