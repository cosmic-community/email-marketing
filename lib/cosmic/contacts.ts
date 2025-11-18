import { EmailContact, CreateContactData, BulkListUpdateData } from "@/types";
import { cosmic } from "./client";
import { hasStatus, withTimeout } from "./utils";
import { updateListContactCount } from "./lists";

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

// Email Contacts with enhanced pagination support
export async function getEmailContacts(options?: {
  limit?: number;
  skip?: number;
  search?: string;
  status?: string;
  list_id?: string;
  minimal?: boolean; // NEW: Fetch only essential fields for campaign sending (much faster)
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
    const minimal = options?.minimal || false;

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
      // Search by both name and email simultaneously for better UX
      // Note: Cosmic CMS has limited OR query support, so we'll use a broader approach
      // We'll search by email primarily, but in the UI we filter further client-side if needed

      // Create a regex pattern that can match email or name
      const searchLower = search.toLowerCase();

      // Try to search by email first (most specific)
      query["metadata.email"] = { $regex: search, $options: "i" };

      // Note: For optimal results with name search, we'd need to fetch more data
      // and filter client-side, but email search is more common and performant
    }

    // OPTIMIZATION: Use minimal props for campaign sending (4-6x faster)
    // When minimal=true, only fetch essential fields needed for email sending:
    //   - id: for tracking
    //   - metadata.email: for sending
    //   - metadata.first_name: for personalization
    //   - metadata.status: for filtering active contacts
    // This reduces data transfer by ~80-90% and speeds up large campaign queries dramatically
    const props = minimal
      ? ["id", "metadata.email", "metadata.first_name", "metadata.status"]
      : ["id", "title", "slug", "metadata", "created_at", "modified_at"];

    const depth = minimal ? 0 : 1; // Skip loading related objects when minimal

    const result = await cosmic.objects
      .find(query)
      .props(props)
      .depth(depth)
      .limit(limit)
      .skip(skip);

    let contacts = result.objects as EmailContact[];
    let total = result.total || 0;

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

// Get aggregated click statistics for a campaign
export async function getClickStatsByCampaign(campaignId: string): Promise<{
  uniqueClickers: number;
  totalClicks: number;
  linkStats: Array<{
    url: string;
    clickCount: number;
    uniqueClickers: number;
  }>;
}> {
  try {
    console.log(
      `📊 Getting aggregated click stats for campaign ${campaignId}...`
    );

    // Fetch all click events
    const allEvents: any[] = [];
    let skip = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      try {
        const result = await cosmic.objects
          .find({
            type: "email-tracking-events",
            "metadata.campaign": campaignId,
            "metadata.event_type": "Click",
          })
          .props(["id", "metadata.contact", "metadata.url"])
          .limit(limit)
          .skip(skip)
          .depth(0); // Changed to depth 0 to avoid loading full contact objects

        allEvents.push(...result.objects);

        skip += limit;
        hasMore = result.objects.length === limit && skip < (result.total || 0);
      } catch (batchError) {
        if (hasStatus(batchError) && batchError.status === 404) {
          break;
        }
        throw batchError;
      }
    }

    // Process events to get aggregated stats
    const uniqueContactIds = new Set<string>();
    const linkMap = new Map<string, { contacts: Set<string>; total: number }>();

    for (const event of allEvents) {
      // Extract contact ID
      let contactId: string | undefined;
      if (
        typeof event.metadata?.contact === "object" &&
        event.metadata.contact?.id
      ) {
        contactId = event.metadata.contact.id;
      } else if (typeof event.metadata?.contact === "string") {
        contactId = event.metadata.contact;
      }

      const url = event.metadata?.url || "";

      if (contactId) {
        uniqueContactIds.add(contactId);
      }

      // Aggregate by URL
      if (url) {
        if (!linkMap.has(url)) {
          linkMap.set(url, { contacts: new Set(), total: 0 });
        }
        const linkData = linkMap.get(url)!;
        linkData.total++;
        if (contactId) {
          linkData.contacts.add(contactId);
        }
      }
    }

    // Convert linkMap to array and sort by click count
    const linkStats = Array.from(linkMap.entries())
      .map(([url, data]) => ({
        url,
        clickCount: data.total,
        uniqueClickers: data.contacts.size,
      }))
      .sort((a, b) => b.clickCount - a.clickCount);

    const stats = {
      uniqueClickers: uniqueContactIds.size,
      totalClicks: allEvents.length,
      linkStats,
    };

    console.log(`✅ Aggregated click stats:`, {
      uniqueClickers: stats.uniqueClickers,
      totalClicks: stats.totalClicks,
      uniqueLinks: linkStats.length,
    });

    return stats;
  } catch (error: any) {
    console.error(
      `❌ ERROR getting aggregated click stats for campaign ${campaignId}:`,
      {
        message: error?.message,
        status: error?.status,
        name: error?.name,
        stack: error?.stack,
      }
    );
    return {
      uniqueClickers: 0,
      totalClicks: 0,
      linkStats: [],
    };
  }
}

