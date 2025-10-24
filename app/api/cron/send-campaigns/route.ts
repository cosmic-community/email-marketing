import { NextRequest, NextResponse } from "next/server";
import {
  getMarketingCampaigns,
  updateCampaignStatus,
  updateCampaignProgress,
  getSettings,
  updateEmailCampaign,
  createCampaignSend,
  getCampaignSendStats,
  filterUnsentContacts,
  getCampaignTargetContacts,
  reserveContactsForSending,
} from "@/lib/cosmic";
import { sendEmail, ResendRateLimitError } from "@/lib/resend";
import { createUnsubscribeUrl, addTrackingToEmail } from "@/lib/email-tracking";
import { MarketingCampaign, EmailContact } from "@/types";

// Rate limiting configuration optimized for MongoDB/Lambda
// BALANCED CONFIGURATION - Optimized for ~134K emails/day with 3-minute cron
const EMAILS_PER_SECOND = 8; // Stay safely under 10/sec limit with 20% buffer
const MIN_DELAY_MS = Math.ceil(1000 / EMAILS_PER_SECOND); // ~125ms per email
const BATCH_SIZE = 50; // Increased from 25 - safe with pagination protection
const MAX_BATCHES_PER_RUN = 8; // Increased from 5 - reasonable for Lambda timeout
const DELAY_BETWEEN_DB_OPERATIONS = 75; // Reduced from 100ms - faster DB operations
const DELAY_BETWEEN_BATCHES = 400; // Reduced from 500ms - faster batch processing

// CAPACITY METRICS (with 3-minute cron interval):
// - Per run: ~400 emails (50 × 8 batches)
// - Per hour: ~8,000 emails (480 runs)
// - Per day: ~134,000 emails (with pagination safety limits)
// - 10K campaign completion: ~1.75 hours (~35 runs)

