import { createBucketClient } from "@cosmicjs/sdk";
import {
  EmailContact,
  EmailTemplate,
  MarketingCampaign,
  EmailList,
  Settings,
  CreateContactData,
  CreateListData,
  CreateTemplateData,
  TemplateType,
  CreateCampaignData,
  UpdateSettingsData,
  BulkListUpdateData,
  CampaignStats,
  CosmicResponse,
  MediaItem,
  UploadJob,
  CreateUploadJobData,
  CampaignSend,
} from "@/types";

if (
  !process.env.COSMIC_BUCKET_SLUG ||
  !process.env.COSMIC_READ_KEY ||
  !process.env.COSMIC_WRITE_KEY
) {
  throw new Error("Missing required Cosmic environment variables");
}

// Create the Cosmic client and export it
export const cosmic = createBucketClient({
  bucketSlug: process.env.COSMIC_BUCKET_SLUG,
  readKey: process.env.COSMIC_READ_KEY,
  writeKey: process.env.COSMIC_WRITE_KEY,
});

// ==================== CAMPAIGN SENDS TRACKING ====================

// CRITICAL FIX: Query existing campaign-sends by email to prevent duplicates
async function checkContactAlreadySent(
  campaignId: string,
  contactEmail: string
): Promise<boolean> {
  try {
    console.log(
      `🔍 Checking if ${contactEmail} already has a send record for campaign ${campaignId}...`
    );

    const { objects } = await cosmic.objects
      .find({
        type: "campaign-sends",
        "metadata.campaign": campaignId,
        "metadata.contact_email": contactEmail,
      })
      .props(["id", "metadata.status"])
      .limit(1);

    const alreadySent = objects.length > 0;

    if (alreadySent) {
      console.log(
        `⊗ Email ${contactEmail} already has a campaign-send record (status: ${objects[0].metadata.status.value})`
      );
    }

    return alreadySent;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return false; // No existing record found
    }
    console.error(`Error checking send status for ${contactEmail}:`, error);
    return false; // On error, assume not sent to allow retry
  }
}

// UPDATED: Atomic reservation with deterministic slugs (no UUID) + email-based duplicate check
// OPTIMIZED: Added MongoDB/Lambda throttling to prevent connection pool exhaustion
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
    `🔒 Attempting to reserve ${targetBatchSize} contacts for campaign ${campaignId}...`
  );

  // MongoDB/Lambda optimization: Process contacts with throttling
  const RESERVATION_DELAY = 50; // 50ms delay between reservation attempts
  let processedCount = 0;

  for (const contact of contacts.slice(0, batchSize)) {
    try {
      // CRITICAL FIX: Email-based duplicate check BEFORE attempting reservation
      const alreadySent = await checkContactAlreadySent(
        campaignId,
        contact.metadata.email
      );

      if (alreadySent) {
        console.log(
          `⊗ Skipping ${contact.metadata.email} - already has a send record for this campaign`
        );
        continue;
      }

      // CRITICAL FIX: Deterministic slug WITHOUT random UUID
      // Format: send-{campaignId}-{contactId}
      // This enforces ONE send per campaign-contact pair at the database level
      const uniqueSlug = `send-${campaignId}-${contact.id}`;

      console.log(`🔒 DEBUG: Creating pending record with slug: ${uniqueSlug}`);

      // Try to atomically create the record with unique slug
      // Cosmic will reject if slug already exists (= another process reserved it)
      const { object } = await cosmic.objects.insertOne({
        type: "campaign-sends",
        title: `Send: Campaign ${campaignId} to ${contact.metadata.email}`,
        slug: uniqueSlug, // CRITICAL: No UUID - enforces uniqueness
        metadata: {
          campaign: campaignId,
          contact: contact.id,
          contact_email: contact.metadata.email,
          status: "pending",
          reserved_at: new Date().toISOString(),
          retry_count: 0,
        },
      });

      console.log(`🔒 DEBUG: Created pending record:`, {
        id: object.id,
        slug: object.slug,
        status: object.metadata.status,
        contact_email: object.metadata.contact_email,
      });

      // If we got here, we successfully reserved this contact
      reserved.push(contact);
      pendingRecordIds.set(contact.id, object.id);
    } catch (error: any) {
      // Slug conflict means another process already reserved/sent this contact
      // This is EXPECTED behavior in concurrent processing - not an error!
      const errorMessage = error.message?.toLowerCase() || "";

      if (
        errorMessage.includes("slug") ||
        errorMessage.includes("unique") ||
        errorMessage.includes("duplicate")
      ) {
        // Silent skip - contact is already being handled by another process
        console.log(
          `⊗ Contact ${contact.id} (${contact.metadata.email}) already reserved/sent by another process (slug conflict)`
        );
        continue;
      }

      // Other errors should be logged but not stop the batch
      console.error(`✗ Error reserving contact ${contact.id}:`, error.message);
      continue;
    }

    // MongoDB/Lambda throttling: Add delay between reservation attempts
    processedCount++;
    if (processedCount < targetBatchSize) {
      await new Promise((resolve) => setTimeout(resolve, RESERVATION_DELAY));
    }
  }

  console.log(
    `✅ Successfully reserved ${reserved.length}/${targetBatchSize} contacts (${
      targetBatchSize - reserved.length
    } already reserved/sent)`
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

// Batch check which contacts have been sent to (efficient)
export async function filterUnsentContacts(
  campaignId: string,
  contactIds: string[]
): Promise<string[]> {
  if (contactIds.length === 0) return [];

  try {
    // Get all sends for this campaign (including pending)
    const sentContactIds = new Set<string>();
    let skip = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const { contactIds: batch, total } = await getSentContactIds(campaignId, {
        limit,
        skip,
      });

      batch.forEach((id) => sentContactIds.add(id));
      skip += limit;
      hasMore = skip < total;
    }

    // Filter out contacts that have any send record (pending, sent, failed, bounced)
    return contactIds.filter((id) => !sentContactIds.has(id));
  } catch (error) {
    console.error("Error filtering unsent contacts:", error);
    return contactIds; // Return all if error (safer than skipping)
  }
}

// ==================== END CAMPAIGN SENDS TRACKING ====================

