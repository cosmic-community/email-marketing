import { EmailContact, CampaignSend, MarketingCampaign } from "@/types";
import { cosmic } from "./client";
import { hasStatus } from "./utils";

// ==================== CAMPAIGN SENDS TRACKING ====================

// CRITICAL FIX: Query existing campaign-sends by email to prevent duplicates
// OPTIMIZED: Batch check for already-sent contacts (reduces DB queries)
async function checkContactsAlreadySent(
  campaignId: string,
  contactEmails: string[]
): Promise<Set<string>> {
  if (contactEmails.length === 0) return new Set();

  try {
    console.log(
      `🔍 Batch checking ${contactEmails.length} contacts for campaign ${campaignId}...`
    );

    // Single query to check all emails at once using $in operator
    const { objects } = await cosmic.objects
      .find({
        type: "campaign-sends",
        "metadata.campaign": campaignId,
        "metadata.contact_email": { $in: contactEmails },
      })
      .props(["metadata.contact_email"])
      .limit(contactEmails.length);

    const sentEmails = new Set<string>(
      objects
        .map((obj: any) => obj.metadata.contact_email)
        .filter((email: any): email is string => typeof email === "string")
    );

    console.log(
      `✓ Found ${sentEmails.size}/${contactEmails.length} already sent`
    );

    return sentEmails;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return new Set();
    }
    console.error(`Error batch checking send status:`, error);
    return new Set();
  }
}

// UPDATED: Atomic reservation with BATCH pre-check and reduced concurrency
// OPTIMIZED: Dramatically reduced MongoDB load
export async function reserveContactsForSending(
  campaignId: string,
  contacts: EmailContact[],
  batchSize: number
): Promise<{
  reserved: EmailContact[];
  pendingRecordIds: Map<string, string>;
}> {
  const reserved: EmailContact[] = [];
  const pendingRecordIds = new Map<string, string>();

  const targetBatchSize = Math.min(batchSize, contacts.length);
  console.log(
    `🔒 Reserving ${targetBatchSize} contacts for campaign ${campaignId} (batch check + reduced concurrency)...`
  );

  // OPTIMIZATION 1: Batch pre-check all contacts at once (1 query instead of 50)
  const contactEmails = contacts
    .slice(0, batchSize)
    .map((c) => c.metadata.email);
  const alreadySentEmails = await checkContactsAlreadySent(
    campaignId,
    contactEmails
  );

  // Filter out already-sent contacts BEFORE attempting reservations
  const contactsToReserve = contacts
    .slice(0, batchSize)
    .filter((c) => !alreadySentEmails.has(c.metadata.email));

  console.log(
    `📋 After filtering: ${contactsToReserve.length}/${targetBatchSize} contacts need reservation`
  );

  if (contactsToReserve.length === 0) {
    console.log(`⊗ All contacts already have send records`);
    return { reserved, pendingRecordIds };
  }

  // OPTIMIZATION 2: Balanced delay for Cosmic API limits (100 req/sec)
  // With 500 contacts per batch: 1,001 requests over 25 seconds = 40 req/sec (40% of Cosmic limit)
  const RESERVATION_DELAY = 50; // Optimized for Cosmic's 100 req/sec limit
  let processedCount = 0;

  // CRITICAL FIX: Process reservations with check-before-insert to prevent duplicates
  // NOTE: Cosmic auto-appends UUIDs to duplicate slugs, so we MUST check for existing records
  for (const contact of contactsToReserve) {
    try {
      // STEP 1: Check if a send record already exists for this campaign+contact
      // This is our REAL duplicate prevention since Cosmic doesn't enforce unique slugs
      try {
        const { objects: existingRecords } = await cosmic.objects
          .find({
            type: "campaign-sends",
            "metadata.campaign": campaignId,
            "metadata.contact": contact.id,
          })
          .props(["id"])
          .limit(1);

        if (existingRecords.length > 0) {
          // Already reserved by another process - skip
          console.log(
            `⏭️  Contact ${contact.id} already has send record, skipping`
          );
          continue;
        }
      } catch (checkError: any) {
        // 404 means no record exists, which is what we want
        if (!hasStatus(checkError) || checkError.status !== 404) {
          console.error(
            `Error checking existing send record for contact ${contact.id}:`,
            checkError.message
          );
          continue; // Skip this contact on error to be safe
        }
      }

      // STEP 2: No existing record found, safe to insert
      const uniqueSlug = `send-${campaignId}-${contact.id}`;

      const { object } = await cosmic.objects.insertOne({
        type: "campaign-sends",
        title: `Send: Campaign ${campaignId} to ${contact.metadata.email}`,
        slug: uniqueSlug,
        metadata: {
          campaign: campaignId,
          contact: contact.id,
          contact_email: contact.metadata.email,
          status: "pending",
          reserved_at: new Date().toISOString(),
          retry_count: 0,
        },
      });

      // Successfully reserved
      reserved.push(contact);
      pendingRecordIds.set(contact.id, object.id);
    } catch (error: any) {
      // Log insertion errors but continue
      console.error(`✗ Error reserving contact ${contact.id}:`, error.message);
      continue;
    }

    // OPTIMIZATION 3: Longer delay between reservations (150ms vs 50ms)
    processedCount++;
    if (processedCount < contactsToReserve.length) {
      await new Promise((resolve) => setTimeout(resolve, RESERVATION_DELAY));
    }
  }

  console.log(
    `✅ Successfully reserved ${reserved.length}/${targetBatchSize} contacts`
  );

  return { reserved, pendingRecordIds };
}