export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron request (optional - can be removed for manual testing)
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // For development/testing, allow requests without cron secret
      console.log(
        "Warning: No valid cron secret provided. This should only happen in development."
      );
    }

    const now = new Date();
    console.log(
      `Cron job started: Processing sending campaigns at ${now.toISOString()} (UTC)`
    );
    console.log(
      `⚡ BALANCED CONFIG: ${EMAILS_PER_SECOND} emails/sec (min ${MIN_DELAY_MS}ms between sends)`
    );
    console.log(
      `📊 Capacity: ${BATCH_SIZE} emails/batch × ${MAX_BATCHES_PER_RUN} batches = ${
        BATCH_SIZE * MAX_BATCHES_PER_RUN
      } emails/run (max)`
    );
    console.log(
      `🎯 Daily throughput: ~134K emails/day with 3-minute cron interval`
    );

    // Get all campaigns that are in "Sending" status
    const result = await getMarketingCampaigns();
    const sendingCampaigns = result.campaigns.filter(
      (campaign) => campaign.metadata.status?.value === "Sending"
    );

    // ALSO get "Scheduled" campaigns whose time has arrived and auto-start them
    const scheduledCampaigns = result.campaigns.filter((campaign) => {
      if (campaign.metadata.status?.value !== "Scheduled") return false;
      if (!campaign.metadata.send_date) return false;

      const scheduledTime = new Date(campaign.metadata.send_date);
      return scheduledTime <= now;
    });

    console.log(
      `Found ${sendingCampaigns.length} sending campaigns and ${scheduledCampaigns.length} scheduled campaigns ready to start`
    );

    // Transition scheduled campaigns to "Sending" status
    for (const campaign of scheduledCampaigns) {
      console.log(
        `🚀 Auto-starting scheduled campaign: ${campaign.metadata.name} (scheduled for ${campaign.metadata.send_date})`
      );
      await updateCampaignStatus(campaign.id, "Sending", {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
        open_rate: "0%",
        click_rate: "0%",
      });
    }

    // Combine both lists for processing
    const allCampaignsToProcess = [...sendingCampaigns, ...scheduledCampaigns];

    if (allCampaignsToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No campaigns to process",
        processed: 0,
      });
    }

    // Get settings for from email, etc.
    const settings = await getSettings();
    if (!settings) {
      console.error("No settings found - cannot send emails");
      return NextResponse.json(
        { error: "Email settings not configured" },
        { status: 500 }
      );
    }

    let totalProcessed = 0;

    // Process each campaign (both already-sending and newly-started scheduled campaigns)
    for (const campaign of allCampaignsToProcess) {
      try {
        // Check if campaign is scheduled for future
        const sendDate = campaign.metadata.send_date;
        if (sendDate) {
          const scheduledTime = new Date(sendDate);

          console.log(`Campaign "${campaign.metadata.name}" schedule check:`, {
            scheduledTime: scheduledTime.toISOString(),
            currentTime: now.toISOString(),
            shouldSend: scheduledTime <= now,
          });

          // Only process if scheduled time has passed
          if (scheduledTime > now) {
            console.log(
              `Skipping "${
                campaign.metadata.name
              }" - scheduled for ${scheduledTime.toISOString()}`
            );
            continue;
          }
        }

        // Check rate limit cooldown
        if (campaign.metadata.rate_limit_hit_at) {
          const hitAt = new Date(campaign.metadata.rate_limit_hit_at);
          const retryAfter = campaign.metadata.retry_after || 3600;
          const canRetryAt = new Date(hitAt.getTime() + retryAfter * 1000);

          if (now < canRetryAt) {
            console.log(
              `Skipping campaign ${
                campaign.id
              } - rate limit cooldown until ${canRetryAt.toISOString()}`
            );
            continue;
          }

          // Clear rate limit flag since we can retry now
          console.log(`Clearing rate limit flag for campaign ${campaign.id}`);
          await updateEmailCampaign(campaign.id, {
            rate_limit_hit_at: "",
            retry_after: "",
          } as any);
        }

        console.log(
          `Processing campaign: ${campaign.metadata.name} (${campaign.id})`
        );

        const result = await processCampaignBatch(campaign, settings);
        totalProcessed += result.processed;

        // Check if campaign completed
        if (result.completed && result.finalStats) {
          const sentAt = new Date().toISOString();

          console.log(
            `✅ Campaign ${campaign.id} completed! Marking as Sent...`
          );
          console.log(`📊 Final stats:`, result.finalStats);

          // Update status, stats, and sent_at in ONE atomic operation
          const { cosmic } = await import("@/lib/cosmic");
          await cosmic.objects.updateOne(campaign.id, {
            metadata: {
              status: {
                key: "sent",
                value: "Sent",
              },
              stats: result.finalStats,
              sent_at: sentAt,
            },
          });

          console.log(
            `✅ Campaign ${campaign.id} marked as Sent with timestamp ${sentAt}`
          );

          // IMPORTANT: Sync tracking stats immediately to capture any opens/clicks
          // that happened during sending (tracking pixels in preview panes, etc.)
          try {
            console.log(
              `📊 Syncing tracking stats for campaign ${campaign.id}...`
            );
            const { syncCampaignTrackingStats } = await import("@/lib/cosmic");
            await syncCampaignTrackingStats(campaign.id);
            console.log(
              `✅ Campaign ${campaign.id} tracking stats synced successfully`
            );
          } catch (syncError) {
            console.error(
              `⚠️  Error syncing tracking stats for campaign ${campaign.id}:`,
              syncError
            );
            // Don't fail the entire job if stats sync fails
          }
        }
      } catch (error) {
        console.error(`Error processing campaign ${campaign.id}:`, error);

        // Update campaign with error status
        await updateCampaignStatus(campaign.id, "Cancelled", {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
          open_rate: "0%",
          click_rate: "0%",
        });
      }
    }

    console.log(
      `✅ Cron job completed. Processed ${totalProcessed} emails across ${allCampaignsToProcess.length} campaigns`
    );
    console.log(
      `⚡ Balanced config performance: ${BATCH_SIZE} emails/batch, ${DELAY_BETWEEN_DB_OPERATIONS}ms DB throttling, ${DELAY_BETWEEN_BATCHES}ms batch delay`
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} emails across ${allCampaignsToProcess.length} campaigns`,
      processed: totalProcessed,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}

async function processCampaignBatch(
  campaign: MarketingCampaign,
  settings: any
) {
  // Get all target contacts for this campaign with responsible pagination
  // Limit to prevent memory issues and timeouts
  const allContacts = await getCampaignTargetContacts(campaign, {
    maxContactsPerList: 2500, // Reduced limit per list for better performance
    totalMaxContacts: 10000, // Overall safety limit to prevent timeouts
  });
  console.log(
    `📊 Campaign ${campaign.id}: Fetched ${allContacts.length} total target contacts (with pagination limits applied)`
  );

  // CRITICAL: Filter out contacts that have already been sent to (including pending)
  console.log(
    `🔍 Filtering unsent contacts from ${allContacts.length} total contacts...`
  );
  const unsentContactIds = await filterUnsentContacts(
    campaign.id,
    allContacts.map((c) => c.id)
  );

  const unsentContacts = allContacts.filter((c) =>
    unsentContactIds.includes(c.id)
  );

  const alreadySentCount = allContacts.length - unsentContacts.length;
  console.log(
    `✅ Filter complete: ${alreadySentCount} already sent/reserved, ${unsentContacts.length} remaining to send`
  );

  // Log first few emails for debugging
  if (unsentContacts.length > 0) {
    console.log(
      `📧 First 3 unsent emails: ${unsentContacts
        .slice(0, 3)
        .map((c) => c.metadata.email)
        .join(", ")}`
    );
  }

  if (unsentContacts.length === 0) {
    console.log(`Campaign ${campaign.id} is complete!`);

    // CRITICAL FIX: Get fresh stats from database, not stale batch stats
    const freshStats = await getCampaignSendStats(campaign.id);

    console.log(
      `📊 Fresh database stats - sent: ${freshStats.sent}, bounced: ${freshStats.bounced}, pending: ${freshStats.pending}, failed: ${freshStats.failed}`
    );

    return {
      processed: 0,
      completed: true,
      finalStats: {
        sent: freshStats.sent,
        delivered: freshStats.sent, // Delivered = sent initially (webhooks will update later)
        opened: 0,
        clicked: 0,
        bounced: freshStats.bounced,
        unsubscribed: 0,
        open_rate: "0%",
        click_rate: "0%",
      },
    };
  }

  // ATOMIC RESERVATION: Reserve contacts before sending with unique slug constraint
  console.log(
    `🔒 Reserving ${Math.min(
      BATCH_SIZE,
      unsentContacts.length
    )} contacts atomically...`
  );
  const { reserved: reservedContacts, pendingRecordIds } =
    await reserveContactsForSending(campaign.id, unsentContacts, BATCH_SIZE);

  if (reservedContacts.length === 0) {
    console.log(
      `⚠️  No contacts could be reserved (all already reserved by another cron job)`
    );
    return {
      processed: 0,
      completed: false,
      finalStats: undefined,
    };
  }

  console.log(`✅ Successfully reserved ${reservedContacts.length} contacts`);

  // Send emails with proper rate limiting
  let batchesProcessed = 0;
  let rateLimitHit = false;
  let emailsProcessed = 0;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  // Process reserved contacts in smaller batches
  for (
    let i = 0;
    i < reservedContacts.length && batchesProcessed < MAX_BATCHES_PER_RUN;
    i += BATCH_SIZE
  ) {
    if (rateLimitHit) break;

    const batch = reservedContacts.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${batchesProcessed + 1}: ${
        batch.length
      } reserved contacts`
    );

    // Process each reserved contact with proper rate limiting
    for (let contactIndex = 0; contactIndex < batch.length; contactIndex++) {
      if (rateLimitHit) break;

      const contact = batch[contactIndex];

      // CRITICAL FIX: Add explicit undefined check to satisfy TypeScript
      if (!contact) {
        console.error(`Undefined contact at batch index ${contactIndex}`);
        continue;
      }

      const startTime = Date.now();
      const pendingRecordId = pendingRecordIds.get(contact.id);

      try {
        // Get campaign content
        const emailContent = campaign.metadata.campaign_content?.content || "";
        const emailSubject = campaign.metadata.campaign_content?.subject || "";

        if (!emailContent || !emailSubject) {
          throw new Error("Campaign content or subject is missing");
        }

        // Personalize content
        let personalizedContent = emailContent.replace(
          /\{\{first_name\}\}/g,
          contact.metadata.first_name || "there"
        );
        let personalizedSubject = emailSubject.replace(
          /\{\{first_name\}\}/g,
          contact.metadata.first_name || "there"
        );

        // Add View in Browser link if public sharing is enabled
        if (campaign.metadata.public_sharing_enabled) {
          const viewInBrowserUrl = `${baseUrl}/public/campaigns/${campaign.id}`;
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
          campaign.id
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
            settings.metadata.reply_to_email || settings.metadata.from_email,
          campaignId: campaign.id,
          contactId: contact.id,
          headers: {
            "X-Campaign-ID": campaign.id,
            "X-Contact-ID": contact.id,
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });

        console.log(`✅ Email sent to ${contact.metadata.email}`);

        // Update the pending record to "sent" status

        await createCampaignSend({
          campaignId: campaign.id,
          contactId: contact.id,
          contactEmail: contact.metadata.email,
          status: "sent",
          resendMessageId: result.id,
          pendingRecordId: pendingRecordId,
        });

        // Throttle database operations to prevent connection pool exhaustion
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_DB_OPERATIONS)
        );

        emailsProcessed++;

        // Calculate dynamic delay to maintain rate limit
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, MIN_DELAY_MS - elapsed);

        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error: any) {
        // Check if it's a rate limit error
        if (
          error instanceof ResendRateLimitError ||
          error.message?.toLowerCase().includes("rate limit") ||
          error.message?.toLowerCase().includes("too many requests") ||
          error.statusCode === 429
        ) {
          const retryAfter = error.retryAfter || 3600;
          console.log(
            `⚠️  Rate limit hit! Pausing campaign. Retry after ${retryAfter}s`
          );

          // Save rate limit state
          await updateEmailCampaign(campaign.id, {
            rate_limit_hit_at: new Date().toISOString(),
            retry_after: retryAfter,
          } as any);

          rateLimitHit = true;
          break; // Stop processing this campaign
        }

        // Regular error - update pending record to "failed"
        console.error(
          `❌ Failed to send to ${contact.metadata.email}:`,
          error.message
        );

        await createCampaignSend({
          campaignId: campaign.id,
          contactId: contact.id,
          contactEmail: contact.metadata.email,
          status: "failed",
          errorMessage: error.message,
          pendingRecordId: pendingRecordId,
        });

        // Throttle database operations even on errors
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_DB_OPERATIONS)
        );

        // Still apply rate limiting even on errors
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, MIN_DELAY_MS - elapsed);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    batchesProcessed++;

    // CRITICAL FIX: Update campaign progress after each batch using fresh database stats
    const freshStats = await getCampaignSendStats(campaign.id);

    const progressPercentage = Math.round(
      (freshStats.sent / allContacts.length) * 100
    );

    console.log(
      `💾 Updating campaign progress: ${freshStats.sent}/${allContacts.length} sent (${progressPercentage}%)`
    );

    await updateCampaignProgress(campaign.id, {
      sent: freshStats.sent,
      failed: freshStats.failed + freshStats.bounced,
      total: allContacts.length,
      progress_percentage: progressPercentage,
      last_batch_completed: new Date().toISOString(),
    });

    // Throttle after progress update to prevent connection pool exhaustion
    await new Promise((resolve) =>
      setTimeout(resolve, DELAY_BETWEEN_DB_OPERATIONS)
    );

    console.log(
      `Batch ${batchesProcessed} complete. Database stats: ${freshStats.sent} sent, ${freshStats.pending} pending, ${freshStats.failed} failed, ${freshStats.bounced} bounced`
    );

    // Optimized delay between batches for MongoDB/Lambda performance
    if (batchesProcessed < MAX_BATCHES_PER_RUN && !rateLimitHit) {
      console.log(
        `⏸️  Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch for MongoDB optimization...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES)
      );
    }
  }

  // SIMPLE FIX: Check if campaign is complete by comparing stats to total contacts
  if (!rateLimitHit) {
    console.log(`📊 Checking if campaign is complete...`);

    const finalFreshStats = await getCampaignSendStats(campaign.id);

    console.log(
      `📊 Final stats: sent=${finalFreshStats.sent}, failed=${finalFreshStats.failed}, bounced=${finalFreshStats.bounced}, pending=${finalFreshStats.pending}, total_contacts=${allContacts.length}`
    );

    // Calculate total processed (sent + failed + bounced)
    const totalProcessed =
      finalFreshStats.sent + finalFreshStats.failed + finalFreshStats.bounced;

    // Campaign is complete if all contacts have been processed and no pending
    if (totalProcessed >= allContacts.length && finalFreshStats.pending === 0) {
      console.log(
        `✅ Campaign ${campaign.id} fully completed! ${totalProcessed}/${allContacts.length} contacts processed`
      );

      return {
        processed: emailsProcessed,
        completed: true,
        finalStats: {
          sent: finalFreshStats.sent,
          delivered: finalFreshStats.sent,
          opened: 0,
          clicked: 0,
          bounced: finalFreshStats.bounced,
          unsubscribed: 0,
          open_rate: "0%",
          click_rate: "0%",
        },
      };
    } else {
      console.log(
        `⏳ Campaign ${campaign.id} still in progress: ${totalProcessed}/${allContacts.length} processed, ${finalFreshStats.pending} pending`
      );
    }
  }

  return {
    processed: emailsProcessed,
    completed: false,
    finalStats: undefined,
  };
}