// OPTIMIZED: Enhanced batch duplicate checking with sequential processing for better reliability
export async function checkEmailsExist(emails: string[]): Promise<string[]> {
  try {
    if (!emails || emails.length === 0) {
      return [];
    }

    // Optimized batch size for better API reliability
    const QUERY_BATCH_SIZE = 25; // Reduced from 50 to 25 for better API stability
    const existingEmails: string[] = [];

    // Process batches sequentially (not in parallel) for better API reliability
    const allBatches: string[][] = [];

    // Split emails into smaller, more manageable batches
    for (let i = 0; i < emails.length; i += QUERY_BATCH_SIZE) {
      allBatches.push(emails.slice(i, i + QUERY_BATCH_SIZE));
    }

    console.log(
      `Processing ${allBatches.length} email check batches sequentially for better reliability...`
    );

    // Process batches sequentially with retry logic
    for (let i = 0; i < allBatches.length; i++) {
      const emailBatch = allBatches[i];

      // CRITICAL FIX: Add validation that emailBatch is defined and has items
      if (!emailBatch || emailBatch.length === 0) {
        console.log(`Skipping undefined or empty email batch ${i + 1}`);
        continue;
      }

      let retryCount = 0;
      const maxRetries = 3;
      let success = false;

      while (!success && retryCount < maxRetries) {
        try {
          console.log(
            `Checking duplicates for batch ${i + 1}/${allBatches.length}: ${
              emailBatch.length
            } emails (attempt ${retryCount + 1})`
          );

          // Query only the emails in this batch
          const { objects } = await cosmic.objects
            .find({
              type: "email-contacts",
              "metadata.email": { $in: emailBatch },
            })
            .props(["metadata.email"]) // Only fetch email field for efficiency
            .limit(emailBatch.length);

          // Extract existing emails from results
          const batchResults = objects
            .map((obj: any) => obj.metadata?.email)
            .filter(
              (email: any): email is string =>
                typeof email === "string" && email.length > 0
            )
            .map((email: string) => email.toLowerCase());

          existingEmails.push(...batchResults);
          success = true;
        } catch (batchError) {
          retryCount++;
          console.error(
            `Error checking batch ${i + 1} (attempt ${retryCount}):`,
            batchError
          );

          if (retryCount < maxRetries) {
            // Exponential backoff for retries
            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 3000);
            console.log(`Retrying batch ${i + 1} after ${delay}ms delay...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            console.error(
              `Failed to check batch ${
                i + 1
              } after ${maxRetries} attempts. Continuing...`
            );
            // Continue with next batch instead of breaking entire process
          }
        }
      }

      // Longer delay between batches to prevent API rate limiting
      if (i + 1 < allBatches.length) {
        await new Promise((resolve) => setTimeout(resolve, 300)); // Increased from 100ms
      }
    }

    return existingEmails;
  } catch (error) {
    console.error("Error checking duplicate emails:", error);
    // Return empty array instead of throwing - let the process continue
    return [];
  }
}

// Enhanced Upload Job Management Functions
export async function getUploadJobs(options?: {
  status?: string | string[];
  limit?: number;
  skip?: number;
}): Promise<UploadJob[]> {
  try {
    const limit = options?.limit || 50;
    const skip = options?.skip || 0;
    const status = options?.status;

    let query: any = { type: "upload-jobs" };

    if (status && status !== "all") {
      if (Array.isArray(status)) {
        // Handle multiple status values
        query["metadata.status"] = { $in: status };
      } else {
        query["metadata.status"] = status;
      }
    }

    const { objects } = await cosmic.objects
      .find(query)
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1)
      .limit(limit)
      .skip(skip);

    return objects as UploadJob[];
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return [];
    }
    console.error("Error fetching upload jobs:", error);
    throw new Error("Failed to fetch upload jobs");
  }
}

export async function getUploadJob(id: string): Promise<UploadJob | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    return object as UploadJob;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error(`Error fetching upload job ${id}:`, error);
    throw new Error("Failed to fetch upload job");
  }
}

export async function createUploadJob(
  data: CreateUploadJobData
): Promise<UploadJob> {
  try {
    // OPTIMIZED: Use smaller, more reliable chunk sizes
    const optimizedChunkSize = Math.min(data.processing_chunk_size || 150, 150); // Cap at 150

    const { object } = await cosmic.objects.insertOne({
      title: `Upload Job - ${data.file_name}`,
      type: "upload-jobs",
      metadata: {
        file_name: data.file_name,
        file_size: data.file_size,
        total_contacts: data.total_contacts,
        processed_contacts: 0, // CRITICAL: This is the canonical progress counter
        successful_contacts: 0,
        failed_contacts: 0,
        duplicate_contacts: 0,
        validation_errors: 0,
        status: {
          key: "pending",
          value: "Pending",
        },
        selected_lists: data.selected_lists,
        csv_data: data.csv_data,
        progress_percentage: 0,
        started_at: new Date().toISOString(),
        // Enhanced chunked processing fields with optimized, smaller defaults
        processing_chunk_size: optimizedChunkSize, // Reduced from 500 to 150
        auto_resume_enabled: data.auto_resume_enabled !== false, // Default true
        current_batch_index: 0,
        total_batches: Math.ceil(data.total_contacts / optimizedChunkSize), // Updated calculation
        chunk_processing_history: [],
        max_processing_time_ms: 180000, // Reduced to 3 minutes
      },
    });

    return object as UploadJob;
  } catch (error) {
    console.error("Error creating upload job:", error);
    throw new Error("Failed to create upload job");
  }
}

export async function updateUploadJobProgress(
  id: string,
  progress: {
    processed_contacts?: number;
    successful_contacts?: number;
    failed_contacts?: number;
    duplicate_contacts?: number;
    validation_errors?: number;
    status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
    progress_percentage?: number;
    processing_rate?: string;
    estimated_completion?: string;
    completed_at?: string;
    error_message?: string;
    errors?: string[];
    duplicates?: string[];
    message?: string;
    // Enhanced chunked processing fields
    current_batch_index?: number;
    batch_size?: number;
    total_batches?: number;
    last_processed_row?: number;
    processing_chunk_size?: number;
    resume_from_contact?: number;
    chunk_processing_history?: Array<{
      chunk_number: number;
      contacts_processed: number;
      processing_time_ms: number;
      timestamp: string;
      status: "completed" | "partial" | "failed";
    }>;
    auto_resume_enabled?: boolean;
    max_processing_time_ms?: number;
  }
): Promise<void> {
  try {
    const metadataUpdates: any = {};

    // Basic progress fields
    if (progress.processed_contacts !== undefined)
      metadataUpdates.processed_contacts = progress.processed_contacts;
    if (progress.successful_contacts !== undefined)
      metadataUpdates.successful_contacts = progress.successful_contacts;
    if (progress.failed_contacts !== undefined)
      metadataUpdates.failed_contacts = progress.failed_contacts;
    if (progress.duplicate_contacts !== undefined)
      metadataUpdates.duplicate_contacts = progress.duplicate_contacts;
    if (progress.validation_errors !== undefined)
      metadataUpdates.validation_errors = progress.validation_errors;

    // CRITICAL FIX: Ensure progress percentage never exceeds 100%
    if (progress.progress_percentage !== undefined) {
      metadataUpdates.progress_percentage = Math.max(
        0,
        Math.min(100, progress.progress_percentage)
      );
    }

    if (progress.processing_rate !== undefined)
      metadataUpdates.processing_rate = progress.processing_rate;
    if (progress.estimated_completion !== undefined)
      metadataUpdates.estimated_completion = progress.estimated_completion;
    if (progress.completed_at !== undefined)
      metadataUpdates.completed_at = progress.completed_at;
    if (progress.error_message !== undefined)
      metadataUpdates.error_message = progress.error_message;
    if (progress.errors !== undefined) metadataUpdates.errors = progress.errors;
    if (progress.duplicates !== undefined)
      metadataUpdates.duplicates = progress.duplicates;
    if (progress.message !== undefined)
      metadataUpdates.message = progress.message;

    // Enhanced chunked processing fields
    if (progress.current_batch_index !== undefined)
      metadataUpdates.current_batch_index = progress.current_batch_index;
    if (progress.batch_size !== undefined)
      metadataUpdates.batch_size = progress.batch_size;
    if (progress.total_batches !== undefined)
      metadataUpdates.total_batches = progress.total_batches;
    if (progress.last_processed_row !== undefined)
      metadataUpdates.last_processed_row = progress.last_processed_row;
    if (progress.processing_chunk_size !== undefined)
      metadataUpdates.processing_chunk_size = progress.processing_chunk_size;
    if (progress.resume_from_contact !== undefined)
      metadataUpdates.resume_from_contact = progress.resume_from_contact;
    if (progress.chunk_processing_history !== undefined)
      metadataUpdates.chunk_processing_history =
        progress.chunk_processing_history;
    if (progress.auto_resume_enabled !== undefined)
      metadataUpdates.auto_resume_enabled = progress.auto_resume_enabled;
    if (progress.max_processing_time_ms !== undefined)
      metadataUpdates.max_processing_time_ms = progress.max_processing_time_ms;

    if (progress.status !== undefined) {
      // Map internal status values to exact Cosmic select-dropdown values
      const statusMapping = {
        pending: "Pending",
        processing: "Processing",
        completed: "Completed",
        failed: "Failed",
        cancelled: "Cancelled",
      };

      const cosmicStatusValue = statusMapping[progress.status];

      metadataUpdates.status = {
        key: progress.status,
        value: cosmicStatusValue,
      };
    }

    await cosmic.objects.updateOne(id, {
      metadata: metadataUpdates,
    });
  } catch (error) {
    console.error(`Error updating upload job progress ${id}:`, error);
    throw new Error("Failed to update upload job progress");
  }
}

export async function deleteUploadJob(id: string): Promise<void> {
  try {
    await cosmic.objects.deleteOne(id);
  } catch (error) {
    console.error(`Error deleting upload job ${id}:`, error);
    throw new Error("Failed to delete upload job");
  }
}

// Media Management Functions - All server-side operations
export async function getMedia(options?: {
  limit?: number;
  skip?: number;
  folder?: string;
  sort?: string;
  search?: string;
}): Promise<{
  media: MediaItem[];
  total: number;
  limit: number;
  skip: number;
}> {
  try {
    const limit = options?.limit || 50;
    const skip = options?.skip || 0;
    const folder = options?.folder;
    const sort = options?.sort || "-created_at";
    const search = options?.search?.trim();

    // Build query object for Cosmic API
    let query: any = {};

    // Add folder filter if specified
    if (folder) {
      query.folder = folder;
    }

    // Add search functionality - search across multiple fields
    if (search) {
      // Use Cosmic's search capabilities - search in name and original_name
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { original_name: { $regex: search, $options: "i" } },
      ];
    }

    // Fetch media with server-side query
    const result = await cosmic.media
      .find(query)
      .props([
        "id",
        "name",
        "original_name",
        "url",
        "imgix_url",
        "size",
        "type",
        "folder",
        "alt_text",
        "width",
        "height",
        "created_at",
        "metadata",
      ])
      .limit(limit)
      .skip(skip);

    // Handle server-side sorting since Cosmic media API has limited sorting options
    let mediaItems = result.media as MediaItem[];

    // Apply sorting on server
    if (sort === "-created_at") {
      mediaItems.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (sort === "created_at") {
      mediaItems.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } else if (sort === "name") {
      mediaItems.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "-name") {
      mediaItems.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sort === "size") {
      mediaItems.sort((a, b) => a.size - b.size);
    } else if (sort === "-size") {
      mediaItems.sort((a, b) => b.size - a.size);
    }

    // Server-side pagination after sorting if needed
    const total = result.total || mediaItems.length;

    return {
      media: mediaItems,
      total,
      limit,
      skip,
    };
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return {
        media: [],
        total: 0,
        limit: options?.limit || 50,
        skip: options?.skip || 0,
      };
    }
    console.error("Error fetching media:", error);
    throw new Error("Failed to fetch media from server");
  }
}

export async function getSingleMedia(id: string): Promise<MediaItem | null> {
  try {
    const result = await cosmic.media
      .findOne({ id })
      .props([
        "id",
        "name",
        "original_name",
        "url",
        "imgix_url",
        "size",
        "type",
        "folder",
        "alt_text",
        "width",
        "height",
        "created_at",
        "metadata",
      ]);

    return result.media as MediaItem;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error(`Error fetching media ${id}:`, error);
    throw new Error("Failed to fetch media from server");
  }
}

export async function uploadMedia(
  file: File,
  options?: {
    folder?: string;
    alt_text?: string;
    metadata?: Record<string, any>;
  }
): Promise<MediaItem> {
  try {
    // Convert File to Buffer (Node.js compatible)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create the upload payload with proper structure for Cosmic SDK
    const uploadData: any = {
      media: {
        originalname: file.name,
        buffer: buffer,
        mimetype: file.type,
      },
    };

    // Add optional parameters
    if (options?.folder) {
      uploadData.folder = options.folder;
    }

    if (options?.alt_text) {
      uploadData.alt_text = options.alt_text;
    }

    // Add server-side metadata including upload tracking
    const serverMetadata = {
      uploaded_via: "media_library_server",
      upload_timestamp: new Date().toISOString(),
      file_size: file.size,
      mime_type: file.type,
      ...options?.metadata,
    };

    uploadData.metadata = serverMetadata;

    // Execute server-side upload to Cosmic
    const result = await cosmic.media.insertOne(uploadData);

    if (!result.media) {
      throw new Error("Upload failed - no media returned from server");
    }

    return result.media as MediaItem;
  } catch (error) {
    console.error("Error uploading media:", error);
    throw new Error(
      `Failed to upload media to server: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function updateMedia(
  id: string,
  updates: {
    folder?: string;
    alt_text?: string;
    metadata?: Record<string, any>;
  }
): Promise<MediaItem> {
  try {
    // Add server-side update tracking
    const serverUpdates = {
      ...updates,
      metadata: {
        ...updates.metadata,
        last_modified: new Date().toISOString(),
        modified_via: "media_library_server",
      },
    };

    const result = await cosmic.media.updateOne(id, serverUpdates);

    if (!result.media) {
      throw new Error("Update failed - no media returned from server");
    }

    return result.media as MediaItem;
  } catch (error) {
    console.error(`Error updating media ${id}:`, error);
    throw new Error(
      `Failed to update media on server: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function deleteMedia(id: string): Promise<void> {
  try {
    await cosmic.media.deleteOne(id);
  } catch (error) {
    console.error(`Error deleting media ${id}:`, error);
    throw new Error(
      `Failed to delete media on server: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Get media folders (unique folder names) - Server-side aggregation
export async function getMediaFolders(): Promise<string[]> {
  try {
    // Fetch all media to get unique folders - could be optimized with aggregation
    const result = await cosmic.media.find({}).props(["folder"]);

    // Server-side folder aggregation
    const folderSet = new Set<string>();
    result.media.forEach((item: any) => {
      if (item.folder && item.folder.trim()) {
        folderSet.add(item.folder.trim());
      }
    });

    // Return sorted folders
    return Array.from(folderSet).sort();
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return [];
    }
    console.error("Error fetching media folders:", error);
    return [];
  }
}

// Enhanced server-side media search with multiple criteria
export async function searchMedia(searchOptions: {
  query?: string;
  folder?: string;
  type?: string;
  limit?: number;
  skip?: number;
}): Promise<{
  media: MediaItem[];
  total: number;
}> {
  try {
    const { query, folder, type, limit = 50, skip = 0 } = searchOptions;

    // Build search query for server-side execution
    let searchQuery: any = {};

    // Add text search
    if (query?.trim()) {
      searchQuery.$or = [
        { name: { $regex: query.trim(), $options: "i" } },
        { original_name: { $regex: query.trim(), $options: "i" } },
        { alt_text: { $regex: query.trim(), $options: "i" } },
      ];
    }

    // Add folder filter
    if (folder) {
      searchQuery.folder = folder;
    }

    // Add type filter
    if (type) {
      searchQuery.type = { $regex: type, $options: "i" };
    }

    const result = await cosmic.media
      .find(searchQuery)
      .props([
        "id",
        "name",
        "original_name",
        "url",
        "imgix_url",
        "size",
        "type",
        "folder",
        "alt_text",
        "width",
        "height",
        "created_at",
        "metadata",
      ])
      .limit(limit)
      .skip(skip);

    return {
      media: result.media as MediaItem[],
      total: result.total || 0,
    };
  } catch (error) {
    console.error("Error searching media:", error);
    throw new Error("Failed to search media on server");
  }
}

// Server-side media statistics
export async function getMediaStats(): Promise<{
  total: number;
  totalSize: number;
  byType: Record<string, number>;
  byFolder: Record<string, number>;
}> {
  try {
    const result = await cosmic.media
      .find({})
      .props(["type", "folder", "size"]);

    const stats = {
      total: result.media.length,
      totalSize: 0,
      byType: {} as Record<string, number>,
      byFolder: {} as Record<string, number>,
    };

    // Server-side aggregation
    result.media.forEach((item: any) => {
      stats.totalSize += item.size || 0;

      // Count by type
      const mainType = item.type?.split("/")[0] || "unknown";
      stats.byType[mainType] = (stats.byType[mainType] || 0) + 1;

      // Count by folder
      const folder = item.folder || "uncategorized";
      stats.byFolder[folder] = (stats.byFolder[folder] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error("Error getting media stats:", error);
    throw new Error("Failed to get media statistics from server");
  }
}

// Email Lists
export async function getEmailLists(): Promise<EmailList[]> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: "email-lists" })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    // Update contact counts for all lists using efficient method
    const listsWithUpdatedCounts = await Promise.all(
      objects.map(async (list: EmailList) => {
        const contactCount = await getListContactCountEfficient(list.id);
        return {
          ...list,
          metadata: {
            ...list.metadata,
            total_contacts: contactCount,
          },
        } as EmailList;
      })
    );

    return listsWithUpdatedCounts;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return [];
    }
    console.error("Error fetching email lists:", error);
    throw new Error("Failed to fetch email lists");
  }
}

export async function getEmailList(id: string): Promise<EmailList | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    if (!object) return null;

    // Update the contact count for this list using efficient method
    const contactCount = await getListContactCountEfficient(id);

    return {
      ...object,
      metadata: {
        ...object.metadata,
        total_contacts: contactCount,
      },
    } as EmailList;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error(`Error fetching email list ${id}:`, error);
    throw new Error("Failed to fetch email list");
  }
}

export async function createEmailList(
  data: CreateListData
): Promise<EmailList> {
  try {
    const { object } = await cosmic.objects.insertOne({
      title: data.name,
      type: "email-lists",
      metadata: {
        name: data.name,
        description: data.description || "",
        list_type: {
          key: data.list_type.toLowerCase().replace(" ", "_"),
          value: data.list_type,
        },
        active: data.active !== false,
        created_date: new Date().toISOString().split("T")[0],
        total_contacts: 0,
      },
    });

    return object as EmailList;
  } catch (error) {
    console.error("Error creating email list:", error);
    throw new Error("Failed to create email list");
  }
}

export async function updateEmailList(
  id: string,
  data: Partial<CreateListData>
): Promise<EmailList> {
  try {
    const updateData: any = {};

    if (data.name !== undefined) {
      updateData.title = data.name;
    }

    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {};

    if (data.name !== undefined) metadataUpdates.name = data.name;
    if (data.description !== undefined)
      metadataUpdates.description = data.description;
    if (data.active !== undefined) metadataUpdates.active = data.active;

    if (data.list_type !== undefined) {
      metadataUpdates.list_type = {
        key: data.list_type.toLowerCase().replace(" ", "_"),
        value: data.list_type,
      };
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates;
    }

    const { object } = await cosmic.objects.updateOne(id, updateData);
    return object as EmailList;
  } catch (error) {
    console.error(`Error updating email list ${id}:`, error);
    throw new Error("Failed to update email list");
  }
}

export async function deleteEmailList(id: string): Promise<void> {
  try {
    await cosmic.objects.deleteOne(id);
  } catch (error) {
    console.error(`Error deleting email list ${id}:`, error);
    throw new Error("Failed to delete email list");
  }
}

// OPTIMIZED: Get actual contact count for a list using efficient minimal query
export async function getListContactCountEfficient(
  listId: string
): Promise<number> {
  try {
    // Use minimal query with limit 1 and minimal props to get just the total count
    const result = await cosmic.objects
      .find({
        type: "email-contacts",
        "metadata.lists": listId,
      })
      .props(["title"]) // Minimal props - just need one field
      .limit(1); // Minimal limit since we only care about the total

    // The total property contains the actual count
    return result.total || 0;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return 0;
    }
    console.error(
      `Error getting efficient contact count for list ${listId}:`,
      error
    );
    return 0;
  }
}

// Get actual contact count for a list (keep legacy method for backward compatibility)
export async function getListContactCount(listId: string): Promise<number> {
  // Use the optimized version
  return getListContactCountEfficient(listId);
}

// Update list contact count using efficient method
export async function updateListContactCount(listId: string): Promise<void> {
  try {
    const contactCount = await getListContactCountEfficient(listId);

    await cosmic.objects.updateOne(listId, {
      metadata: {
        total_contacts: contactCount,
      },
    });
  } catch (error) {
    console.error(`Error updating contact count for list ${listId}:`, error);
    // Don't throw error to avoid breaking other operations
  }
}

// Email Contacts with enhanced pagination support
export async function getEmailContacts(options?: {
  limit?: number;
  skip?: number;
  search?: string;
  status?: string;
  list_id?: string;
}): Promise<{
  contacts: EmailContact[];
  total: number;
  limit: number;
  skip: number;
}> {
  try {
    // Increase the default limit to handle larger datasets more efficiently
    const limit = Math.min(options?.limit || 1000, 1000); // Cap at 1000 (Cosmic limit)
    const skip = options?.skip || 0;
    const search = options?.search?.trim();
    const status = options?.status;
    const list_id = options?.list_id;

    // Build query object
    let query: any = { type: "email-contacts" };

    // Add status filter if provided
    if (status && status !== "all") {
      query["metadata.status"] = status;
    }

    // Add list filter if provided
    if (list_id) {
      query["metadata.lists"] = list_id;
    }

    // Add search filter if provided
    if (search) {
      // For Cosmic CMS, we'll use a broad search approach
      // Since Cosmic doesn't support complex OR queries easily,
      // we'll fetch more data and filter client-side as a fallback
      // But first try to search by email which is most common
      if (search.includes("@")) {
        // If search looks like an email, search by email
        query["metadata.email"] = { $regex: search, $options: "i" };
      } else {
        // Otherwise search by name
        query["metadata.first_name"] = { $regex: search, $options: "i" };
      }
    }

    const result = await cosmic.objects
      .find(query)
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1)
      .limit(limit)
      .skip(skip);

    let contacts = result.objects as EmailContact[];
    let total = result.total || 0;

    // If we have a search term and didn't find results with the primary search,
    // or if we want to search across multiple fields, do client-side filtering
    if (search && (!contacts.length || !search.includes("@"))) {
      // Fetch more data for comprehensive search
      const broadResult = await cosmic.objects
        .find({ type: "email-contacts" })
        .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
        .depth(1)
        .limit(1000); // Get more records for comprehensive search

      const allContacts = broadResult.objects as EmailContact[];

      // Filter contacts that match search across multiple fields
      const filteredContacts = allContacts.filter((contact) => {
        const searchLower = search.toLowerCase();
        const firstName = contact.metadata.first_name?.toLowerCase() || "";
        const lastName = contact.metadata.last_name?.toLowerCase() || "";
        const email = contact.metadata.email?.toLowerCase() || "";

        const matchesSearch =
          firstName.includes(searchLower) ||
          lastName.includes(searchLower) ||
          email.includes(searchLower);

        const matchesStatus =
          !status ||
          status === "all" ||
          contact.metadata.status?.value === status;

        const matchesList =
          !list_id ||
          (contact.metadata.lists &&
            (Array.isArray(contact.metadata.lists)
              ? contact.metadata.lists.some((list: any) =>
                  typeof list === "string"
                    ? list === list_id
                    : list.id === list_id
                )
              : false));

        return matchesSearch && matchesStatus && matchesList;
      });

      // Apply pagination to filtered results
      total = filteredContacts.length;
      contacts = filteredContacts.slice(skip, skip + limit);
    }

    return {
      contacts,
      total,
      limit,
      skip,
    };
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return {
        contacts: [],
        total: 0,
        limit: options?.limit || 1000,
        skip: options?.skip || 0,
      };
    }
    console.error("Error fetching email contacts:", error);
    throw new Error("Failed to fetch email contacts");
  }
}

export async function getUnsubscribedContactsByCampaign(
  campaignId: string,
  options?: {
    limit?: number;
    skip?: number;
  }
): Promise<{
  contacts: EmailContact[];
  total: number;
  limit: number;
  skip: number;
}> {
  try {
    const limit = options?.limit || 10;
    const skip = options?.skip || 0;

    // Build query to find contacts unsubscribed from this specific campaign
    const query = {
      type: "email-contacts",
      $and: [
        {
          "metadata.unsubscribe_campaign": campaignId,
        },
      ],
    };

    const result = await cosmic.objects
      .find(query)
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1)
      .limit(limit)
      .skip(skip);

    const contacts = result.objects as EmailContact[];
    const total = result.total || 0;

    return {
      contacts,
      total,
      limit,
      skip,
    };
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return {
        contacts: [],
        total: 0,
        limit: options?.limit || 10,
        skip: options?.skip || 0,
      };
    }
    console.error("Error fetching unsubscribed contacts:", error);
    throw new Error("Failed to fetch unsubscribed contacts");
  }
}

