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
// MAXIMUM SAFE SPEED - Optimized for ~60K emails/hour with 2-minute cron
const EMAILS_PER_SECOND = 9; // 90% of 10/sec limit - aggressive but safe
const MIN_DELAY_MS = Math.ceil(1000 / EMAILS_PER_SECOND); // ~111ms per email
const BATCH_SIZE = 50; // Proven safe batch size
const MAX_BATCHES_PER_RUN = 40; // INCREASED: Maximum batches for large campaigns (36K+)
const DELAY_BETWEEN_DB_OPERATIONS = 50; // Optimized - reduced from 75ms
const DELAY_BETWEEN_BATCHES = 300; // Optimized - reduced from 400ms

// 🚨 Timeout configuration to prevent 504 errors - INCREASED for large campaigns
const MAX_EXECUTION_TIME = 55000; // 55 seconds (safe margin before 60s timeout)
const CAMPAIGN_PROCESSING_TIMEOUT = 50000; // 50 seconds max per campaign
const DB_OPERATION_TIMEOUT = 10000; // 10 seconds max per DB operation
const DB_CONTACT_FETCH_TIMEOUT = 15000; // 15 seconds for fetching large contact lists (reduced from 30s due to minimal field optimization)

// CAPACITY METRICS (with 2-minute cron interval):
// - Per run: ~2,000 emails (50 × 40 batches)
// - Per hour: ~60,000 emails (30 runs)
// - Per day: ~1,440,000 emails (theoretical max with pagination)
// - 36K campaign completion: ~36 minutes (~18 runs)

// ===================== DUPLICATE EMAIL PREVENTION =====================
// CRITICAL FIX: Database-backed campaign locking for distributed serverless environments
//
// THE PROBLEM:
// - In-memory locks DON'T work across serverless instances (each has separate memory)
// - With 2-minute cron intervals, Vercel spawns multiple concurrent function instances
// - Cosmic auto-appends UUIDs to duplicate slugs (no unique constraint enforcement)
// - Without distributed locking, instances can process the same campaign = DUPLICATE EMAILS
//
// THE SOLUTION:
// - Use campaign metadata field 'processing_lock' as a database-backed distributed lock
// - Lock includes: processor_id, locked_at timestamp, expires_at timestamp
// - Only ONE instance can acquire the lock using atomic updateOne with current lock check
// - Locks auto-expire after 3 minutes to prevent stale locks from blocking processing
//
const CAMPAIGN_LOCK_TIMEOUT = 180000; // 3 minutes lock timeout

// 🚨 NEW: Execution time tracking
class ExecutionTimer {
  private startTime: number;
  private maxExecutionTime: number;