// UPDATED: Create a send record (now supports updating pending records)
export async function createCampaignSend(data: {
  campaignId: string;
  contactId: string;
  contactEmail: string;
  status: "sent" | "failed" | "bounced";
  sentAt?: string;
  resendMessageId?: string;
  errorMessage?: string;
  pendingRecordId?: string; // NEW: Optional ID of pending record to update
}): Promise<CampaignSend> {
  try {
    console.log(`📧 DEBUG createCampaignSend: Called with:`, {
      campaignId: data.campaignId,
      contactId: data.contactId,
      contactEmail: data.contactEmail,
      status: data.status,
      pendingRecordId: data.pendingRecordId,
      hasResendMessageId: !!data.resendMessageId,
    });

    // If we have a pending record ID, update it instead of creating new
    if (data.pendingRecordId) {
      console.log(
        `📧 DEBUG: Updating existing pending record ${data.pendingRecordId} to status: ${data.status}`
      );

      const updatePayload = {
        metadata: {
          status: data.status,
          sent_at: data.sentAt || new Date().toISOString(),
          resend_message_id: data.resendMessageId,
          error_message: data.errorMessage,
        },
      };

      console.log(`📧 DEBUG: Update payload:`, updatePayload);

      const { object } = await cosmic.objects.updateOne(
        data.pendingRecordId,
        updatePayload
      );

      console.log(`📧 DEBUG: Record updated successfully:`, {
        id: object.id,
        status: object.metadata.status,
        sent_at: object.metadata.sent_at,
        resend_message_id: object.metadata.resend_message_id,
      });

      return object as CampaignSend;
    }

    // Fallback: Create new record if no pending record ID provided
    console.log(
      `📧 DEBUG: Creating new campaign-send record (no pending record ID provided)`
    );

    const { object } = await cosmic.objects.insertOne({
      type: "campaign-sends",
      title: `Send to ${data.contactEmail}`,
      metadata: {
        campaign: data.campaignId,
        contact: data.contactId,
        contact_email: data.contactEmail,
        status: data.status,
        sent_at: data.sentAt || new Date().toISOString(),
        resend_message_id: data.resendMessageId,
        error_message: data.errorMessage,
        retry_count: 0,
      },
    });

    console.log(`📧 DEBUG: New record created:`, {
      id: object.id,
      status: object.metadata.status,
    });

    return object as CampaignSend;
  } catch (error) {
    console.error("❌ ERROR in createCampaignSend:", error);
    throw new Error("Failed to create/update campaign send record");
  }
}

// Check if contact has been sent to for a campaign
export async function hasContactBeenSent(
  campaignId: string,
  contactId: string
): Promise<boolean> {
  try {
    const { objects } = await cosmic.objects
      .find({
        type: "campaign-sends",
        "metadata.campaign": campaignId,
        "metadata.contact": contactId,
      })
      .props(["id"])
      .limit(1);

    return objects.length > 0;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return false;
    }
    console.error("Error checking send status:", error);
    return false;
  }
}