export async function getEmailContact(
  id: string
): Promise<EmailContact | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    return object as EmailContact;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error(`Error fetching email contact ${id}:`, error);
    throw new Error("Failed to fetch email contact");
  }
}

export async function createEmailContact(
  data: CreateContactData
): Promise<EmailContact> {
  try {
    const { object } = await cosmic.objects.insertOne({
      title: `${data.first_name} ${data.last_name || ""}`.trim(),
      type: "email-contacts",
      metadata: {
        first_name: data.first_name,
        last_name: data.last_name || "",
        email: data.email,
        status: {
          key: data.status.toLowerCase().replace(" ", "_"),
          value: data.status,
        },
        lists: data.list_ids || [],
        tags: data.tags || [],
        subscribe_date:
          data.subscribe_date || new Date().toISOString().split("T")[0],
        notes: data.notes || "",
      },
    });

    // Update contact counts for associated lists using sequential processing for better reliability
    if (data.list_ids && data.list_ids.length > 0) {
      // Sequential list count updates for better reliability
      for (const listId of data.list_ids) {
        try {
          await updateListContactCount(listId);
          // Small delay between updates to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Error updating contact count for list ${listId}:`,
            error
          );
          // Continue with other lists instead of breaking
        }
      }
    }

    return object as EmailContact;
  } catch (error) {
    console.error("Error creating email contact:", error);
    throw new Error("Failed to create email contact");
  }
}

