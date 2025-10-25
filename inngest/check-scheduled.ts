import { inngest } from "@/lib/inngest";
import { getMarketingCampaigns } from "@/lib/cosmic";

/**
 * Inngest Scheduled Function - Backup for checking scheduled campaigns
 *
 * This provides redundancy alongside the Vercel cron.
 * Runs every 5 minutes to check for scheduled campaigns.
 *
 * If Vercel cron misses a check, Inngest will catch it.
 */
export const checkScheduledCampaignsFunction = inngest.createFunction(
  {
    id: "check-scheduled-campaigns",
    name: "Check Scheduled Campaigns",
  },
  { cron: "*/5 * * * *" }, // Every 5 minutes
  async ({ step }) => {
    const now = new Date();

    console.log(
      `📅 [INNGEST CRON] Checking for scheduled campaigns at ${now.toISOString()}`
    );

    // Step 1: Get all campaigns
    const result = await step.run("fetch-campaigns", async () => {
      return await getMarketingCampaigns();
    });

    // Step 2: Filter scheduled campaigns whose time has arrived
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
      return {
        success: true,
        message: "No scheduled campaigns to process",
        processed: 0,
      };
    }

    // Step 3: Trigger send for each scheduled campaign
    const triggered = [];
    const errors = [];

    for (const campaign of scheduledCampaigns) {
      const result = await step.run(`trigger-${campaign.id}`, async () => {
        try {
          console.log(
            `🚀 [TRIGGER] Starting campaign: ${campaign.metadata.name} (scheduled for ${campaign.metadata.send_date})`
          );

          // Trigger the send campaign function
          await inngest.send({
            name: "campaign/send",
            data: {
              campaignId: campaign.id,
              campaign,
            },
          });

          return {
            success: true,
            id: campaign.id,
            name: campaign.metadata.name,
            scheduledFor: campaign.metadata.send_date,
          };
        } catch (error) {
          console.error(
            `❌ [ERROR] Failed to trigger campaign ${campaign.id}:`,
            error
          );
          return {
            success: false,
            id: campaign.id,
            name: campaign.metadata.name,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      });

      if (result.success) {
        triggered.push(result);
      } else {
        errors.push(result);
      }
    }

    console.log(
      `✅ [COMPLETE] Triggered: ${triggered.length}, Errors: ${errors.length}`
    );

    return {
      success: true,
      message: `Triggered ${triggered.length} scheduled campaigns`,
      triggered,
      errors,
    };
  }
);