// Get all sent contact IDs for a campaign (paginated)
export async function getSentContactIds(
  campaignId: string,
  options?: { limit?: number; skip?: number }
): Promise<{ contactIds: string[]; total: number }> {
  const limit = options?.limit || 1000;
  const skip = options?.skip || 0;

  try {
    const { objects, total } = await cosmic.objects
      .find({
        type: "campaign-sends",
        "metadata.campaign": campaignId,
      })
      .props(["metadata.contact"])
      .limit(limit)
      .skip(skip);

    return {
      contactIds: objects.map((obj: any) => obj.metadata.contact),
      total: total || 0,
    };
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return { contactIds: [], total: 0 };
    }
    console.error("Error fetching sent contact IDs:", error);
    return { contactIds: [], total: 0 };
  }
}

// UPDATED: Get campaign send statistics (now includes pending status)
// CRITICAL FIX: Handle 404 errors for individual status queries without resetting all stats
export async function getCampaignSendStats(campaignId: string): Promise<{
  total: number;
  sent: number;
  pending: number;
  failed: number;
  bounced: number;
}> {
  try {
    console.log(
      `📊 DEBUG getCampaignSendStats: Fetching stats for campaign ${campaignId}`
    );

    // CRITICAL FIX: Initialize stats object that we'll build up
    const stats = {
      total: 0,
      sent: 0,
      pending: 0,
      failed: 0,
      bounced: 0,
    };

    // Get total count
    console.log(`📊 DEBUG: Querying total campaign-sends...`);
    try {
      const allSendsResponse = await cosmic.objects
        .find({
          type: "campaign-sends",
          "metadata.campaign": campaignId,
        })
        .props(["id", "metadata.status"])
        .limit(1);

      stats.total = allSendsResponse.total || 0;
      console.log(`📊 DEBUG: Total campaign-sends found: ${stats.total}`);
    } catch (error) {
      if (hasStatus(error) && error.status === 404) {
        console.log(`📊 DEBUG: No total campaign-sends found (404)`);
        stats.total = 0;
      } else {
        throw error;
      }
    }

    // Get sent count
    console.log(`📊 DEBUG: Querying sent campaign-sends...`);
    try {
      const sentSendsResponse = await cosmic.objects
        .find({
          type: "campaign-sends",
          "metadata.campaign": campaignId,
          "metadata.status": "sent",
        })
        .props(["id", "metadata"])
        .limit(1000);

      stats.sent = sentSendsResponse.total || 0;
      console.log(`📊 DEBUG: Sent campaign-sends found: ${stats.sent}`);
      console.log(
        `📊 DEBUG: Sample sent records (first 3):`,
        sentSendsResponse.objects.slice(0, 3).map((obj: any) => ({
          id: obj.id,
          status: obj.metadata.status,
          contact_email: obj.metadata.contact_email,
          sent_at: obj.metadata.sent_at,
        }))
      );
    } catch (error) {
      if (hasStatus(error) && error.status === 404) {
        console.log(`📊 DEBUG: No sent campaign-sends found (404)`);
        stats.sent = 0;
      } else {
        throw error;
      }
    }

    // Get pending count (NEW)
    console.log(`📊 DEBUG: Querying pending campaign-sends...`);
    try {
      const pendingSendsResponse = await cosmic.objects
        .find({
          type: "campaign-sends",
          "metadata.campaign": campaignId,
          "metadata.status": "pending",
        })
        .props(["id", "metadata"])
        .limit(1000);

      stats.pending = pendingSendsResponse.total || 0;
      console.log(`📊 DEBUG: Pending campaign-sends found: ${stats.pending}`);
      console.log(
        `📊 DEBUG: Sample pending records (first 3):`,
        pendingSendsResponse.objects.slice(0, 3).map((obj: any) => ({
          id: obj.id,
          status: obj.metadata.status,
          contact_email: obj.metadata.contact_email,
        }))
      );
    } catch (error) {
      if (hasStatus(error) && error.status === 404) {
        console.log(
          `📊 DEBUG: No pending campaign-sends found (404) - this is normal when all emails are sent`
        );
        stats.pending = 0;
      } else {
        throw error;
      }
    }

    // Get failed count
    console.log(`📊 DEBUG: Querying failed campaign-sends...`);
    try {
      const failedSendsResponse = await cosmic.objects
        .find({
          type: "campaign-sends",
          "metadata.campaign": campaignId,
          "metadata.status": "failed",
        })
        .props(["id"])
        .limit(1);

      stats.failed = failedSendsResponse.total || 0;
      console.log(`📊 DEBUG: Failed campaign-sends found: ${stats.failed}`);
    } catch (error) {
      if (hasStatus(error) && error.status === 404) {
        console.log(`📊 DEBUG: No failed campaign-sends found (404)`);
        stats.failed = 0;
      } else {
        throw error;
      }
    }

    // Get bounced count
    console.log(`📊 DEBUG: Querying bounced campaign-sends...`);
    try {
      const bouncedSendsResponse = await cosmic.objects
        .find({
          type: "campaign-sends",
          "metadata.campaign": campaignId,
          "metadata.status": "bounced",
        })
        .props(["id"])
        .limit(1);

      stats.bounced = bouncedSendsResponse.total || 0;
      console.log(`📊 DEBUG: Bounced campaign-sends found: ${stats.bounced}`);
    } catch (error) {
      if (hasStatus(error) && error.status === 404) {
        console.log(`📊 DEBUG: No bounced campaign-sends found (404)`);
        stats.bounced = 0;
      } else {
        throw error;
      }
    }

    console.log(`📊 DEBUG: Final calculated stats:`, stats);
    return stats;
  } catch (error) {
    console.error("❌ ERROR in getCampaignSendStats:", error);

    // CRITICAL FIX: Only return zeros if there's a genuine error, not just 404s
    console.log(`📊 DEBUG: Returning zeros due to unexpected error`);
    return { total: 0, sent: 0, pending: 0, failed: 0, bounced: 0 };
  }
}

