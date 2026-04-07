// app/api/campaigns/[id]/test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getMarketingCampaign, getSettings } from "@/lib/cosmic";
import { sendEmail } from "@/lib/resend";
import { generatePreheaderHtml } from "@/lib/email-tracking";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Campaign ID is required" },
        { status: 400 }
      );
    }

    // Validate test email addresses
    const { test_emails } = body;
    if (
      !test_emails ||
      !Array.isArray(test_emails) ||
      test_emails.length === 0
    ) {
      return NextResponse.json(
        { error: "At least one test email address is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = test_emails.filter(
      (email: string) => !emailRegex.test(email)
    );
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { error: `Invalid email addresses: ${invalidEmails.join(", ")}` },
        { status: 400 }
      );
    }

    // Get campaign details
    const campaign = await getMarketingCampaign(id);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Only allow test emails for draft campaigns
    if (campaign.metadata?.status?.value !== "Draft") {
      return NextResponse.json(
        { error: "Test emails can only be sent for draft campaigns" },
        { status: 400 }
      );
    }

    // Get campaign content - use the new campaign_content structure
    const campaignContent = campaign.metadata?.campaign_content;

    if (!campaignContent) {
      return NextResponse.json(
        {
          error:
            "Campaign content not found. Please ensure the campaign has content configured.",
        },
        { status: 400 }
      );
    }

    if (!campaignContent.subject || !campaignContent.content) {
      return NextResponse.json(
        { error: "Campaign subject or content is missing" },
        { status: 400 }
      );
    }

    // Get settings for email configuration
    const settings = await getSettings();
    if (!settings?.metadata) {
      return NextResponse.json(
        { error: "Email settings not configured" },
        { status: 400 }
      );
    }

    const fromName = settings.metadata.from_name || "Email Marketing";
    const fromEmail = settings.metadata.from_email;
    const replyToEmail = settings.metadata.reply_to_email || fromEmail;
    const companyAddress = settings.metadata.company_address || "";

    if (!fromEmail) {
      return NextResponse.json(
        { error: "From email not configured in settings" },
        { status: 400 }
      );
    }

    // Get base URL for unsubscribe link
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin ||
      "http://localhost:3000";

    // Get preheader text from campaign content or top-level metadata
    const preheaderText =
      campaignContent.preheader_text ||
      campaign.metadata?.preheader_text ||
      "";

    // Send test emails
    const results = await Promise.allSettled(
      test_emails.map(async (email: string) => {
        try {
          // Personalize content with test data
          let personalizedContent = campaignContent.content;
          personalizedContent = personalizedContent.replace(
            /\{\{first_name\}\}/g,
            "Test User"
          );
          personalizedContent = personalizedContent.replace(
            /\{\{last_name\}\}/g,
            "Demo"
          );

          // Personalize subject with test data
          let personalizedSubject = campaignContent.subject;
          personalizedSubject = personalizedSubject.replace(
            /\{\{first_name\}\}/g,
            "Test User"
          );
          personalizedSubject = personalizedSubject.replace(
            /\{\{last_name\}\}/g,
            "Demo"
          );

          // Generate preheader HTML
          const preheaderHtml = generatePreheaderHtml(preheaderText);

          // Add test email banner
          const testBanner = `
            <div style="background-color: #fbbf24; color: #92400e; text-align: center; padding: 10px; margin-bottom: 20px; border-radius: 4px;">
              <strong>🧪 TEST EMAIL</strong> - This is a test version of your campaign
            </div>
          `;

          // Add View in Browser link if public sharing is enabled
          let viewInBrowserLink = "";
          if (campaign.metadata?.public_sharing_enabled) {
            const viewInBrowserUrl = `${baseUrl}/public/campaigns/${id}`;
            viewInBrowserLink = `
              <div style="text-align: center; padding: 10px 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 20px;">
                <a href="${viewInBrowserUrl}" 
                   style="color: #6b7280; font-size: 12px; text-decoration: underline;">
                  View this email in your browser
                </a>
              </div>
            `;
          }

          const unsubscribeUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(
            email
          )}&campaign=${id}`;
          const unsubscribeFooter = `
            <div style="margin-top: 40px; padding: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
              <p style="margin: 0 0 10px 0;">
                This is a test email. You received this because you're testing the "${
                  campaign.metadata?.name
                }" campaign.
              </p>
              <p style="margin: 0 0 10px 0;">
                <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a> from future emails.
              </p>
              ${
                companyAddress
                  ? `<p style="margin: 0; font-size: 11px;">${companyAddress.replace(
                      /\n/g,
                      "<br>"
                    )}</p>`
                  : ""
              }
            </div>
          `;

          // Preheader goes first (before any visible content) so email clients pick it up
          const finalContent =
            preheaderHtml + testBanner + viewInBrowserLink + personalizedContent + unsubscribeFooter;

          // Add [TEST] prefix to subject
          const testSubject = `[TEST] ${personalizedSubject}`;

          // Send test email
          const result = await sendEmail({
            from: `${fromName} <${fromEmail}>`,
            to: [email],
            subject: testSubject,
            html: finalContent,
            text: finalContent.replace(/<[^>]*>/g, ""),
            reply_to: replyToEmail,
            headers: {
              "X-Campaign-ID": id,
              "X-Test-Email": "true",
              "X-Campaign-Name": campaign.metadata?.name || "Unknown Campaign",
            },
          });

          console.log("Test email sent successfully to:", email);
          return { success: true, email, messageId: result.id };
        } catch (error: any) {
          console.error(`Failed to send test email to ${email}:`, error);
          return { success: false, email, error: error.message };
        }
      })
    );

    // Calculate results
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;
    const failed = results.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && !r.value.success)
    ).length;

    console.log(
      `Test email send completed: ${successful} successful, ${failed} failed`
    );

    // Return results
    return NextResponse.json({
      success: true,
      message: `Test emails sent successfully to ${successful} of ${test_emails.length} recipients`,
      stats: {
        sent: successful,
        failed: failed,
        total: test_emails.length,
      },
      results: results.map((r) => {
        if (r.status === "fulfilled") {
          return r.value;
        } else {
          return {
            success: false,
            error: r.reason?.message || "Unknown error",
          };
        }
      }),
    });
  } catch (error: any) {
    console.error("Test email send error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to send test emails",
        details: "Check server logs for more information",
      },
      { status: 500 }
    );
  }
}