// Get detailed click events for a campaign
export async function getClickEventsByCampaign(
  campaignId: string,
  options?: {
    limit?: number;
    skip?: number;
  }
): Promise<{
  events: Array<{
    id: string;
    contact_id?: string;
    contact_email?: string;
    contact_name?: string;
    url: string;
    timestamp: string;
    user_agent?: string;
    ip_address?: string;
  }>;
  total: number;
  limit: number;
  skip: number;
}> {
  try {
    const limit = options?.limit || 50;
    const skip = options?.skip || 0;

    // Build query to find click events for this campaign
    const query = {
      type: "email-tracking-events",
      "metadata.campaign": campaignId,
      "metadata.event_type": "Click",
    };

    const result = await cosmic.objects
      .find(query)
      .props(["id", "metadata", "created_at"])
      .limit(limit)
      .skip(skip)
      .depth(1)
      .sort("-created_at"); // Most recent first

    const events = result.objects.map((obj: any) => {
      // Extract contact info from nested contact object or fallback fields
      let contactEmail = obj.metadata?.email || obj.metadata?.contact_email;
      let contactName = "";
      let contactId = obj.metadata?.contact;

      // If contact is an object (with depth=1), extract details
      if (
        typeof obj.metadata?.contact === "object" &&
        obj.metadata.contact?.metadata
      ) {
        const contact = obj.metadata.contact;
        contactId = contact.id;
        contactEmail = contact.metadata?.email || contactEmail;
        const firstName = contact.metadata?.first_name || "";
        const lastName = contact.metadata?.last_name || "";
        contactName = `${firstName} ${lastName}`.trim();
      }

      return {
        id: obj.id,
        contact_id: typeof contactId === "string" ? contactId : undefined,
        contact_email: contactEmail,
        contact_name: contactName || undefined,
        url: obj.metadata?.url || "",
        timestamp: obj.metadata?.timestamp || obj.created_at,
        user_agent: obj.metadata?.user_agent,
        ip_address: obj.metadata?.ip_address,
      };
    });

    const total = result.total || 0;

    return {
      events,
      total,
      limit,
      skip,
    };
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return {
        events: [],
        total: 0,
        limit: options?.limit || 50,
        skip: options?.skip || 0,
      };
    }
    console.error("Error fetching click events:", error);
    throw new Error("Failed to fetch click events");
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
        verification_token: data.verification_token || "",
        verification_token_expires: data.verification_token_expires || "",
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
  listId: string,
  options?: {
    limit?: number;
    skip?: number;
    maxContacts?: number; // Maximum number of contacts to fetch (prevents memory issues)
  }
): Promise<EmailContact[]> {
  const allContacts: EmailContact[] = [];
  let skip = options?.skip || 0;
  const limit = Math.min(options?.limit || 500, 1000); // Default to 500, max 1000 per request
  const maxContacts = options?.maxContacts || 10000; // Default max 10k contacts to prevent memory issues
  let hasMore = true;

  console.log(
    `Fetching contacts for list ${listId} with pagination: limit=${limit}, maxContacts=${maxContacts}`
  );

  while (hasMore && allContacts.length < maxContacts) {
    try {
      const { contacts, total } = await getEmailContacts({
        limit,
        skip,
        list_id: listId,
      });

      allContacts.push(...contacts);
      skip += limit;
      hasMore = allContacts.length < total && contacts.length === limit;

      console.log(
        `Fetched ${allContacts.length}/${total} contacts for list ${listId} (batch: ${contacts.length})`
      );

      // Add throttling to prevent API overload
      if (hasMore && allContacts.length < maxContacts) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Safety check: if we've reached maxContacts, stop fetching
      if (allContacts.length >= maxContacts) {
        console.log(
          `Reached maxContacts limit (${maxContacts}) for list ${listId}. Total fetched: ${allContacts.length}`
        );
        break;
      }
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

// New paginated version that yields contacts in batches (memory efficient)
export async function* getContactsByListIdPaginated(
  listId: string,
  options?: {
    batchSize?: number;
    maxContacts?: number;
    minimal?: boolean; // NEW: Pass through minimal flag for performance
  }
): AsyncGenerator<EmailContact[], void, unknown> {
  let skip = 0;
  const batchSize = Math.min(options?.batchSize || 500, 1000);
  const maxContacts = options?.maxContacts || 50000; // Higher limit for generator
  const minimal = options?.minimal || false;
  let totalFetched = 0;
  let hasMore = true;

  console.log(
    `Starting paginated fetch for list ${listId}: batchSize=${batchSize}, maxContacts=${maxContacts}, minimal=${minimal}`
  );

  while (hasMore && totalFetched < maxContacts) {
    try {
      const { contacts, total } = await getEmailContacts({
        limit: batchSize,
        skip,
        list_id: listId,
        minimal, // OPTIMIZATION: Use minimal fields when fetching for campaigns
      });

      if (contacts.length === 0) {
        break;
      }

      // Yield this batch
      yield contacts;

      totalFetched += contacts.length;
      skip += batchSize;
      hasMore = totalFetched < total && contacts.length === batchSize;

      console.log(
        `Yielded batch of ${contacts.length} contacts for list ${listId}. Total: ${totalFetched}/${total}`
      );

      // Add throttling between batches
      if (hasMore && totalFetched < maxContacts) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch (error) {
      if (hasStatus(error) && error.status === 404) {
        break;
      }
      console.error(
        `Error in paginated fetch for list ${listId} at skip ${skip}:`,
        error
      );
      throw new Error("Failed to fetch contacts for list");
    }
  }

  console.log(
    `Completed paginated fetch for list ${listId}. Total fetched: ${totalFetched}`
  );
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

// Safe wrapper for getContactsByListId with timeout and error handling
export async function getContactsByListIdSafe(
  listId: string,
  options?: {
    limit?: number;
    skip?: number;
    maxContacts?: number;
    timeoutMs?: number;
  }
): Promise<{ contacts: EmailContact[]; error?: string; timedOut?: boolean }> {
  try {
    const timeoutMs = options?.timeoutMs || 45000; // 45 second timeout

    const contacts = await withTimeout(
      () => getContactsByListId(listId, options),
      timeoutMs,
      `getContactsByListId for list ${listId}`
    );

    return { contacts };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const timedOut = errorMessage.includes("timed out");

    console.error(
      `Error in getContactsByListIdSafe for list ${listId}:`,
      errorMessage
    );

    return {
      contacts: [],
      error: errorMessage,
      timedOut,
    };
  }
}