// CRITICAL FIX: Use email-based filtering for consistency with reservation system
// OPTIMIZED: Accept contacts directly to avoid re-fetching emails (saves 360+ queries for 36K campaign)
export async function filterUnsentContacts(
  campaignId: string,
  contacts: EmailContact[]
): Promise<string[]> {
  if (contacts.length === 0) return [];

  try {
    console.log(`🔍 Filtering unsent contacts for campaign ${campaignId}...`);

    // Get all sent emails for this campaign (using same query as reservation check)
    const sentEmails = new Set<string>();
    let skip = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      try {
        const { objects, total } = await cosmic.objects
          .find({
            type: "campaign-sends",
            "metadata.campaign": campaignId,
          })
          .props(["metadata.contact_email"])
          .limit(limit)
          .skip(skip);

        objects.forEach((obj: any) => {
          if (obj.metadata?.contact_email) {
            sentEmails.add(obj.metadata.contact_email.toLowerCase());
          }
        });

        console.log(
          `📊 Fetched ${
            objects.length
          } campaign-sends at skip ${skip}, total: ${total || 0}`
        );

        skip += limit;
        hasMore = objects.length === limit && skip < (total || 0);
      } catch (batchError) {
        if (hasStatus(batchError) && batchError.status === 404) {
          console.log(`No more campaign-sends found at skip ${skip}`);
          break;
        }
        throw batchError;
      }
    }

    console.log(
      `✅ Found ${sentEmails.size} total sent emails for campaign ${campaignId}`
    );

    // OPTIMIZATION: Use contacts directly (we already have emails from getCampaignTargetContacts)
    // This eliminates 360+ unnecessary database queries for 36K contacts!
    const unsentContactIds = contacts
      .filter((contact) => {
        const email = contact.metadata.email?.toLowerCase();
        return email && !sentEmails.has(email);
      })
      .map((contact) => contact.id);

    console.log(
      `📊 Filter results: ${contacts.length} total, ${
        unsentContactIds.length
      } unsent, ${
        contacts.length - unsentContactIds.length
      } already sent/pending`
    );

    return unsentContactIds;
  } catch (error) {
    console.error("Error filtering unsent contacts:", error);
    // Return empty array on error to be safe (don't resend to everyone)
    return [];
  }
}

// ==================== CAMPAIGN TRACKING EVENTS STATS ====================

