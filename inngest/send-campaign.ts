import { inngest } from "@/lib/inngest";
import {
  getSettings,
  updateCampaignStatus,
  updateCampaignProgress,
  getCampaignSendStats,
  filterUnsentContacts,
  getCampaignTargetContacts,
  reserveContactsForSending,
  batchUpdateCampaignSends,
  syncCampaignTrackingStats,
} from "@/lib/cosmic";
import type { BatchSendUpdate } from "@/lib/cosmic";
import {
  sendEmailBatch,
  ResendRateLimitError,
} from "@/lib/resend";
import type { BatchEmailPayload } from "@/lib/resend";
import { createUnsubscribeUrl, addTrackingToEmail, generatePreheaderHtml } from "@/lib/email-tracking";
import { MarketingCampaign, EmailContact } from "@/types";

// Resend batch API: max 100 emails per call
const BATCH_SIZE = 100;
// Process 20 batches per Inngest run (2,000 contacts) then trigger continuation
// 20 batches x ~10s each = ~200s, safely under Vercel 300s limit
const MAX_BATCHES_PER_RUN = 20;

export const sendCampaignFunction = inngest.createFunction(
  {
    id: "send-campaign",
    name: "Send Email Campaign",
    concurrency: {
      limit: 1,
    },
    retries: 3,
  },
  { event: "campaign/send" },
  async ({ event, step }) => {
    const { campaignId, campaign } = event.data as {
      campaignId: string;
      campaign: MarketingCampaign;
    };

    const runTimestamp = Date.now();

    console.log(`[INNGEST] Starting campaign send: ${campaignId}`);

    if (campaign.metadata.status?.value !== "Sending") {
      await step.run("ensure-sending-status", async () => {
        await updateCampaignStatus(campaignId, "Sending", {
          sent: campaign.metadata.stats?.sent || 0,
          delivered: campaign.metadata.stats?.delivered || 0,
          opened: campaign.metadata.stats?.opened || 0,
          clicked: campaign.metadata.stats?.clicked || 0,
          bounced: campaign.metadata.stats?.bounced || 0,
          unsubscribed: campaign.metadata.stats?.unsubscribed || 0,
          open_rate: campaign.metadata.stats?.open_rate || "0%",
          click_rate: campaign.metadata.stats?.click_rate || "0%",
        });
      });
    }

    const settings = await step.run("get-settings", async () => {
      return await getSettings();
    });

    if (!settings) {
      throw new Error("Email settings not configured");
    }

    // Fetch all contacts ONCE (not duplicated across steps)
    const allContacts = await getCampaignTargetContacts(campaign, {
      maxContactsPerList: 15000,
      totalMaxContacts: 100000,
    });
    console.log(`Total target contacts: ${allContacts.length}`);

    // Filter unsent inside a step (DB query, retriable)
    const unsentContactIds = await step.run(
      "filter-unsent-contacts",
      async () => {
        const ids = await filterUnsentContacts(campaignId, allContacts);
        console.log(
          `${ids.length} contacts remaining to send (${allContacts.length - ids.length} already sent)`
        );
        return ids;
      }
    );

    // Build unsent contacts list from already-fetched data
    const unsentIdSet = new Set(unsentContactIds);
    const unsentContacts = allContacts.filter((c) => unsentIdSet.has(c.id));

    if (unsentContacts.length === 0) {
      const freshStats = await getCampaignSendStats(campaignId);

      await step.run("mark-campaign-complete", async () => {
        const { cosmic } = await import("@/lib/cosmic");
        await cosmic.objects.updateOne(campaignId, {
          metadata: {
            status: { key: "sent", value: "Sent" },
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
        await syncCampaignTrackingStats(campaignId);
      });

      return {
        success: true,
        completed: true,
        sent: freshStats.sent,
        total: allContacts.length,
      };
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const fromAddress = `${settings.metadata.from_name} <${settings.metadata.from_email}>`;
    const replyTo = settings.metadata.reply_to_email || settings.metadata.from_email;
    const emailContent = campaign.metadata.campaign_content?.content || "";
    const emailSubject = campaign.metadata.campaign_content?.subject || "";
    const preheaderText =
      campaign.metadata.campaign_content?.preheader_text ||
      campaign.metadata.preheader_text ||
      "";

    // Generate preheader HTML once (same for all recipients)
    const preheaderHtml = generatePreheaderHtml(preheaderText);

    const totalBatches = Math.ceil(unsentContacts.length / BATCH_SIZE);
    const batchesToProcess = Math.min(totalBatches, MAX_BATCHES_PER_RUN);

    console.log(
      `Processing ${batchesToProcess} batches (of ${totalBatches} total) in this run`
    );

    for (let batchIndex = 0; batchIndex < batchesToProcess; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, unsentContacts.length);
      const batchContacts = unsentContacts.slice(batchStart, batchEnd);

      await step.run(`batch-${batchIndex}`, async () => {
        console.log(
          `Batch ${batchIndex + 1}/${totalBatches} (${batchContacts.length} contacts)`
        );

        // Reserve contacts with parallel check+insert
        const { reserved: reservedContacts, pendingRecordIds } =
          await reserveContactsForSending(
            campaignId,
            batchContacts,
            BATCH_SIZE
          );

        if (reservedContacts.length === 0) {
          console.log(`No contacts reserved in batch ${batchIndex}`);
          return 0;
        }

        // Build personalized email payloads for batch send
        const payloads: BatchEmailPayload[] = [];
        const payloadContactMap: EmailContact[] = [];

        for (const contact of reservedContacts) {
          let personalizedContent = emailContent.replace(
            /\{\{first_name\}\}/g,
            contact.metadata.first_name || "there"
          );
          let personalizedSubject = emailSubject.replace(
            /\{\{first_name\}\}/g,
            contact.metadata.first_name || "there"
          );

          if (campaign.metadata.public_sharing_enabled) {
            const viewInBrowserUrl = `${baseUrl}/public/campaigns/${campaignId}`;
            personalizedContent = `
              <div style="text-align: center; padding: 10px 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 20px;">
                <a href="${viewInBrowserUrl}" 
                   style="color: #6b7280; font-size: 12px; text-decoration: underline;">
                  View this email in your browser
                </a>
              </div>
            ` + personalizedContent;
          }

          const unsubscribeUrl = createUnsubscribeUrl(
            contact.metadata.email,
            baseUrl,
            campaignId
          );

          personalizedContent += `
            <div style="margin-top: 40px; padding: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
              <p style="margin: 0 0 10px 0;">
                You received this email because you subscribed to our mailing list.
              </p>
              <p style="margin: 0 0 10px 0;">
                <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a> from future emails.
              </p>
            </div>
          `;

          // Prepend preheader HTML (before all visible content)
          personalizedContent = preheaderHtml + personalizedContent;

          // Apply click tracking
          const trackedContent = addTrackingToEmail(
            personalizedContent,
            campaignId,
            contact.id,
            baseUrl
          );

          payloads.push({
            from: fromAddress,
            to: contact.metadata.email,
            subject: personalizedSubject,
            html: trackedContent,
            reply_to: replyTo,
            headers: {
              "X-Campaign-ID": campaignId,
              "X-Contact-ID": contact.id,
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
          payloadContactMap.push(contact);
        }

        // Send entire batch in one Resend API call with idempotency key
        const idempotencyKey = `campaign-${campaignId}-batch-${batchIndex}-${runTimestamp}`;

        try {
          const batchResult = await sendEmailBatch(payloads, idempotencyKey);

          // Build update records for all successful sends
          const updates: BatchSendUpdate[] = payloadContactMap.map(
            (contact, i) => ({
              campaignId,
              contactId: contact.id,
              contactEmail: contact.metadata.email,
              status: "sent" as const,
              resendMessageId: batchResult.data[i]?.id || "",
              pendingRecordId: pendingRecordIds.get(contact.id),
            })
          );

          // Update all send records in parallel (groups of 10)
          await batchUpdateCampaignSends(updates);

          console.log(`Batch ${batchIndex + 1}: ${updates.length} sent`);
        } catch (error: any) {
          if (
            error instanceof ResendRateLimitError ||
            error.message?.toLowerCase().includes("rate limit") ||
            error.statusCode === 429
          ) {
            console.log(
              `Rate limit hit on batch ${batchIndex}. Inngest will retry.`
            );
            throw error;
          }

          // On non-rate-limit batch failure, mark all contacts in this batch as failed
          console.error(
            `Batch ${batchIndex + 1} failed:`,
            error.message
          );

          const failUpdates: BatchSendUpdate[] = payloadContactMap.map(
            (contact) => ({
              campaignId,
              contactId: contact.id,
              contactEmail: contact.metadata.email,
              status: "failed" as const,
              errorMessage: error.message,
              pendingRecordId: pendingRecordIds.get(contact.id),
            })
          );
          await batchUpdateCampaignSends(failUpdates);
        }

        // Update progress
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

        return freshStats.sent;
      });
    }

    // Check completion
    const finalStats = await step.run("check-completion", async () => {
      return await getCampaignSendStats(campaignId);
    });

    const totalProcessed =
      finalStats.sent + finalStats.failed + finalStats.bounced;

    console.log(
      `Progress: ${finalStats.sent}/${allContacts.length} sent, ${finalStats.pending} pending`
    );

    // Trigger continuation if more contacts remain
    if (
      batchesToProcess === MAX_BATCHES_PER_RUN &&
      (finalStats.pending > 0 || totalProcessed < allContacts.length)
    ) {
      await step.run("trigger-continuation", async () => {
        const remaining = allContacts.length - totalProcessed;
        console.log(
          `Triggering continuation for remaining ~${remaining} contacts...`
        );
        await inngest.send({
          name: "campaign/send",
          data: { campaignId, campaign },
        });
      });

      return {
        success: true,
        completed: false,
        sent: finalStats.sent,
        pending: finalStats.pending,
        total: allContacts.length,
        message: `Processed ${batchesToProcess} batches, continuation triggered`,
      };
    }

    // Campaign fully complete
    if (totalProcessed >= allContacts.length && finalStats.pending === 0) {
      await step.run("mark-complete", async () => {
        const { cosmic } = await import("@/lib/cosmic");
        await cosmic.objects.updateOne(campaignId, {
          metadata: {
            status: { key: "sent", value: "Sent" },
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
