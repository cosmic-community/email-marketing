import { inngest } from "@/lib/inngest";
import {
  getSettings,
  updateCampaignStatus,
  updateCampaignProgress,
  getCampaignSendStats,
  filterUnsentContacts,
  getCampaignTargetContacts,
  reserveContactsForSending,
  createCampaignSend,
  syncCampaignTrackingStats,
} from "@/lib/cosmic";
import { sendEmail, ResendRateLimitError } from "@/lib/resend";
import { createUnsubscribeUrl } from "@/lib/email-tracking";
import { MarketingCampaign, EmailContact } from "@/types";

// Rate limiting configuration - same as before
const EMAILS_PER_SECOND = 9; // 90% of 10/sec limit
const MIN_DELAY_MS = Math.ceil(1000 / EMAILS_PER_SECOND); // ~111ms per email
const BATCH_SIZE = 50;
const DELAY_BETWEEN_DB_OPERATIONS = 50;
const DELAY_BETWEEN_BATCHES = 300;

// Inngest background function - NO TIMEOUT LIMITS! 🎉
export const sendCampaignFunction = inngest.createFunction(
  {
    id: "send-campaign",
    name: "Send Email Campaign",
    concurrency: {
      // Only process one campaign at a time to respect rate limits
      limit: 1,
    },
    retries: 3, // Auto-retry on failure
  },
  { event: "campaign/send" },
  async ({ event, step }) => {
    const { campaignId, campaign } = event.data as {
      campaignId: string;
      campaign: MarketingCampaign;
    };

    console.log(`📧 [INNGEST] Starting campaign send: ${campaignId}`);

    // Step 1: Get settings
    const settings = await step.run("get-settings", async () => {
      console.log(`⚙️  Fetching email settings...`);
      return await getSettings();
    });

    if (!settings) {
      throw new Error("Email settings not configured");
    }

    // FIXED: Fetch contacts OUTSIDE of step.run() to avoid step output size limit
    // Inngest has a 512KB limit on step outputs. With 36K+ contacts, this exceeds the limit.
    // By fetching outside steps, we avoid the limit while still getting Inngest's benefits:
    // - No timeout limits
    // - Step-based retry (batches can retry independently)
    // - Automatic failure handling
    console.log(`📋 Fetching target contacts for campaign ${campaignId}...`);
    const allContacts = await getCampaignTargetContacts(campaign, {
      maxContactsPerList: 15000,
      totalMaxContacts: 100000,
    });

    console.log(`📊 Total target contacts: ${allContacts.length}`);

    // Step 2: Filter out already-sent contacts (returns only IDs, not full objects)
    const unsentContactIds = await step.run("filter-unsent", async () => {
      console.log(`🔍 Filtering unsent contacts...`);
      return await filterUnsentContacts(campaignId, allContacts);
    });

    const unsentContacts = allContacts.filter((c) =>
      unsentContactIds.includes(c.id)
    );

    console.log(
      `✅ ${unsentContacts.length} contacts remaining to send (${
        allContacts.length - unsentContacts.length
      } already sent)`
    );

    if (unsentContacts.length === 0) {
      // Campaign is complete!
      const freshStats = await getCampaignSendStats(campaignId);

      await step.run("mark-campaign-complete", async () => {
        const { cosmic } = await import("@/lib/cosmic");
        await cosmic.objects.updateOne(campaignId, {
          metadata: {
            status: {
              key: "sent",
              value: "Sent",
            },
            stats: {
              sent: freshStats.sent,
              delivered: freshStats.sent,
              opened: 0,
              clicked: 0,
              bounced: freshStats.bounced,
              unsubscribed: 0,
              open_rate: "0%",
              click_rate: "0%",
            },
            sent_at: new Date().toISOString(),
          },
        });

        // Sync tracking stats
        await syncCampaignTrackingStats(campaignId);
      });

      return {
        success: true,
        completed: true,
        sent: freshStats.sent,
        total: allContacts.length,
      };
    }

    // Step 4: Send emails in batches (unlimited time!)
    let totalSent = 0;
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    // Process in batches
    const totalBatches = Math.ceil(unsentContacts.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, unsentContacts.length);
      const batchContacts = unsentContacts.slice(batchStart, batchEnd);

      await step.run(`batch-${batchIndex}`, async () => {
        console.log(
          `📦 Processing batch ${batchIndex + 1}/${totalBatches} (${
            batchContacts.length
          } contacts)`
        );

        // Reserve contacts atomically
        const { reserved: reservedContacts, pendingRecordIds } =
          await reserveContactsForSending(
            campaignId,
            batchContacts,
            BATCH_SIZE
          );

        if (reservedContacts.length === 0) {
          console.log(`⚠️  No contacts reserved in this batch`);
          return 0;
        }

        // Send emails
        let batchSent = 0;
        for (const contact of reservedContacts) {
          const startTime = Date.now();
          const pendingRecordId = pendingRecordIds.get(contact.id);

          try {
            // Get campaign content
            const emailContent =
              campaign.metadata.campaign_content?.content || "";
            const emailSubject =
              campaign.metadata.campaign_content?.subject || "";

            // Personalize content
            let personalizedContent = emailContent.replace(
              /\{\{first_name\}\}/g,
              contact.metadata.first_name || "there"
            );
            let personalizedSubject = emailSubject.replace(
              /\{\{first_name\}\}/g,
              contact.metadata.first_name || "there"
            );

            // Add View in Browser link if enabled
            if (campaign.metadata.public_sharing_enabled) {
              const viewInBrowserUrl = `${baseUrl}/public/campaigns/${campaignId}`;
              const viewInBrowserLink = `
                <div style="text-align: center; padding: 10px 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 20px;">
                  <a href="${viewInBrowserUrl}" 
                     style="color: #6b7280; font-size: 12px; text-decoration: underline;">
                    View this email in your browser
                  </a>
                </div>
              `;
              personalizedContent = viewInBrowserLink + personalizedContent;
            }

            // Add unsubscribe footer
            const unsubscribeUrl = createUnsubscribeUrl(
              contact.metadata.email,
              baseUrl,
              campaignId
            );

            const unsubscribeFooter = `
              <div style="margin-top: 40px; padding: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
                <p style="margin: 0 0 10px 0;">
                  You received this email because you subscribed to our mailing list.
                </p>
                <p style="margin: 0 0 10px 0;">
                  <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a> from future emails.
                </p>
              </div>
            `;

            personalizedContent += unsubscribeFooter;

            // Send email
            const result = await sendEmail({
              from: `${settings.metadata.from_name} <${settings.metadata.from_email}>`,
              to: contact.metadata.email,
              subject: personalizedSubject,
              html: personalizedContent,
              reply_to:
                settings.metadata.reply_to_email ||
                settings.metadata.from_email,
              campaignId: campaignId,
              contactId: contact.id,
              headers: {
                "X-Campaign-ID": campaignId,
                "X-Contact-ID": contact.id,
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            });

            console.log(`✅ Sent to ${contact.metadata.email}`);

            // Update record to "sent"
            await createCampaignSend({
              campaignId: campaignId,
              contactId: contact.id,
              contactEmail: contact.metadata.email,
              status: "sent",
              resendMessageId: result.id,
              pendingRecordId: pendingRecordId,
            });

            batchSent++;

            // Throttle to respect rate limits
            await new Promise((resolve) =>
              setTimeout(resolve, DELAY_BETWEEN_DB_OPERATIONS)
            );

            const elapsed = Date.now() - startTime;
            const delay = Math.max(0, MIN_DELAY_MS - elapsed);
            if (delay > 0) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          } catch (error: any) {
            // Check for rate limit error
            if (
              error instanceof ResendRateLimitError ||
              error.message?.toLowerCase().includes("rate limit") ||
              error.message?.toLowerCase().includes("too many requests") ||
              error.statusCode === 429
            ) {
              const retryAfter = error.retryAfter || 3600;
              console.log(
                `⚠️  Rate limit hit! Will retry after ${retryAfter}s`
              );

              // Inngest will automatically retry this step
              throw new Error(
                `Rate limit hit. Retry after ${retryAfter} seconds`
              );
            }

            // Regular error - mark as failed
            console.error(
              `❌ Failed to send to ${contact.metadata.email}:`,
              error.message
            );

            await createCampaignSend({
              campaignId: campaignId,
              contactId: contact.id,
              contactEmail: contact.metadata.email,
              status: "failed",
              errorMessage: error.message,
              pendingRecordId: pendingRecordId,
            });

            await new Promise((resolve) =>
              setTimeout(resolve, DELAY_BETWEEN_DB_OPERATIONS)
            );
          }
        }

        // Update progress after batch
        const freshStats = await getCampaignSendStats(campaignId);
        const progressPercentage = Math.round(
          (freshStats.sent / allContacts.length) * 100
        );

        await updateCampaignProgress(campaignId, {
          sent: freshStats.sent,
          failed: freshStats.failed + freshStats.bounced,
          total: allContacts.length,
          progress_percentage: progressPercentage,
          last_batch_completed: new Date().toISOString(),
        });

        console.log(
          `📊 Batch complete: ${batchSent} sent, ${freshStats.sent}/${allContacts.length} total (${progressPercentage}%)`
        );

        return batchSent;
      });

      // Delay between batches
      if (batchIndex < totalBatches - 1) {
        await step.sleep("batch-delay", `${DELAY_BETWEEN_BATCHES}ms`);
      }
    }

    // Check if campaign is complete
    const finalStats = await step.run("check-completion", async () => {
      return await getCampaignSendStats(campaignId);
    });

    const totalProcessed =
      finalStats.sent + finalStats.failed + finalStats.bounced;

    if (totalProcessed >= allContacts.length && finalStats.pending === 0) {
      // Mark campaign as complete
      await step.run("mark-complete", async () => {
        const { cosmic } = await import("@/lib/cosmic");
        await cosmic.objects.updateOne(campaignId, {
          metadata: {
            status: {
              key: "sent",
              value: "Sent",
            },
            stats: {
              sent: finalStats.sent,
              delivered: finalStats.sent,
              opened: 0,
              clicked: 0,
              bounced: finalStats.bounced,
              unsubscribed: 0,
              open_rate: "0%",
              click_rate: "0%",
            },
            sent_at: new Date().toISOString(),
          },
        });

        await syncCampaignTrackingStats(campaignId);
      });

      return {
        success: true,
        completed: true,
        sent: finalStats.sent,
        failed: finalStats.failed,
        total: allContacts.length,
      };
    }

    return {
      success: true,
      completed: false,
      sent: finalStats.sent,
      pending: finalStats.pending,
      total: allContacts.length,
    };
  }
);