export async function updateEmailContact(
  id: string,
  data: Partial<CreateContactData>
): Promise<EmailContact> {
  try {
    const updateData: any = {};

    // Update title if name fields changed
    if (data.first_name !== undefined || data.last_name !== undefined) {
      // Get current contact to merge name fields
      const current = await getEmailContact(id);
      if (!current) throw new Error("Contact not found");

      const firstName =
        data.first_name !== undefined
          ? data.first_name
          : current.metadata.first_name;
      const lastName =
        data.last_name !== undefined
          ? data.last_name
          : current.metadata.last_name || "";

      updateData.title = `${firstName} ${lastName}`.trim();
    }

    // Track old list IDs for count updates
    let oldListIds: string[] = [];
    if (data.list_ids !== undefined) {
      const current = await getEmailContact(id);
      if (current && current.metadata.lists) {
        oldListIds = Array.isArray(current.metadata.lists)
          ? current.metadata.lists.map((list: any) =>
              typeof list === "string" ? list : list.id
            )
          : [];
      }
    }

    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {};

    if (data.first_name !== undefined)
      metadataUpdates.first_name = data.first_name;
    if (data.last_name !== undefined)
      metadataUpdates.last_name = data.last_name;
    if (data.email !== undefined) metadataUpdates.email = data.email;
    if (data.list_ids !== undefined) metadataUpdates.lists = data.list_ids;
    if (data.tags !== undefined) metadataUpdates.tags = data.tags;
    if (data.notes !== undefined) metadataUpdates.notes = data.notes;

    if (data.status !== undefined) {
      metadataUpdates.status = {
        key: data.status.toLowerCase().replace(" ", "_"),
        value: data.status,
      };
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates;
    }

    const { object } = await cosmic.objects.updateOne(id, updateData);

    // Update contact counts for affected lists with sequential processing for better reliability
    if (data.list_ids !== undefined) {
      const newListIds = data.list_ids;
      const allAffectedListIds = [...new Set([...oldListIds, ...newListIds])];

      // Sequential list count updates for better reliability
      for (const listId of allAffectedListIds) {
        try {
          await updateListContactCount(listId);
          // Small delay between updates to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Error updating contact count for list ${listId}:`,
            error
          );
          // Continue with other lists instead of breaking
        }
      }
    }

    return object as EmailContact;
  } catch (error) {
    console.error(`Error updating email contact ${id}:`, error);
    throw new Error("Failed to update email contact");
  }
}

