import { NextRequest, NextResponse } from "next/server";
import { getMarketingCampaigns, syncCampaignTrackingStats } from "@/lib/cosmic";

export const dynamic = 'force-dynamic';

// This cron job syncs campaign statistics from email-tracking-events
// Run this periodically (e.g., every 15-30 minutes) to keep campaign stats up to date
export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron request (optional - can be removed for manual testing)
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log(
        "Warning: No valid cron secret provided. This should only happen in development."
      );
    }

    const now = new Date();
    console.log(
      `📊 Campaign stats sync job started at ${now.toISOString()} (UTC)`
    );

    // Get all campaigns that are Sent (and might have tracking data)
    const result = await getMarketingCampaigns();
    const sentCampaigns = result.campaigns.filter(
      (campaign) => campaign.metadata.status?.value === "Sent"
    );

    console.log(
      `Found ${sentCampaigns.length} sent campaigns to sync stats for`
    );

    if (sentCampaigns.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No sent campaigns to sync",
        synced: 0,
      });
    }

    let successCount = 0;
    let errorCount = 0;

    // Sync stats for each sent campaign
    for (const campaign of sentCampaigns) {
      try {
        console.log(
          `Syncing stats for campaign: ${campaign.metadata.name} (${campaign.id})`
        );

        await syncCampaignTrackingStats(campaign.id);
        successCount++;

        // Add small delay between campaigns to prevent API overload
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(
          `Error syncing stats for campaign ${campaign.id}:`,
          error
        );
        errorCount++;
        // Continue with next campaign instead of failing completely
      }
    }

    console.log(
      `✅ Campaign stats sync job completed. Synced ${successCount}/${sentCampaigns.length} campaigns. Errors: ${errorCount}`
    );

    return NextResponse.json({
      success: true,
      message: `Synced stats for ${successCount} campaigns`,
      synced: successCount,
      errors: errorCount,
      total: sentCampaigns.length,
    });
  } catch (error) {
    console.error("Campaign stats sync job error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Campaign stats sync job failed",
      },
      { status: 500 }
    );
  }
}
