import { NextRequest, NextResponse } from "next/server";
import { getMarketingCampaigns } from "@/lib/cosmic";
import { inngest } from "@/lib/inngest";

/**
 * Simplified Cron Job - Only checks for scheduled campaigns
 *
 * This replaces the complex send-campaigns cron.
 * It ONLY:
 * 1. Checks for "Scheduled" campaigns whose send_date has arrived
 * 2. Triggers Inngest to handle the actual sending
 *
 * Runs every 2 minutes via Vercel Cron
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log(
      `📅 [CRON] Checking for scheduled campaigns at ${new Date().toISOString()}`
    );

    // Verify this is a cron request
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log("⚠️  [AUTH] No valid cron secret provided");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Get all campaigns
    const result = await getMarketingCampaigns();

    // Find scheduled campaigns whose time has arrived
    const scheduledCampaigns = result.campaigns.filter((campaign) => {
      if (campaign.metadata.status?.value !== "Scheduled") return false;
      if (!campaign.metadata.send_date) return false;

      const scheduledTime = new Date(campaign.metadata.send_date);
      return scheduledTime <= now;
    });

    console.log(
      `📊 [SCHEDULED] Found ${scheduledCampaigns.length} campaigns ready to send`
    );

    if (scheduledCampaigns.length === 0) {
      const elapsed = Date.now() - startTime;
      console.log(
        `✅ [COMPLETE] No scheduled campaigns to process (${elapsed}ms)`
      );
      return NextResponse.json({
        success: true,
        message: "No scheduled campaigns to process",
        processed: 0,
        executionTime: `${elapsed}ms`,
      });
    }

    // Trigger Inngest for each scheduled campaign
    const triggered = [];
    const errors = [];

    for (const campaign of scheduledCampaigns) {
      try {
        console.log(
          `🚀 [TRIGGER] Starting campaign: ${campaign.metadata.name} (scheduled for ${campaign.metadata.send_date})`
        );

        // Trigger Inngest to handle the sending
        await inngest.send({
          name: "campaign/send",
          data: {
            campaignId: campaign.id,
            campaign,
          },
        });

        triggered.push({
          id: campaign.id,
          name: campaign.metadata.name,
          scheduledFor: campaign.metadata.send_date,
        });

        console.log(`✅ [TRIGGER] Campaign ${campaign.id} queued in Inngest`);
      } catch (error) {
        console.error(
          `❌ [ERROR] Failed to trigger campaign ${campaign.id}:`,
          error
        );
        errors.push({
          id: campaign.id,
          name: campaign.metadata.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`\n🎉 [COMPLETE] Scheduled campaign check completed!`);
    console.log(
      `📊 [SUMMARY] Triggered: ${triggered.length}, Errors: ${errors.length}`
    );
    console.log(`⏱️  [TIME] Execution time: ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      message: `Triggered ${triggered.length} scheduled campaigns`,
      triggered,
      errors,
      executionTime: `${elapsed}ms`,
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ [FATAL] Cron job error after ${elapsed}ms:`, error);

    return NextResponse.json(
      {
        error: "Cron job failed",
        message: error instanceof Error ? error.message : "Unknown error",
        executionTime: `${elapsed}ms`,
      },
      { status: 500 }
    );
  }
}