export async function deleteEmailContact(id: string): Promise<void> {
  try {
    // Get the contact to find associated lists
    const contact = await getEmailContact(id);
    let affectedListIds: string[] = [];

    if (contact && contact.metadata.lists) {
      affectedListIds = Array.isArray(contact.metadata.lists)
        ? contact.metadata.lists.map((list: any) =>
            typeof list === "string" ? list : list.id
          )
        : [];
    }

    await cosmic.objects.deleteOne(id);

    // Update contact counts for affected lists with sequential processing for better reliability
    if (affectedListIds.length > 0) {
      for (const listId of affectedListIds) {
        try {
          await updateListContactCount(listId);
          // Small delay between updates to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Error updating contact count for list ${listId}:`,
            error
          );
          // Continue with other lists instead of breaking
        }
      }
    }
  } catch (error) {
    console.error(`Error deleting email contact ${id}:`, error);
    throw new Error("Failed to delete email contact");
  }
}

// Bulk update contacts with list memberships
export async function bulkUpdateContactLists(
  data: BulkListUpdateData
): Promise<{ updated: number; errors: string[] }> {
  const results = {
    updated: 0,
    errors: [] as string[],
  };

  for (const contactId of data.contact_ids) {
    try {
      const contact = await getEmailContact(contactId);
      if (!contact) {
        results.errors.push(`Contact ${contactId} not found`);
        continue;
      }

      // Get current list IDs
      const currentListIds = contact.metadata.lists
        ? Array.isArray(contact.metadata.lists)
          ? contact.metadata.lists.map((list: any) =>
              typeof list === "string" ? list : list.id
            )
          : []
        : [];

      // Calculate new list IDs
      let newListIds = [...currentListIds];

      // Remove lists
      newListIds = newListIds.filter(
        (id) => !data.list_ids_to_remove.includes(id)
      );

      // Add new lists (avoid duplicates)
      for (const listId of data.list_ids_to_add) {
        if (!newListIds.includes(listId)) {
          newListIds.push(listId);
        }
      }

      // Update contact
      await updateEmailContact(contactId, { list_ids: newListIds });
      results.updated++;
    } catch (error) {
      console.error(`Error updating contact ${contactId}:`, error);
      results.errors.push(
        `Failed to update contact ${contactId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return results;
}

// Enhanced pagination function for getting contacts by list ID
export async function getContactsByListId(
  listId: string
): Promise<EmailContact[]> {
  const allContacts: EmailContact[] = [];
  let skip = 0;
  const limit = 1000; // Use the Cosmic API limit per request
  let hasMore = true;

  while (hasMore) {
    try {
      const { contacts, total } = await getEmailContacts({
        limit,
        skip,
        list_id: listId,
      });

      allContacts.push(...contacts);
      skip += limit;
      hasMore = allContacts.length < total;

      console.log(
        `Fetched ${allContacts.length}/${total} contacts for list ${listId}`
      );
    } catch (error) {
      if (hasStatus(error) && error.status === 404) {
        break; // No more contacts
      }
      console.error(
        `Error fetching contacts for list ${listId} at skip ${skip}:`,
        error
      );
      throw new Error("Failed to fetch contacts for list");
    }
  }

  return allContacts;
}

// Unsubscribe function
export async function unsubscribeContact(
  email: string,
  campaignId?: string | null
): Promise<boolean> {
  try {
    console.log("Unsubscribing contact:", email, campaignId);
    // Find contact by email
    const { objects } = await cosmic.objects
      .find({
        type: "email-contacts",
        "metadata.email": email,
      })
      .props(["id", "metadata"])
      .depth(0);

    if (objects.length === 0) {
      return false; // Contact not found
    }

    const contact = objects[0];

    // Prepare metadata update - only update the specific fields needed
    const updateMetadata: any = {
      status: "Unsubscribed",
      unsubscribed_date: new Date().toISOString(),
    };

    // Add campaign ID if provided
    if (campaignId) {
      updateMetadata.unsubscribe_campaign = campaignId;
    }

    // Update contact with unsubscribe information
    await cosmic.objects.updateOne(contact.id, {
      metadata: updateMetadata,
    });

    console.log(
      `Contact ${email} unsubscribed${
        campaignId ? ` from campaign ${campaignId}` : ""
      }`
    );
    return true;
  } catch (error) {
    console.error(`Error unsubscribing contact with email ${email}:`, error);
    return false;
  }
}

// Email Templates
export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: "email-templates" })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    return objects as EmailTemplate[];
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return [];
    }
    console.error("Error fetching email templates:", error);
    throw new Error("Failed to fetch email templates");
  }
}

export async function getEmailTemplate(
  id: string
): Promise<EmailTemplate | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    return object as EmailTemplate;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error(`Error fetching email template ${id}:`, error);
    throw new Error("Failed to fetch email template");
  }
}

export async function createEmailTemplate(
  data: CreateTemplateData
): Promise<EmailTemplate> {
  try {
    const { object } = await cosmic.objects.insertOne({
      title: data.name,
      type: "email-templates",
      metadata: {
        name: data.name,
        subject: data.subject,
        content: data.content,
        template_type: {
          key: data.template_type.toLowerCase().replace(" ", "_"),
          value: data.template_type,
        },
        active: data.active,
      },
    });

    return object as EmailTemplate;
  } catch (error) {
    console.error("Error creating email template:", error);
    throw new Error("Failed to create email template");
  }
}

export async function updateEmailTemplate(
  id: string,
  data: Partial<CreateTemplateData>
): Promise<EmailTemplate> {
  try {
    const updateData: any = {};

    if (data.name !== undefined) {
      updateData.title = data.name;
    }

    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {};

    if (data.name !== undefined) metadataUpdates.name = data.name;
    if (data.subject !== undefined) metadataUpdates.subject = data.subject;
    if (data.content !== undefined) metadataUpdates.content = data.content;
    if (data.active !== undefined) metadataUpdates.active = data.active;

    if (data.template_type !== undefined) {
      metadataUpdates.template_type = {
        key: data.template_type.toLowerCase().replace(" ", "_"),
        value: data.template_type,
      };
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates;
    }

    const { object } = await cosmic.objects.updateOne(id, updateData);
    return object as EmailTemplate;
  } catch (error) {
    console.error(`Error updating email template ${id}:`, error);
    throw new Error("Failed to update email template");
  }
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  try {
    await cosmic.objects.deleteOne(id);
  } catch (error) {
    console.error(`Error deleting email template ${id}:`, error);
    throw new Error("Failed to delete email template");
  }
}

export async function duplicateEmailTemplate(
  id: string
): Promise<EmailTemplate> {
  try {
    const original = await getEmailTemplate(id);
    if (!original) {
      throw new Error("Original template not found");
    }

    const duplicatedData: CreateTemplateData = {
      name: `${original.metadata.name} (Copy)`,
      subject: original.metadata.subject,
      content: original.metadata.content,
      template_type: original.metadata.template_type.value,
      active: original.metadata.active,
    };

    return await createEmailTemplate(duplicatedData);
  } catch (error) {
    console.error(`Error duplicating email template ${id}:`, error);
    throw new Error("Failed to duplicate email template");
  }
}

// Marketing Campaigns
export async function getMarketingCampaigns(): Promise<MarketingCampaign[]> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: "marketing-campaigns" })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    return objects as MarketingCampaign[];
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return [];
    }
    console.error("Error fetching marketing campaigns:", error);
    throw new Error("Failed to fetch marketing campaigns");
  }
}

export async function getEmailCampaigns(): Promise<MarketingCampaign[]> {
  // Alias for backward compatibility
  return getMarketingCampaigns();
}

export async function getMarketingCampaign(
  id: string
): Promise<MarketingCampaign | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    return object as MarketingCampaign;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error(`Error fetching marketing campaign ${id}:`, error);
    throw new Error("Failed to fetch marketing campaign");
  }
}

// Add alias function for getEmailCampaign
export async function getEmailCampaign(
  id: string
): Promise<MarketingCampaign | null> {
  return getMarketingCampaign(id);
}

export async function createMarketingCampaign(
  data: CreateCampaignData & { public_sharing_enabled?: boolean }
): Promise<MarketingCampaign> {
  try {
    console.log("Creating marketing campaign with data:", data);

    let template: EmailTemplate | null = null;
    let templateType: { key: string; value: TemplateType } = {
      key: "welcome-email",
      value: "Welcome Email",
    };

    // Validate template exists and get its data for copying
    if (data.template_id) {
      template = await getEmailTemplate(data.template_id);
      if (!template) {
        throw new Error("Selected email template not found");
      }
      templateType = template.metadata.template_type;
    }

    // Validate list IDs if provided using sequential processing for better reliability
    let validListIds: string[] = [];
    if (data.list_ids && data.list_ids.length > 0) {
      console.log("Validating lists for IDs:", data.list_ids);

      // Sequential validation for better reliability
      for (const id of data.list_ids) {
        try {
          const list = await getEmailList(id);
          if (list) {
            validListIds.push(id);
          }
          // Small delay between validations to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error validating list ${id}:`, error);
        }
      }

      console.log(
        `Found ${validListIds.length} valid lists out of ${data.list_ids.length} requested`
      );
    }

    // Validate contact IDs if provided with sequential processing for better reliability
    let validContactIds: string[] = [];
    if (data.contact_ids && data.contact_ids.length > 0) {
      console.log("Validating contacts for IDs:", data.contact_ids);

      // Sequential validation for better reliability
      for (const id of data.contact_ids) {
        try {
          const contact = await getEmailContact(id);
          if (contact) {
            validContactIds.push(id);
          }
          // Small delay between validations to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error validating contact ${id}:`, error);
        }
      }

      console.log(
        `Found ${validContactIds.length} valid contacts out of ${data.contact_ids.length} requested`
      );
    }

    // Validate that we have targets (lists, contacts, or tags)
    const hasLists = validListIds.length > 0;
    const hasContacts = validContactIds.length > 0;
    const hasTags = data.target_tags && data.target_tags.length > 0;

    if (!hasLists && !hasContacts && !hasTags) {
      throw new Error(
        "No valid targets found - please select lists, contacts, or tags"
      );
    }

    console.log(
      `Creating campaign with ${validListIds.length} lists, ${
        validContactIds.length
      } contacts and ${data.target_tags?.length || 0} tags`
    );

    // Create campaign with decoupled content
    const { object } = await cosmic.objects.insertOne({
      title: data.name,
      type: "marketing-campaigns",
      metadata: {
        name: data.name,
        // Store campaign content separately from template
        campaign_content: {
          subject: data.subject || template?.metadata.subject || "",
          content: data.content || template?.metadata.content || "",
          template_type: templateType,
          original_template_id: data.template_id || undefined, // Track original template for reference only
        },
        target_lists: validListIds,
        target_contacts: validContactIds,
        target_tags: data.target_tags || [],
        status: {
          key: "draft",
          value: "Draft",
        },
        send_date: data.send_date || "",
        stats: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
          open_rate: "0%",
          click_rate: "0%",
        },
        public_sharing_enabled: data.public_sharing_enabled ?? true, // Default to true
      },
    });

    console.log("Marketing campaign created successfully:", object.id);
    return object as MarketingCampaign;
  } catch (error) {
    console.error("Error creating marketing campaign:", error);
    throw error; // Re-throw to preserve the original error
  }
}