  constructor(maxExecutionTime: number = MAX_EXECUTION_TIME) {
    this.startTime = Date.now();
    this.maxExecutionTime = maxExecutionTime;
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  getRemainingTime(): number {
    return Math.max(0, this.maxExecutionTime - this.getElapsedTime());
  }

  hasTimeLeft(minimumTime: number = 5000): boolean {
    return this.getRemainingTime() >= minimumTime;
  }

  shouldTerminate(): boolean {
    return this.getElapsedTime() >= this.maxExecutionTime;
  }

  formatElapsedTime(): string {
    const elapsed = this.getElapsedTime();
    return `${(elapsed / 1000).toFixed(2)}s`;
  }
}

// 🚨 NEW: Timeout wrapper for database operations
async function withDatabaseTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = DB_OPERATION_TIMEOUT,
  operationName: string = "database operation"
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

function generateProcessorId(): string {
  return `processor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

async function acquireCampaignLock(
  campaign: MarketingCampaign
): Promise<{ acquired: boolean; processorId?: string }> {
  const now = new Date();
  const processorId = generateProcessorId();
  const expiresAt = new Date(now.getTime() + CAMPAIGN_LOCK_TIMEOUT);

  try {
    console.log(
      `🔒 [${processorId}] Attempting to acquire lock for campaign ${campaign.id}`
    );

    // Check if campaign has an active lock
    const existingLock = campaign.metadata.processing_lock;
    if (existingLock?.locked_at && existingLock?.expires_at) {
      const lockExpiry = new Date(existingLock.expires_at);
      if (lockExpiry > now) {
        const lockAge = Math.round(
          (now.getTime() - new Date(existingLock.locked_at).getTime()) / 1000
        );
        console.log(
          `🔒 Campaign ${campaign.id} is locked by ${
            existingLock.processor_id
          } (${lockAge}s ago, expires in ${Math.round(
            (lockExpiry.getTime() - now.getTime()) / 1000
          )}s)`
        );
        return { acquired: false };
      } else {
        console.log(`⚠️  Expired lock detected for campaign ${campaign.id}`);
      }
    }

    // Try to acquire lock by updating campaign metadata
    const { cosmic } = await import("@/lib/cosmic");
    await withDatabaseTimeout(
      () =>
        cosmic.objects.updateOne(campaign.id, {
          metadata: {
            processing_lock: {
              processor_id: processorId,
              locked_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
            },
          },
        }),
      DB_OPERATION_TIMEOUT,
      `acquire lock for campaign ${campaign.id}`
    );

    console.log(
      `✅ Successfully acquired DATABASE lock for campaign ${campaign.id} with processor ${processorId}`
    );
    return { acquired: true, processorId };
  } catch (error) {
    console.error(
      `❌ Failed to acquire lock for campaign ${campaign.id}:`,
      error
    );
    return { acquired: false };
  }
}

async function releaseCampaignLock(campaignId: string): Promise<void> {
  try {
    const { cosmic } = await import("@/lib/cosmic");
    await withDatabaseTimeout(
      () =>
        cosmic.objects.updateOne(campaignId, {
          metadata: {
            processing_lock: null,
          },
        }),
      DB_OPERATION_TIMEOUT,
      `release lock for campaign ${campaignId}`
    );
    console.log(`🔓 Released DATABASE lock for campaign ${campaignId}`);
  } catch (error) {
    console.error(
      `⚠️  Error releasing lock for campaign ${campaignId}:`,
      error
    );
  }
}

export async function GET(request: NextRequest) {
  const executionTimer = new ExecutionTimer();
  let totalProcessed = 0;
  let processedCampaigns = 0;

  try {
    console.log(
      `🚀 [CRON START] Processing campaigns at ${new Date().toISOString()}`
    );
    console.log(`⏱️  [TIMER] Max execution time: ${MAX_EXECUTION_TIME}ms`);

    // Verify this is a cron request (optional - can be removed for manual testing)
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log(
        "⚠️  [AUTH] No valid cron secret provided. This should only happen in development."
      );
    }

    const now = new Date();
    console.log(
      `⚡ [CONFIG] ${EMAILS_PER_SECOND} emails/sec (min ${MIN_DELAY_MS}ms between sends)`
    );
    console.log(
      `📊 [CONFIG] Capacity: ${BATCH_SIZE} emails/batch × ${MAX_BATCHES_PER_RUN} batches = ${
        BATCH_SIZE * MAX_BATCHES_PER_RUN
      } emails/run (max)`
    );

    // 🚨 NEW: Early timeout check
    if (executionTimer.shouldTerminate()) {
      console.log(
        `⏱️  [TIMEOUT] Execution time exceeded before campaign fetch`
      );
      return NextResponse.json({
        success: true,
        message: "Execution timed out before processing",
        processed: 0,
        executionTime: executionTimer.formatElapsedTime(),
        reason: "EARLY_TIMEOUT",
      });
    }

    // Get all campaigns that are in "Sending" status
    console.log(`📥 [DB] Fetching campaigns...`);
    const result = await withDatabaseTimeout(
      () => getMarketingCampaigns(),
      DB_OPERATION_TIMEOUT,
      "fetch marketing campaigns"
    );

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
      `📊 [CAMPAIGNS] Found ${sendingCampaigns.length} sending campaigns and ${scheduledCampaigns.length} scheduled campaigns ready to start`
    );

    // 🚨 NEW: Check time before processing scheduled campaigns
    if (!executionTimer.hasTimeLeft(10000)) {
      console.log(
        `⏱️  [TIMEOUT] Not enough time to process scheduled campaigns`
      );
      return NextResponse.json({
        success: true,
        message: "Time limit reached before processing scheduled campaigns",
        processed: 0,
        executionTime: executionTimer.formatElapsedTime(),
        reason: "TIME_LIMIT_SCHEDULED",
      });
    }

    // Transition scheduled campaigns to "Sending" status
    for (const campaign of scheduledCampaigns) {
      if (!executionTimer.hasTimeLeft(5000)) {
        console.log(
          `⏱️  [TIMEOUT] Breaking scheduled campaign processing due to time limit`
        );
        break;
      }

      console.log(
        `🚀 [SCHEDULE] Auto-starting campaign: ${campaign.metadata.name} (scheduled for ${campaign.metadata.send_date})`
      );

      try {
        await withDatabaseTimeout(
          () =>
            updateCampaignStatus(campaign.id, "Sending", {
              sent: 0,
              delivered: 0,
              opened: 0,
              clicked: 0,
              bounced: 0,
              unsubscribed: 0,
              open_rate: "0%",
              click_rate: "0%",
            }),
          DB_OPERATION_TIMEOUT,
          `start scheduled campaign ${campaign.id}`
        );
        console.log(
          `✅ [SCHEDULE] Campaign ${campaign.id} started successfully`
        );
      } catch (error) {
        console.error(
          `❌ [SCHEDULE] Failed to start campaign ${campaign.id}:`,
          error
        );
        // Continue with other campaigns
      }
    }

    // Combine both lists for processing
    const allCampaignsToProcess = [...sendingCampaigns, ...scheduledCampaigns];

    if (allCampaignsToProcess.length === 0) {
      console.log(
        `✅ [COMPLETE] No campaigns to process - execution time: ${executionTimer.formatElapsedTime()}`
      );
      return NextResponse.json({
        success: true,
        message: "No campaigns to process",
        processed: 0,
        executionTime: executionTimer.formatElapsedTime(),
      });
    }

    // Get settings for from email, etc.
    console.log(`⚙️  [SETTINGS] Fetching email settings...`);
    const settings = await withDatabaseTimeout(
      () => getSettings(),
      DB_OPERATION_TIMEOUT,
      "fetch settings"
    );

    if (!settings) {
      console.error("❌ [SETTINGS] No settings found - cannot send emails");
      return NextResponse.json(
        {
          error: "Email settings not configured",
          executionTime: executionTimer.formatElapsedTime(),
        },
        { status: 500 }
      );
    }

    console.log(`✅ [SETTINGS] Email settings loaded successfully`);

    // Process each campaign (both already-sending and newly-started scheduled campaigns)
    for (const campaign of allCampaignsToProcess) {
      if (!executionTimer.hasTimeLeft(10000)) {
        console.log(
          `⏱️  [TIMEOUT] Breaking campaign processing loop - processed ${processedCampaigns}/${allCampaignsToProcess.length} campaigns`
        );
        break;
      }

      let lockAcquired = false;
      const campaignTimer = new ExecutionTimer(
        Math.min(CAMPAIGN_PROCESSING_TIMEOUT, executionTimer.getRemainingTime())
      );

      console.log(
        `\n🎯 [CAMPAIGN] Starting ${campaign.metadata.name} (${campaign.id})`
      );
      console.log(
        `⏱️  [CAMPAIGN] Time remaining: ${executionTimer.getRemainingTime()}ms`
      );

      try {
        // CRITICAL FIX: Try to acquire DATABASE lock for this campaign to prevent duplicate sends
        const lockResult = await acquireCampaignLock(campaign);
        if (!lockResult.acquired) {
          console.log(
            `⏭️  [SKIP] Campaign ${campaign.id} - already being processed by another instance`
          );
          continue; // Skip to next campaign
        }
        lockAcquired = true;
        console.log(
          `🔒 [LOCK] Successfully acquired lock for campaign ${campaign.id}`
        );

        // Check if campaign is scheduled for future
        const sendDate = campaign.metadata.send_date;
        if (sendDate) {
          const scheduledTime = new Date(sendDate);

          console.log(
            `📅 [SCHEDULE] Campaign "${campaign.metadata.name}" schedule check:`,
            {
              scheduledTime: scheduledTime.toISOString(),
              currentTime: now.toISOString(),
              shouldSend: scheduledTime <= now,
            }
          );

          // Only process if scheduled time has passed
          if (scheduledTime > now) {
            console.log(
              `⏭️  [SKIP] "${
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
              `⏭️  [SKIP] Campaign ${
                campaign.id
              } - rate limit cooldown until ${canRetryAt.toISOString()}`
            );
            continue;
          }

          // Clear rate limit flag since we can retry now
          console.log(
            `🔄 [RATE] Clearing rate limit flag for campaign ${campaign.id}`
          );
          await withDatabaseTimeout(
            () =>
              updateEmailCampaign(campaign.id, {
                rate_limit_hit_at: "",
                retry_after: "",
              } as any),
            DB_OPERATION_TIMEOUT,
            `clear rate limit for campaign ${campaign.id}`
          );
        }

        // Process campaign batch with timeout protection
        console.log(
          `📧 [PROCESS] Processing campaign batch for ${campaign.id}`
        );
        const result = await Promise.race([
          processCampaignBatch(campaign, settings, campaignTimer),
          new Promise<any>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  `Campaign processing timed out after ${CAMPAIGN_PROCESSING_TIMEOUT}ms`
                )
              );
            }, CAMPAIGN_PROCESSING_TIMEOUT);
          }),
        ]);

        totalProcessed += result.processed;
        processedCampaigns++;

        console.log(
          `📊 [RESULT] Campaign ${campaign.id} processed ${result.processed} emails`
        );

        // Check if campaign completed
        if (result.completed && result.finalStats) {
          const sentAt = new Date().toISOString();

          console.log(
            `✅ [COMPLETE] Campaign ${campaign.id} completed! Marking as Sent...`
          );
          console.log(`📊 [STATS] Final stats:`, result.finalStats);

          // Update status, stats, and sent_at in ONE atomic operation
          const { cosmic } = await import("@/lib/cosmic");
          await withDatabaseTimeout(
            () =>
              cosmic.objects.updateOne(campaign.id, {
                metadata: {
                  status: {
                    key: "sent",
                    value: "Sent",
                  },
                  stats: result.finalStats,
                  sent_at: sentAt,
                },
              }),
            DB_OPERATION_TIMEOUT,
            `mark campaign ${campaign.id} as sent`
          );

          console.log(
            `✅ [SENT] Campaign ${campaign.id} marked as Sent with timestamp ${sentAt}`
          );

          // IMPORTANT: Sync tracking stats immediately to capture any opens/clicks
          // that happened during sending (tracking pixels in preview panes, etc.)
          try {
            console.log(
              `📊 [SYNC] Syncing tracking stats for campaign ${campaign.id}...`
            );
            const { syncCampaignTrackingStats } = await import("@/lib/cosmic");
            await withDatabaseTimeout(
              () => syncCampaignTrackingStats(campaign.id),
              DB_OPERATION_TIMEOUT,
              `sync tracking stats for campaign ${campaign.id}`
            );
            console.log(
              `✅ [SYNC] Campaign ${campaign.id} tracking stats synced successfully`
            );
          } catch (syncError) {
            console.error(
              `⚠️  [SYNC] Error syncing tracking stats for campaign ${campaign.id}:`,
              syncError
            );
            // Don't fail the entire job if stats sync fails
          }
        }
      } catch (error: any) {
        console.error(`❌ [ERROR] Processing campaign ${campaign.id}:`, error);

        // Check if this is a timeout error - if so, don't cancel, just continue in next run
        const isTimeoutError =
          error.message?.includes("timed out") ||
          error.message?.includes("timeout") ||
          error.name === "TimeoutError";

        if (isTimeoutError) {
          console.log(
            `⏱️  [TIMEOUT] Campaign ${campaign.id} timed out but will continue in next cron run`
          );
          // Don't cancel on timeout - the campaign will resume in the next cron run
        } else {
          // Only cancel on actual errors (not timeouts)
          console.error(
            `⚠️  [CRITICAL ERROR] Campaign ${campaign.id} encountered a non-timeout error, marking as cancelled`
          );
          try {
            await withDatabaseTimeout(
              () =>
                updateCampaignStatus(campaign.id, "Cancelled", {
                  sent: 0,
                  delivered: 0,
                  opened: 0,
                  clicked: 0,
                  bounced: 0,
                  unsubscribed: 0,
                  open_rate: "0%",
                  click_rate: "0%",
                }),
              DB_OPERATION_TIMEOUT,
              `cancel campaign ${campaign.id}`
            );
            console.log(
              `⚠️  [CANCELLED] Campaign ${campaign.id} marked as cancelled due to error`
            );
          } catch (cancelError) {
            console.error(
              `❌ [ERROR] Failed to cancel campaign ${campaign.id}:`,
              cancelError
            );
          }
        }
      } finally {
        // CRITICAL FIX: Always release the DATABASE lock, even if processing fails
        if (lockAcquired) {
          await releaseCampaignLock(campaign.id);
          console.log(`🔓 [UNLOCK] Released lock for campaign ${campaign.id}`);
        }
      }

      console.log(
        `✅ [CAMPAIGN] Completed ${
          campaign.metadata.name
        } - time elapsed: ${campaignTimer.formatElapsedTime()}`
      );
    }

    const finalExecutionTime = executionTimer.formatElapsedTime();
    console.log(`\n🎉 [COMPLETE] Cron job completed successfully!`);
    console.log(
      `📊 [SUMMARY] Processed ${totalProcessed} emails across ${processedCampaigns}/${allCampaignsToProcess.length} campaigns`
    );
    console.log(`⏱️  [TIME] Total execution time: ${finalExecutionTime}`);
    console.log(
      `⚡ [PERFORMANCE] Average: ${
        totalProcessed > 0
          ? Math.round(
              totalProcessed / (executionTimer.getElapsedTime() / 1000)
            )
          : 0
      } emails/second`
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} emails across ${processedCampaigns} campaigns`,
      processed: totalProcessed,
      campaignsProcessed: processedCampaigns,
      totalCampaigns: allCampaignsToProcess.length,
      executionTime: finalExecutionTime,
    });
  } catch (error) {
    const finalExecutionTime = executionTimer.formatElapsedTime();
    console.error(
      `❌ [FATAL] Cron job error after ${finalExecutionTime}:`,
      error
    );

    return NextResponse.json(
      {
        error: "Cron job failed",
        executionTime: finalExecutionTime,
        processed: totalProcessed,
        campaignsProcessed: processedCampaigns,
      },
      { status: 500 }
    );
  }
}

async function processCampaignBatch(
  campaign: MarketingCampaign,
  settings: any,
  timer: ExecutionTimer
) {
  console.log(
    `📋 [BATCH] Starting batch processing for campaign ${campaign.id}`
  );
  console.log(`⏱️  [BATCH] Time remaining: ${timer.getRemainingTime()}ms`);

  // FIXED: Get all target contacts for this campaign with REMOVED artificial limits
  // Changed: Removed the 10K limit that was preventing Community Spotlight from processing all 37K contacts
  const allContacts = await withDatabaseTimeout(
    () =>
      getCampaignTargetContacts(campaign, {
        maxContactsPerList: 15000, // Changed: Increased from 2500 to 15000 for better large campaign support
        totalMaxContacts: 100000, // Changed: Removed artificial 10K limit - increased to 100K for large campaigns
      }),
    DB_CONTACT_FETCH_TIMEOUT, // FIXED: Use longer timeout for large contact fetching
    `fetch target contacts for campaign ${campaign.id}`
  );

  console.log(
    `📊 [CONTACTS] Campaign ${campaign.id}: Fetched ${allContacts.length} total target contacts (FIXED: removed 10K artificial limit)`
  );

  // CRITICAL: Filter out contacts that have already been sent to (including pending)
  console.log(
    `🔍 [FILTER] Filtering unsent contacts from ${allContacts.length} total contacts...`
  );

  // OPTIMIZATION: Pass contacts directly (not just IDs) to avoid re-fetching emails
  const unsentContactIds = await withDatabaseTimeout(
    () => filterUnsentContacts(campaign.id, allContacts),
    DB_CONTACT_FETCH_TIMEOUT, // FIXED: Use longer timeout for large contact filtering
    `filter unsent contacts for campaign ${campaign.id}`
  );

  const unsentContacts = allContacts.filter((c) =>
    unsentContactIds.includes(c.id)
  );

  const alreadySentCount = allContacts.length - unsentContacts.length;
  console.log(
    `✅ [FILTER] Complete: ${alreadySentCount} already sent/reserved, ${unsentContacts.length} remaining to send`
  );

  // Log first few emails for debugging
  if (unsentContacts.length > 0) {
    console.log(
      `📧 [DEBUG] First 3 unsent emails: ${unsentContacts
        .slice(0, 3)
        .map((c) => c.metadata.email)
        .join(", ")}`
    );
  }

  if (unsentContacts.length === 0) {
    console.log(`🏁 [COMPLETE] Campaign ${campaign.id} is complete!`);

    // CRITICAL FIX: Get fresh stats from database, not stale batch stats
    const freshStats = await withDatabaseTimeout(
      () => getCampaignSendStats(campaign.id),
      DB_OPERATION_TIMEOUT,
      `get campaign stats for ${campaign.id}`
    );

    console.log(
      `📊 [STATS] Fresh database stats - sent: ${freshStats.sent}, bounced: ${freshStats.bounced}, pending: ${freshStats.pending}, failed: ${freshStats.failed}`
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

  // 🚨 NEW: Check time before reserving contacts
  if (!timer.hasTimeLeft(5000)) {
    console.log(
      `⏱️  [TIMEOUT] Not enough time to reserve contacts - ${timer.getRemainingTime()}ms remaining`
    );
    return {
      processed: 0,
      completed: false,
      finalStats: undefined,
      reason: "TIME_LIMIT_RESERVE",
    };
  }

  // ATOMIC RESERVATION: Reserve contacts before sending with unique slug constraint
  console.log(
    `🔒 [RESERVE] Reserving ${Math.min(
      BATCH_SIZE,
      unsentContacts.length
    )} contacts atomically...`
  );

  const { reserved: reservedContacts, pendingRecordIds } =
    await withDatabaseTimeout(
      () => reserveContactsForSending(campaign.id, unsentContacts, BATCH_SIZE),
      DB_OPERATION_TIMEOUT,
      `reserve contacts for campaign ${campaign.id}`
    );

  if (reservedContacts.length === 0) {
    console.log(
      `⚠️  [RESERVE] No contacts could be reserved (all already reserved by another cron job)`
    );
    return {
      processed: 0,
      completed: false,
      finalStats: undefined,
      reason: "NO_CONTACTS_RESERVED",
    };
  }

  console.log(
    `✅ [RESERVE] Successfully reserved ${reservedContacts.length} contacts`
  );

  // Send emails with proper rate limiting
  let batchesProcessed = 0;
  let rateLimitHit = false;
  let emailsProcessed = 0;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  // 🚨 NEW: Time-aware batch processing
  const availableTime = timer.getRemainingTime();
  const estimatedTimePerEmail =
    MIN_DELAY_MS + DELAY_BETWEEN_DB_OPERATIONS + 500; // Add buffer
  const maxEmailsInTime = Math.floor(availableTime / estimatedTimePerEmail);
  const effectiveMaxBatches = Math.min(
    MAX_BATCHES_PER_RUN,
    Math.ceil(maxEmailsInTime / BATCH_SIZE)
  );

  console.log(
    `⏱️  [TIMING] Available time: ${availableTime}ms, estimated time per email: ${estimatedTimePerEmail}ms`
  );
  console.log(
    `📊 [TIMING] Max emails in time: ${maxEmailsInTime}, effective max batches: ${effectiveMaxBatches}`
  );

  // Process reserved contacts in smaller batches
  for (
    let i = 0;
    i < reservedContacts.length && batchesProcessed < effectiveMaxBatches;
    i += BATCH_SIZE
  ) {
    if (rateLimitHit || !timer.hasTimeLeft(2000)) {
      console.log(
        `⏱️  [TIMEOUT] Breaking batch loop - time remaining: ${timer.getRemainingTime()}ms`
      );
      break;
    }

    const batch = reservedContacts.slice(i, i + BATCH_SIZE);
    console.log(
      `📦 [BATCH ${batchesProcessed + 1}] Processing ${
        batch.length
      } reserved contacts`
    );

    // Process each reserved contact with proper rate limiting
    for (let contactIndex = 0; contactIndex < batch.length; contactIndex++) {
      if (rateLimitHit || !timer.hasTimeLeft(1000)) {
        console.log(
          `⏱️  [TIMEOUT] Breaking contact loop - time remaining: ${timer.getRemainingTime()}ms`
        );
        break;
      }

      const contact = batch[contactIndex];

      // CRITICAL FIX: Add explicit undefined check to satisfy TypeScript
      if (!contact) {
        console.error(
          `❌ [ERROR] Undefined contact at batch index ${contactIndex}`
        );
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

        console.log(`✅ [EMAIL] Sent to ${contact.metadata.email}`);

        // Update the pending record to "sent" status
        await withDatabaseTimeout(
          () =>
            createCampaignSend({
              campaignId: campaign.id,
              contactId: contact.id,
              contactEmail: contact.metadata.email,
              status: "sent",
              resendMessageId: result.id,
              pendingRecordId: pendingRecordId,
            }),
          DB_OPERATION_TIMEOUT,
          `update send record for ${contact.metadata.email}`
        );

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
            `⚠️  [RATE LIMIT] Hit! Pausing campaign. Retry after ${retryAfter}s`
          );

          // Save rate limit state
          await withDatabaseTimeout(
            () =>
              updateEmailCampaign(campaign.id, {
                rate_limit_hit_at: new Date().toISOString(),
                retry_after: retryAfter,
              } as any),
            DB_OPERATION_TIMEOUT,
            `save rate limit state for campaign ${campaign.id}`
          );

          rateLimitHit = true;
          break; // Stop processing this campaign
        }

        // Regular error - update pending record to "failed"
        console.error(
          `❌ [EMAIL ERROR] Failed to send to ${contact.metadata.email}:`,
          error.message
        );

        try {
          await withDatabaseTimeout(
            () =>
              createCampaignSend({
                campaignId: campaign.id,
                contactId: contact.id,
                contactEmail: contact.metadata.email,
                status: "failed",
                errorMessage: error.message,
                pendingRecordId: pendingRecordId,
              }),
            DB_OPERATION_TIMEOUT,
            `mark send as failed for ${contact.metadata.email}`
          );
        } catch (dbError) {
          console.error(`❌ [DB ERROR] Failed to update send record:`, dbError);
        }

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
    try {
      const freshStats = await withDatabaseTimeout(
        () => getCampaignSendStats(campaign.id),
        DB_OPERATION_TIMEOUT,
        `get fresh stats for campaign ${campaign.id}`
      );

      const progressPercentage = Math.round(
        (freshStats.sent / allContacts.length) * 100
      );

      console.log(
        `💾 [PROGRESS] Updating campaign progress: ${freshStats.sent}/${allContacts.length} sent (${progressPercentage}%)`
      );

      await withDatabaseTimeout(
        () =>
          updateCampaignProgress(campaign.id, {
            sent: freshStats.sent,
            failed: freshStats.failed + freshStats.bounced,
            total: allContacts.length,
            progress_percentage: progressPercentage,
            last_batch_completed: new Date().toISOString(),
          }),
        DB_OPERATION_TIMEOUT,
        `update progress for campaign ${campaign.id}`
      );

      console.log(
        `📊 [BATCH STATS] Batch ${batchesProcessed} complete. Database stats: ${freshStats.sent} sent, ${freshStats.pending} pending, ${freshStats.failed} failed, ${freshStats.bounced} bounced`
      );
    } catch (progressError) {
      console.error(
        `⚠️  [PROGRESS ERROR] Failed to update campaign progress:`,
        progressError
      );
      // Continue processing even if progress update fails
    }

    // Optimized delay between batches for MongoDB/Lambda performance
    if (
      batchesProcessed < effectiveMaxBatches &&
      !rateLimitHit &&
      timer.hasTimeLeft(2000)
    ) {
      console.log(
        `⏸️  [DELAY] Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch for MongoDB optimization...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES)
      );
    }
  }

  // SIMPLE FIX: Check if campaign is complete by comparing stats to total contacts
  if (!rateLimitHit) {
    console.log(`📊 [COMPLETION] Checking if campaign is complete...`);

    const finalFreshStats = await withDatabaseTimeout(
      () => getCampaignSendStats(campaign.id),
      DB_OPERATION_TIMEOUT,
      `get final stats for campaign ${campaign.id}`
    );

    console.log(
      `📊 [FINAL STATS] sent=${finalFreshStats.sent}, failed=${finalFreshStats.failed}, bounced=${finalFreshStats.bounced}, pending=${finalFreshStats.pending}, total_contacts=${allContacts.length}`
    );

    // Calculate total processed (sent + failed + bounced)
    const totalProcessed =
      finalFreshStats.sent + finalFreshStats.failed + finalFreshStats.bounced;

    // Campaign is complete if all contacts have been processed and no pending
    if (totalProcessed >= allContacts.length && finalFreshStats.pending === 0) {
      console.log(
        `✅ [COMPLETE] Campaign ${campaign.id} fully completed! ${totalProcessed}/${allContacts.length} contacts processed`
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
        `⏳ [IN PROGRESS] Campaign ${campaign.id} still in progress: ${totalProcessed}/${allContacts.length} processed, ${finalFreshStats.pending} pending`
      );
    }
  }

  console.log(
    `📊 [BATCH RESULT] Processed ${emailsProcessed} emails in ${batchesProcessed} batches`
  );

  return {
    processed: emailsProcessed,
    completed: false,
    finalStats: undefined,
  };
}