// Get real-time campaign statistics from email-tracking-events
export async function getCampaignTrackingStats(campaignId: string): Promise<{
  opened: number;
  clicked: number;
  open_rate: string;
  click_rate: string;
  unique_opens: number;
  unique_clicks: number;
}> {
  try {
    console.log(`📊 Getting tracking stats for campaign ${campaignId}...`);

    // Get all tracking events for this campaign
    const uniqueOpens = new Set<string>();
    const uniqueClicks = new Set<string>();
    let totalOpens = 0;
    let totalClicks = 0;

    let skip = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      try {
        const { objects, total } = await cosmic.objects
          .find({
            type: "email-tracking-events",
            "metadata.campaign": campaignId,
          })
          .props([
            "metadata.event_type",
            "metadata.contact",
            "metadata.contact_email",
          ])
          .limit(limit)
          .skip(skip);

        for (const event of objects) {
          const eventType =
            event.metadata?.event_type?.key || event.metadata?.event_type;
          const contactId = event.metadata?.contact;
          const contactEmail = event.metadata?.contact_email;
          const contactIdentifier = contactId || contactEmail;

          if (eventType === "open" && contactIdentifier) {
            totalOpens++;
            uniqueOpens.add(contactIdentifier);
          } else if (eventType === "click" && contactIdentifier) {
            totalClicks++;
            uniqueClicks.add(contactIdentifier);
          }
        }

        console.log(
          `📊 Processed ${objects.length} events at skip ${skip}, total: ${
            total || 0
          }`
        );

        skip += limit;
        hasMore = objects.length === limit && skip < (total || 0);
      } catch (batchError) {
        if (hasStatus(batchError) && batchError.status === 404) {
          console.log(`No more tracking events found at skip ${skip}`);
          break;
        }
        throw batchError;
      }
    }

    // Get sent count from campaign-sends for rate calculation
    const sendStats = await getCampaignSendStats(campaignId);
    const sentCount = sendStats.sent || 0;

    // Calculate rates
    const open_rate =
      sentCount > 0
        ? `${Math.round((uniqueOpens.size / sentCount) * 100)}%`
        : "0%";
    const click_rate =
      sentCount > 0
        ? `${Math.round((uniqueClicks.size / sentCount) * 100)}%`
        : "0%";

    const stats = {
      opened: totalOpens,
      clicked: totalClicks,
      unique_opens: uniqueOpens.size,
      unique_clicks: uniqueClicks.size,
      open_rate,
      click_rate,
    };

    console.log(`✅ Campaign ${campaignId} tracking stats:`, stats);
    return stats;
  } catch (error) {
    console.error(
      `❌ ERROR getting tracking stats for campaign ${campaignId}:`,
      error
    );
    return {
      opened: 0,
      clicked: 0,
      unique_opens: 0,
      unique_clicks: 0,
      open_rate: "0%",
      click_rate: "0%",
    };
  }
}

// Update campaign stats with real-time tracking data
// Note: This function depends on campaigns module functions (getMarketingCampaign)
// So we'll need to handle the circular dependency later in the campaigns module
export async function syncCampaignTrackingStats(
  campaignId: string
): Promise<void> {
  // Import at call time to avoid circular dependency
  const { getMarketingCampaign } = await import("./campaigns");
  
  try {
    console.log(`🔄 Syncing tracking stats for campaign ${campaignId}...`);

    const campaign = await getMarketingCampaign(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    // Get tracking stats
    const trackingStats = await getCampaignTrackingStats(campaignId);

    // Get send stats for delivered/bounced
    const sendStats = await getCampaignSendStats(campaignId);

    // Update campaign with merged stats
    await cosmic.objects.updateOne(campaignId, {
      metadata: {
        stats: {
          sent: sendStats.sent,
          delivered: sendStats.sent, // Can be updated by webhooks later
          opened: trackingStats.unique_opens,
          clicked: trackingStats.unique_clicks,
          bounced: sendStats.bounced,
          unsubscribed: 0, // Can be updated separately
          open_rate: trackingStats.open_rate,
          click_rate: trackingStats.click_rate,
        },
      },
    });

    console.log(`✅ Campaign ${campaignId} stats synced successfully`);
  } catch (error) {
    console.error(
      `❌ ERROR syncing tracking stats for campaign ${campaignId}:`,
      error
    );
    throw new Error("Failed to sync campaign tracking stats");
  }
}