export async function updateCampaignStatus(
  id: string,
  status: "Draft" | "Scheduled" | "Sending" | "Sent" | "Cancelled",
  stats?: CampaignStats
): Promise<void> {
  try {
    const metadataUpdates: any = {
      status: {
        key: status.toLowerCase(),
        value: status,
      },
    };

    if (stats) {
      metadataUpdates.stats = stats;
    }

    await cosmic.objects.updateOne(id, {
      metadata: metadataUpdates,
    });
  } catch (error) {
    console.error(`Error updating campaign status for ${id}:`, error);
    throw new Error("Failed to update campaign status");
  }
}

// New function to update campaign progress during batch sending
export async function updateCampaignProgress(
  id: string,
  progress: {
    sent: number;
    failed: number;
    total: number;
    progress_percentage: number;
    last_batch_completed: string;
  }
): Promise<void> {
  try {
    const metadataUpdates: any = {
      sending_progress: {
        sent: progress.sent,
        failed: progress.failed,
        total: progress.total,
        progress_percentage: progress.progress_percentage,
        last_batch_completed: progress.last_batch_completed,
        last_updated: new Date().toISOString(),
      },
    };

    await cosmic.objects.updateOne(id, {
      metadata: metadataUpdates,
    });
  } catch (error) {
    console.error(`Error updating campaign progress for ${id}:`, error);
    throw new Error("Failed to update campaign progress");
  }
}

