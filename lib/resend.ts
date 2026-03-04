import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY environment variable is not set");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

// Type definitions for Resend API responses based on actual Resend library types
export interface SendEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  headers?: Record<string, string>;
  campaignId?: string;
  contactId?: string;
}

// The Resend library returns a Promise that resolves to either success data or throws an error
export interface ResendSuccessResponse {
  id: string;
}

export interface ResendErrorResponse {
  message: string;
  name: string;
}

// Custom error class for rate limits
export class ResendRateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'ResendRateLimitError';
  }
}

export interface BatchEmailPayload {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  headers?: Record<string, string>;
}

export interface BatchSendResult {
  data: { id: string }[];
}

/**
 * Send up to 100 emails in a single Resend API call.
 * Uses idempotency keys to prevent duplicate sends on retry.
 */
export async function sendEmailBatch(
  emails: BatchEmailPayload[],
  idempotencyKey?: string
): Promise<BatchSendResult> {
  if (emails.length === 0) {
    return { data: [] };
  }
  if (emails.length > 100) {
    throw new Error("Resend batch API supports a maximum of 100 emails per call");
  }

  try {
    const payloads = emails.map((email) => {
      const textContent =
        email.text ||
        (email.html ? email.html.replace(/<[^>]*>/g, "") : email.subject);
      return {
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: textContent,
        replyTo: email.reply_to,
        headers: email.headers,
      };
    });

    const result = await resend.batch.send(
      payloads,
      idempotencyKey ? { idempotencyKey } : undefined
    );

    if (result.error) {
      const errorMessage = result.error.message || "";
      const isRateLimit =
        errorMessage.toLowerCase().includes("rate limit") ||
        errorMessage.toLowerCase().includes("too many requests") ||
        errorMessage.includes("429");

      if (isRateLimit) {
        const retryMatch = errorMessage.match(/retry after (\d+)/i);
        const retryAfter = retryMatch ? parseInt(retryMatch[1] ?? "3600") : 3600;
        console.error("Resend batch rate limit error:", errorMessage);
        throw new ResendRateLimitError("Resend batch API rate limit exceeded", retryAfter);
      }

      throw new Error(errorMessage || "Resend batch send failed");
    }

    const batchData = result.data?.data || [];
    return {
      data: batchData.map((d) => ({ id: d.id || "" })),
    };
  } catch (error: any) {
    if (error instanceof ResendRateLimitError) {
      throw error;
    }

    const errorMessage = error.message || "";
    const isRateLimit =
      errorMessage.toLowerCase().includes("rate limit") ||
      errorMessage.toLowerCase().includes("too many requests") ||
      error.statusCode === 429 ||
      error.status === 429;

    if (isRateLimit) {
      const retryAfter = error.headers?.["retry-after"]
        ? parseInt(error.headers["retry-after"])
        : 3600;
      console.error("Resend batch rate limit error (caught):", errorMessage);
      throw new ResendRateLimitError("Resend batch API rate limit exceeded", retryAfter);
    }

    console.error("Resend batch API error:", error);
    throw new Error(error.message || "Failed to send email batch via Resend");
  }
}

// Export the sendEmail function that wraps the Resend SDK
export async function sendEmail(
  options: SendEmailOptions
): Promise<ResendSuccessResponse> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    // Apply click tracking if this is a campaign email
    let finalHtmlContent = options.html;
    
    // CRITICAL FIX: Validate that all required values are defined before adding tracking
    // AND extract them to local const variables to ensure TypeScript type narrowing
    if (options.html && options.campaignId && options.contactId) {
      // Extract values to local const variables INSIDE the conditional
      // TypeScript now knows these are definitely strings (not string | undefined)
      const htmlContent = options.html;
      const campaignId = options.campaignId;
      const contactId = options.contactId;
      
      // Now we can safely pass these guaranteed-string values to addTrackingToEmail
      const { addTrackingToEmail } = await import("./email-tracking");
      finalHtmlContent = addTrackingToEmail(
        htmlContent,
        campaignId,
        contactId,
        baseUrl
      );
    }

    // Ensure text field is always a string (required by Resend API)
    const textContent =
      options.text ||
      (finalHtmlContent
        ? finalHtmlContent.replace(/<[^>]*>/g, "")
        : options.subject);

    const result = await resend.emails.send({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: finalHtmlContent,
      text: textContent,
      replyTo: options.reply_to,
      headers: options.headers,
    });

    // The Resend SDK returns { data: { id: string }, error: null } on success
    // or { data: null, error: ErrorObject } on failure
    if (result.error) {
      // Check if this is a rate limit error (429 or rate limit message)
      const errorMessage = result.error.message || "";
      const isRateLimit = 
        errorMessage.toLowerCase().includes("rate limit") ||
        errorMessage.toLowerCase().includes("too many requests") ||
        errorMessage.includes("429");

      if (isRateLimit) {
        // Try to extract retry-after from error message if available
        const retryMatch = errorMessage.match(/retry after (\d+)/i);
        const retryAfter = retryMatch ? parseInt(retryMatch[1] ?? "3600") : 3600;
        
        console.error("Resend rate limit error:", errorMessage);
        throw new ResendRateLimitError("Resend API rate limit exceeded", retryAfter);
      }
      
      throw new Error(result.error.message || "Failed to send email");
    }

    if (!result.data?.id) {
      throw new Error("Invalid response from Resend API");
    }

    return { id: result.data.id };
  } catch (error: any) {
    // Re-throw ResendRateLimitError as-is
    if (error instanceof ResendRateLimitError) {
      throw error;
    }
    
    // Check for rate limit in generic errors (catch-all for any 429 responses)
    const errorMessage = error.message || "";
    const isRateLimit = 
      errorMessage.toLowerCase().includes("rate limit") ||
      errorMessage.toLowerCase().includes("too many requests") ||
      error.statusCode === 429 ||
      error.status === 429;

    if (isRateLimit) {
      // Try to extract retry-after from headers if available
      const retryAfter = error.headers?.['retry-after'] 
        ? parseInt(error.headers['retry-after']) 
        : 3600;
      
      console.error("Resend rate limit error (caught):", errorMessage);
      throw new ResendRateLimitError("Resend API rate limit exceeded", retryAfter);
    }
    
    console.error("Resend API error:", error);
    throw new Error(error.message || "Failed to send email via Resend");
  }
}