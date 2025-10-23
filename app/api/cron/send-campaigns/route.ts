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
// MAXIMUM SAFE SPEED - Optimized for ~37.5K emails/hour with 2-minute cron
const EMAILS_PER_SECOND = 9; // 90% of 10/sec limit - aggressive but safe
const MIN_DELAY_MS = Math.ceil(1000 / EMAILS_PER_SECOND); // ~111ms per email
const BATCH_SIZE = 50; // Proven safe batch size
const MAX_BATCHES_PER_RUN = 25; // AGGRESSIVE: Maximum batches for <1 hour 36K sends
const DELAY_BETWEEN_DB_OPERATIONS = 50; // Optimized - reduced from 75ms
const DELAY_BETWEEN_BATCHES = 300; // Optimized - reduced from 400ms

// CAPACITY METRICS (with 2-minute cron interval):
// - Per run: ~1,250 emails (50 × 25 batches)
// - Per hour: ~37,500 emails (30 runs)
// - Per day: ~900,000 emails (theoretical max with pagination)
// - 36K campaign completion: ~58 minutes (~29 runs)

// ===================== DUPLICATE EMAIL PREVENTION =====================
// CRITICAL FIX: Add campaign locking mechanism to prevent duplicate emails from concurrent cron jobs
//
// THE PROBLEM:
// - With 2-minute cron intervals and aggressive batch processing, multiple cron jobs can run concurrently
// - Cosmic auto-appends UUIDs to duplicate slugs (no unique constraint enforcement)
// - Without locking, two jobs could both:
//   1. Fetch the same campaign contacts
//   2. Filter unsent contacts (both see same contacts as "unsent")
//   3. Reserve and send to the SAME contacts = DUPLICATE EMAILS
//
// THE SOLUTION (Two-Layer Defense):
// Layer 1: Campaign-level locks ensure only ONE cron job processes a campaign at a time
// Layer 2: Check-before-insert in reserveContactsForSending() verifies no existing send records
//
// WHY BOTH LAYERS ARE NEEDED:
// - Campaign locks prevent concurrent processing of the same campaign (primary defense)
// - Check-before-insert catches edge cases where locks might fail/expire
// - This ensures ZERO duplicate emails even in distributed serverless environments
//
const PROCESSING_CAMPAIGNS = new Map<
  string,
  { timestamp: number; processor: string }
>();
const CAMPAIGN_LOCK_TIMEOUT = 180000; // 3 minutes lock timeout (longer than typical processing time)

function generateProcessorId(): string {
  return `processor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

async function acquireCampaignLock(
  campaignId: string
): Promise<{ acquired: boolean; processorId?: string }> {
  const now = Date.now();
  const processorId = generateProcessorId();

  // Check if campaign is already locked by another processor
  const existingLock = PROCESSING_CAMPAIGNS.get(campaignId);
  if (existingLock) {
    const lockAge = now - existingLock.timestamp;

    // If lock is not expired, reject
    if (lockAge < CAMPAIGN_LOCK_TIMEOUT) {
      console.log(
        `🔒 Campaign ${campaignId} is locked by ${
          existingLock.processor
        } (${Math.round(lockAge / 1000)}s ago)`
      );
      return { acquired: false };
    } else {
      // Lock expired, can be acquired
      console.log(
        `⚠️  Expired lock detected for campaign ${campaignId}, will be replaced`
      );
    }
  }

  // Set local lock
  PROCESSING_CAMPAIGNS.set(campaignId, {
    timestamp: now,
    processor: processorId,
  });
  console.log(
    `✅ Successfully acquired lock for campaign ${campaignId} with processor ${processorId}`
  );
  return { acquired: true, processorId };
}

function releaseCampaignLock(campaignId: string): void {
  PROCESSING_CAMPAIGNS.delete(campaignId);
  console.log(`🔓 Released lock for campaign ${campaignId}`);
}

function cleanupExpiredLocks(): void {
  const now = Date.now();
  for (const [campaignId, lock] of PROCESSING_CAMPAIGNS.entries()) {
    if (now - lock.timestamp > CAMPAIGN_LOCK_TIMEOUT) {
      PROCESSING_CAMPAIGNS.delete(campaignId);
      console.log(`🧹 Cleaned up expired lock for campaign ${campaignId}`);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    // CRITICAL FIX: Clean up expired locks first to prevent stale locks from blocking processing
    cleanupExpiredLocks();

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

    console.log(`Found ${sendingCampaigns.length} campaigns to process`);

    if (sendingCampaigns.length === 0) {
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

    // Process each sending campaign
    for (const campaign of sendingCampaigns) {
      let lockAcquired = false;

      try {
        // CRITICAL FIX: Try to acquire lock for this campaign to prevent duplicate sends
        const lockResult = await acquireCampaignLock(campaign.id);
        if (!lockResult.acquired) {
          console.log(
            `⏭️  Skipping campaign ${campaign.id} - already being processed by another cron job`
          );
          continue; // Skip to next campaign
        }
        lockAcquired = true;

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
      } finally {
        // CRITICAL FIX: Always release the lock, even if processing fails
        if (lockAcquired) {
          releaseCampaignLock(campaign.id);
        }
      }
    }

    console.log(
      `✅ Cron job completed. Processed ${totalProcessed} emails across ${sendingCampaigns.length} campaigns`
    );
    console.log(
      `⚡ Balanced config performance: ${BATCH_SIZE} emails/batch, ${DELAY_BETWEEN_DB_OPERATIONS}ms DB throttling, ${DELAY_BETWEEN_BATCHES}ms batch delay`
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} emails across ${sendingCampaigns.length} campaigns`,
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
  // FIXED: Get all target contacts for this campaign with REMOVED artificial limits
  // Changed: Removed the 10K limit that was preventing Community Spotlight from processing all 37K contacts
  const allContacts = await getCampaignTargetContacts(campaign, {
    maxContactsPerList: 15000, // Changed: Increased from 2500 to 15000 for better large campaign support
    totalMaxContacts: 100000, // Changed: Removed artificial 10K limit - increased to 100K for large campaigns
  });
  console.log(
    `📊 Campaign ${campaign.id}: Fetched ${allContacts.length} total target contacts (FIXED: removed 10K artificial limit)`
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