export async function updateMarketingCampaign(
  id: string,
  data: Partial<
    CreateCampaignData & {
      status?: string;
      stats?: CampaignStats;
      public_sharing_enabled?: boolean;
    }
  >
): Promise<MarketingCampaign> {
  try {
    const updateData: any = {};

    if (data.name !== undefined) {
      updateData.title = data.name;
    }

    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {};

    if (data.name !== undefined) metadataUpdates.name = data.name;
    if (data.template_id !== undefined)
      metadataUpdates.template = data.template_id; // Changed: use 'template' field
    if (data.list_ids !== undefined)
      metadataUpdates.target_lists = data.list_ids; // NEW: Store list IDs
    if (data.target_tags !== undefined)
      metadataUpdates.target_tags = data.target_tags;
    if (data.send_date !== undefined)
      metadataUpdates.send_date = data.send_date;
    if (data.stats !== undefined) metadataUpdates.stats = data.stats;
    if (data.public_sharing_enabled !== undefined)
      metadataUpdates.public_sharing_enabled = data.public_sharing_enabled;

    if (data.status !== undefined) {
      metadataUpdates.status = {
        key: data.status.toLowerCase(),
        value: data.status,
      };
    }

    // Handle contact_ids if provided with sequential validation for better reliability
    if (data.contact_ids !== undefined) {
      let validContactIds: string[] = [];
      if (data.contact_ids.length > 0) {
        // Sequential validation for better reliability
        for (const id of data.contact_ids) {
          try {
            const contact = await getEmailContact(id);
            if (contact) {
              validContactIds.push(id);
            }
            // Small delay between validations to prevent API overload
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Error validating contact ${id}:`, error);
          }
        }
      }
      metadataUpdates.target_contacts = validContactIds;
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates;
    }

    const { object } = await cosmic.objects.updateOne(id, updateData);
    return object as MarketingCampaign;
  } catch (error) {
    console.error(`Error updating marketing campaign ${id}:`, error);
    throw new Error("Failed to update marketing campaign");
  }
}

// Add alias function for updateEmailCampaign
export async function updateEmailCampaign(
  id: string,
  data: Partial<
    CreateCampaignData & {
      status?: string;
      stats?: CampaignStats;
      public_sharing_enabled?: boolean;
    }
  >
): Promise<MarketingCampaign> {
  return updateMarketingCampaign(id, data);
}

export async function deleteMarketingCampaign(id: string): Promise<void> {
  try {
    await cosmic.objects.deleteOne(id);
  } catch (error) {
    console.error(`Error deleting marketing campaign ${id}:`, error);
    throw new Error("Failed to delete marketing campaign");
  }
}

// Add alias function for deleteEmailCampaign
export async function deleteEmailCampaign(id: string): Promise<void> {
  return deleteMarketingCampaign(id);
}

// OPTIMIZED: Get all contacts that would be targeted by a campaign with sequential processing for better reliability
export async function getCampaignTargetContacts(
  campaign: MarketingCampaign
): Promise<EmailContact[]> {
  try {
    const allContacts: EmailContact[] = [];
    const addedContactIds = new Set<string>();

    // Sequential processing for lists, contacts, and tags for better reliability

    // Add contacts from target lists using sequential processing
    if (
      campaign.metadata.target_lists &&
      campaign.metadata.target_lists.length > 0
    ) {
      for (const listRef of campaign.metadata.target_lists) {
        const listId = typeof listRef === "string" ? listRef : listRef.id;
        try {
          const listContacts = await getContactsByListId(listId);
          const activeListContacts = listContacts.filter(
            (contact) => contact.metadata.status.value === "Active"
          );

          for (const contact of activeListContacts) {
            if (!addedContactIds.has(contact.id)) {
              allContacts.push(contact);
              addedContactIds.add(contact.id);
            }
          }

          // Small delay between list processing to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Error fetching contacts for list ${listId}:`, error);
        }
      }
    }

    // Add individual target contacts with sequential processing
    if (
      campaign.metadata.target_contacts &&
      campaign.metadata.target_contacts.length > 0
    ) {
      for (const contactId of campaign.metadata.target_contacts) {
        try {
          const contact = await getEmailContact(contactId);
          if (
            contact &&
            contact.metadata.status.value === "Active" &&
            !addedContactIds.has(contact.id)
          ) {
            allContacts.push(contact);
            addedContactIds.add(contact.id);
          }

          // Small delay between contact validation to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error fetching contact ${contactId}:`, error);
        }
      }
    }

    // Add contacts with matching tags
    if (
      campaign.metadata.target_tags &&
      campaign.metadata.target_tags.length > 0
    ) {
      try {
        const { contacts: allContactsResult } = await getEmailContacts({
          limit: 1000,
        });

        for (const contact of allContactsResult) {
          if (
            !addedContactIds.has(contact.id) &&
            contact.metadata.status.value === "Active" &&
            contact.metadata.tags &&
            campaign.metadata.target_tags &&
            campaign.metadata.target_tags.some((tag) =>
              contact.metadata.tags?.includes(tag)
            )
          ) {
            allContacts.push(contact);
            addedContactIds.add(contact.id);
          }
        }
      } catch (error) {
        console.error("Error fetching contacts with matching tags:", error);
      }
    }

    return allContacts;
  } catch (error) {
    console.error("Error getting campaign target contacts:", error);
    throw new Error("Failed to get campaign target contacts");
  }
}

