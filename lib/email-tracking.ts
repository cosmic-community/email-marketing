// Email tracking utilities

export function createUnsubscribeUrl(
  email: string,
  baseUrl: string,
  campaignId?: string
): string {
  const params = new URLSearchParams({
    email: email,
  });

  if (campaignId) {
    params.set("campaign", campaignId);
  }

  return `${baseUrl}/api/unsubscribe?${params.toString()}`;
}

export function addTrackingToEmail(
  html: string,
  campaignId: string,
  contactId: string,
  baseUrl: string
): string {
  // Replace all links with tracking redirects
  const trackedHtml = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      // Don't track unsubscribe links or internal tracking links
      if (
        url.includes("/api/unsubscribe") ||
        url.includes("/api/track/") ||
        url.includes("mailto:")
      ) {
        return match;
      }

      const trackingUrl = `${baseUrl}/api/track/click?campaign=${campaignId}&contact=${contactId}&url=${encodeURIComponent(
        url
      )}`;
      return `href="${trackingUrl}"`;
    }
  );

  return trackedHtml;
}

/**
 * Generate hidden preheader HTML for email clients.
 * The preheader text appears after the subject line in the inbox preview.
 * Uses a hidden div + whitespace padding technique for maximum client support.
 */
export function generatePreheaderHtml(preheaderText: string): string {
  if (!preheaderText || !preheaderText.trim()) {
    return "";
  }

  // The hidden preheader div followed by invisible whitespace characters
  // to prevent email clients from pulling in body content after the preheader.
  const whitespace = "&nbsp;&zwnj;".repeat(60);

  return `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheaderText.trim()}</div><div style="display:none;max-height:0px;overflow:hidden;">${whitespace}</div>`;
}