// OPTIMIZED: Get campaign target count with sequential processing for better reliability
export async function getCampaignTargetCount(
  campaign: MarketingCampaign
): Promise<number> {
  try {
    const countedContactIds = new Set<string>();

    // Count contacts from target lists with sequential processing for better reliability
    if (
      campaign.metadata.target_lists &&
      campaign.metadata.target_lists.length > 0
    ) {
      for (const listRef of campaign.metadata.target_lists) {
        const listId = typeof listRef === "string" ? listRef : listRef.id;
        try {
          // Get contacts for this list but only fetch IDs to avoid duplicates
          const { objects: listContacts } = await cosmic.objects
            .find({
              type: "email-contacts",
              "metadata.lists": listId,
              "metadata.status": "Active",
            })
            .props(["id"]);

          for (const contact of listContacts) {
            countedContactIds.add(contact.id);
          }

          // Small delay between list counting to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Error counting contacts for list ${listId}:`, error);
        }
      }
    }

    // Count individual target contacts with sequential processing
    if (
      campaign.metadata.target_contacts &&
      campaign.metadata.target_contacts.length > 0
    ) {
      for (const contactId of campaign.metadata.target_contacts) {
        try {
          // Verify contact exists and is active (minimal query)
          const { objects } = await cosmic.objects
            .find({
              id: contactId,
              type: "email-contacts",
              "metadata.status": "Active",
            })
            .props(["id"])
            .limit(1);

          if (objects.length > 0) {
            countedContactIds.add(contactId);
          }

          // Small delay between contact validation to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error validating contact ${contactId}:`, error);
        }
      }
    }

    // Count contacts with matching tags
    if (
      campaign.metadata.target_tags &&
      campaign.metadata.target_tags.length > 0
    ) {
      try {
        const { objects: taggedContacts } = await cosmic.objects
          .find({
            type: "email-contacts",
            "metadata.status": "Active",
          })
          .props(["id", "metadata.tags"]);

        for (const contact of taggedContacts) {
          if (
            !countedContactIds.has(contact.id) &&
            contact.metadata.tags &&
            campaign.metadata.target_tags &&
            campaign.metadata.target_tags.some((tag: string) =>
              contact.metadata.tags?.includes(tag)
            )
          ) {
            countedContactIds.add(contact.id);
          }
        }
      } catch (error) {
        console.error("Error counting contacts with matching tags:", error);
      }
    }

    return countedContactIds.size;
  } catch (error) {
    console.error("Error getting campaign target count:", error);
    return 0; // Return 0 on error rather than throwing
  }
}

// Settings
export async function getSettings(): Promise<Settings | null> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: "settings" })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    if (objects.length === 0) {
      return null;
    }

    return objects[0] as Settings;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error("Error fetching settings:", error);
    throw new Error("Failed to fetch settings");
  }
}

export async function updateSettings(
  data: UpdateSettingsData
): Promise<Settings> {
  try {
    // First try to get existing settings
    const existingSettings = await getSettings();

    if (existingSettings) {
      // Update existing settings - ONLY include changed fields
      const metadataUpdates: any = {};

      if (data.from_name !== undefined)
        metadataUpdates.from_name = data.from_name;
      if (data.from_email !== undefined)
        metadataUpdates.from_email = data.from_email;
      if (data.reply_to_email !== undefined)
        metadataUpdates.reply_to_email = data.reply_to_email;
      if (data.company_name !== undefined)
        metadataUpdates.company_name = data.company_name;
      if (data.company_address !== undefined)
        metadataUpdates.company_address = data.company_address;
      if (data.website_url !== undefined)
        metadataUpdates.website_url = data.website_url;
      if (data.support_email !== undefined)
        metadataUpdates.support_email = data.support_email;
      if (data.brand_guidelines !== undefined)
        metadataUpdates.brand_guidelines = data.brand_guidelines;
      if (data.primary_brand_color !== undefined)
        metadataUpdates.primary_brand_color = data.primary_brand_color;
      if (data.secondary_brand_color !== undefined)
        metadataUpdates.secondary_brand_color = data.secondary_brand_color;
      if (data.privacy_policy_url !== undefined)
        metadataUpdates.privacy_policy_url = data.privacy_policy_url;
      if (data.terms_of_service_url !== undefined)
        metadataUpdates.terms_of_service_url = data.terms_of_service_url;
      if (data.google_analytics_id !== undefined)
        metadataUpdates.google_analytics_id = data.google_analytics_id;
      if (data.email_signature !== undefined)
        metadataUpdates.email_signature = data.email_signature;
      if (data.test_emails !== undefined)
        metadataUpdates.test_emails = data.test_emails;

      if (data.ai_tone !== undefined) {
        metadataUpdates.ai_tone = {
          key: data.ai_tone.toLowerCase(),
          value: data.ai_tone,
        };
      }

      const { object } = await cosmic.objects.updateOne(existingSettings.id, {
        metadata: metadataUpdates,
      });

      return object as Settings;
    } else {
      // Create new settings
      const { object } = await cosmic.objects.insertOne({
        title: "Email Marketing Settings",
        type: "settings",
        metadata: {
          from_name: data.from_name,
          from_email: data.from_email,
          reply_to_email: data.reply_to_email || data.from_email,
          company_name: data.company_name,
          company_address: data.company_address || "",
          website_url: data.website_url || "",
          support_email: data.support_email || "",
          brand_guidelines: data.brand_guidelines || "",
          primary_brand_color: data.primary_brand_color || "#007bff",
          secondary_brand_color: data.secondary_brand_color || "#6c757d",
          ai_tone: {
            key: (data.ai_tone || "professional").toLowerCase(),
            value: data.ai_tone || "Professional",
          },
          privacy_policy_url: data.privacy_policy_url || "",
          terms_of_service_url: data.terms_of_service_url || "",
          google_analytics_id: data.google_analytics_id || "",
          email_signature: data.email_signature || "",
          test_emails: data.test_emails || "",
        },
      });

      return object as Settings;
    }
  } catch (error) {
    console.error("Error updating settings:", error);
    throw new Error("Failed to update settings");
  }
}

// Add alias function for createOrUpdateSettings
export async function createOrUpdateSettings(
  data: UpdateSettingsData
): Promise<Settings> {
  return updateSettings(data);
}

// Helper function to check if an error has a status property
function hasStatus(error: any): error is { status: number } {
  return typeof error === "object" && error !== null && "status" in error;
}
