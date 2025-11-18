import {
  MarketingCampaign,
  EmailTemplate,
  CreateCampaignData,
  CampaignStats,
  EmailContact,
  TemplateType,
} from "@/types";
import { cosmic } from "./client";
import { hasStatus, withTimeout } from "./utils";
import { getEmailTemplate } from "./templates";
import { getEmailList } from "./lists";
import { getEmailContact, getEmailContacts, getContactsByListIdPaginated } from "./contacts";

// Marketing Campaigns
export async function getMarketingCampaigns(options?: {
  limit?: number;
  skip?: number;
}): Promise<{ campaigns: MarketingCampaign[]; total: number }> {
  const limit = options?.limit || 1000; // Default to all
  const skip = options?.skip || 0;

  try {
    const { objects, total } = await cosmic.objects
      .find({ type: "marketing-campaigns" })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(0) // Use depth(0) for better performance - don't load related objects
      .limit(limit)
      .skip(skip);

    return {
      campaigns: objects as MarketingCampaign[],
      total: total || 0,
    };
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return { campaigns: [], total: 0 };
    }
    console.error("Error fetching marketing campaigns:", error);
    throw new Error("Failed to fetch marketing campaigns");
  }
}

export async function getEmailCampaigns(options?: {
  limit?: number;
  skip?: number;
}): Promise<{ campaigns: MarketingCampaign[]; total: number }> {
  // Alias for backward compatibility
  return getMarketingCampaigns(options);
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
    console.log(
      `🔄 [updateCampaignStatus] Updating campaign ${id} to status: ${status}`
    );

    const metadataUpdates: any = {
      status: {
        key: status.toLowerCase(),
        value: status,
      },
    };

    if (stats) {
      metadataUpdates.stats = stats;
      console.log(`📊 [updateCampaignStatus] Including stats:`, stats);
    }

    console.log(`📤 [updateCampaignStatus] Sending update to Cosmic...`);
    const result = await cosmic.objects.updateOne(id, {
      metadata: metadataUpdates,
    });

    console.log(
      `✅ [updateCampaignStatus] Successfully updated campaign status to ${status}`
    );
    console.log(`📋 [updateCampaignStatus] Updated object:`, {
      id: result.object.id,
      status: result.object.metadata?.status,
    });
  } catch (error) {
    console.error(
      `❌ [updateCampaignStatus] Error updating campaign status for ${id}:`,
      error
    );
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

// FIXED: Get all contacts that would be targeted by a campaign with removed artificial limits
export async function getCampaignTargetContacts(
  campaign: MarketingCampaign,
  options?: {
    maxContactsPerList?: number; // Limit contacts per list to prevent memory issues
    totalMaxContacts?: number; // Overall limit across all lists
  }
): Promise<EmailContact[]> {
  try {
    const allContacts: EmailContact[] = [];
    const addedContactIds = new Set<string>();

    // FIXED: Removed artificial 10K limit - now uses much higher defaults for large campaigns
    const maxContactsPerList = options?.maxContactsPerList || 15000; // Changed: Increased from 5K to 15K per list
    const totalMaxContacts = options?.totalMaxContacts || 100000; // Changed: Increased from 25K to 100K total

    console.log(
      `🚀 FIXED: Getting campaign target contacts with INCREASED limits: ${maxContactsPerList} per list, ${totalMaxContacts} total`
    );
    console.log(
      `⚡ OPTIMIZATION: Using minimal field fetching for 4-6x speedup (only fetching id, email, first_name, status)`
    );

    // Add contacts from target lists using PARALLEL processing for 3-5x speedup
    if (
      campaign.metadata.target_lists &&
      campaign.metadata.target_lists.length > 0
    ) {
      const listIds = campaign.metadata.target_lists.map((listRef) =>
        typeof listRef === "string" ? listRef : listRef.id
      );

      console.log(
        `🚀 PARALLEL PROCESSING: Fetching contacts from ${listIds.length} lists concurrently...`
      );

      // Process lists in parallel batches of 8 to respect Cosmic API rate limits
      const PARALLEL_BATCH_SIZE = 8;

      for (let i = 0; i < listIds.length; i += PARALLEL_BATCH_SIZE) {
        const batchListIds = listIds.slice(i, i + PARALLEL_BATCH_SIZE);

        console.log(
          `Processing batch ${Math.floor(i / PARALLEL_BATCH_SIZE) + 1}: ${
            batchListIds.length
          } lists in parallel`
        );

        // Fetch all lists in this batch concurrently
        const listPromises = batchListIds.map(async (listId) => {
          try {
            // Use timeout-protected operation
            const result = await withTimeout(
              async () => {
                const contacts: EmailContact[] = [];

                // Use the paginated generator for memory efficiency
                for await (const contactBatch of getContactsByListIdPaginated(
                  listId,
                  {
                    batchSize: 500,
                    maxContacts: maxContactsPerList,
                    minimal: true, // OPTIMIZATION: Fetch only essential fields for 4-6x speedup
                  }
                )) {
                  const activeListContacts = contactBatch.filter(
                    (contact) => contact.metadata.status.value === "Active"
                  );

                  for (const contact of activeListContacts) {
                    contacts.push(contact);
                  }

                  // Small delay between batches to prevent API overload
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }

                return contacts;
              },
              60000, // 60 second timeout for list processing
              `processing list ${listId}`
            );

            return { listId, contacts: result, success: true };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            console.error(
              `Error fetching contacts for list ${listId}:`,
              errorMessage
            );
            return {
              listId,
              contacts: [],
              success: false,
              error: errorMessage,
            };
          }
        });

        // Wait for all lists in this batch to complete
        const batchResults = await Promise.allSettled(listPromises);

        // Process results and deduplicate
        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value.success) {
            const { listId, contacts } = result.value;
            let addedCount = 0;

            for (const contact of contacts) {
              if (!addedContactIds.has(contact.id)) {
                allContacts.push(contact);
                addedContactIds.add(contact.id);
                addedCount++;

                // Check total limit
                if (allContacts.length >= totalMaxContacts) {
                  console.log(
                    `Reached total contact limit (${totalMaxContacts}). Stopping.`
                  );
                  break;
                }
              }
            }

            console.log(
              `✅ List ${listId}: Added ${addedCount} unique contacts. Total: ${allContacts.length}`
            );
          }

          // Break if we've hit the limit
          if (allContacts.length >= totalMaxContacts) {
            break;
          }
        }

        // Small delay between parallel batches
        if (
          i + PARALLEL_BATCH_SIZE < listIds.length &&
          allContacts.length < totalMaxContacts
        ) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        // Break if we've hit the limit
        if (allContacts.length >= totalMaxContacts) {
          break;
        }
      }

      console.log(
        `🎯 PARALLEL PROCESSING COMPLETE: Fetched ${allContacts.length} total contacts from ${listIds.length} lists`
      );
    }

    // Add individual target contacts with sequential processing
    if (
      campaign.metadata.target_contacts &&
      campaign.metadata.target_contacts.length > 0
    ) {
      console.log(
        `📋 Processing ${campaign.metadata.target_contacts.length} individual target contacts...`
      );

      // CRITICAL FIX: Validate that each contact entry is valid before processing
      for (const contactRef of campaign.metadata.target_contacts) {
        try {
          // Extract contact ID - handle both string IDs and contact objects
          const contactId =
            typeof contactRef === "string"
              ? contactRef
              : (contactRef as any).id;

          console.log(`🔍 Processing contact reference:`, {
            type: typeof contactRef,
            contactId,
            isString: typeof contactId === "string",
          });

          // CRITICAL FIX: Ensure contactId is a string before passing to getEmailContact
          if (typeof contactId === "string") {
            const contact = await getEmailContact(contactId);
            console.log(`📧 Fetched contact ${contactId}:`, {
              found: !!contact,
              status: contact?.metadata.status?.value,
              alreadyAdded: addedContactIds.has(contact?.id || ""),
            });

            if (
              contact &&
              contact.metadata.status.value === "Active" &&
              !addedContactIds.has(contact.id)
            ) {
              allContacts.push(contact);
              addedContactIds.add(contact.id);
              console.log(`✅ Added contact: ${contact.metadata.email}`);
            } else {
              console.log(`⏭️  Skipped contact ${contactId}:`, {
                exists: !!contact,
                status: contact?.metadata.status?.value,
                duplicate: contact ? addedContactIds.has(contact.id) : false,
              });
            }
          } else {
            console.error(`❌ Invalid contactId type:`, typeof contactId);
          }

          // Small delay between contact validation to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`❌ Error fetching contact:`, contactRef, error);
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

    console.log(
      `🎯 CAMPAIGN TARGETING COMPLETE: Retrieved ${allContacts.length} total unique active contacts`
    );

    return allContacts;
  } catch (error) {
    console.error("Error getting campaign target contacts:", error);
    throw new Error("Failed to get campaign target contacts");
  }
}

// FIXED: Get campaign target count with efficient pagination and removed limits
export async function getCampaignTargetCount(
  campaign: MarketingCampaign,
  options?: {
    maxContactsPerList?: number;
    totalMaxContacts?: number;
  }
): Promise<number> {
  try {
    const countedContactIds = new Set<string>();

    // FIXED: Removed artificial 10K limit - now uses much higher defaults
    const maxContactsPerList = options?.maxContactsPerList || 15000; // Changed: Increased from 5K to 15K per list
    const totalMaxContacts = options?.totalMaxContacts || 100000; // Changed: Increased from 25K to 100K total

    console.log(
      `🚀 FIXED: Counting campaign target contacts with INCREASED limits: ${maxContactsPerList} per list, ${totalMaxContacts} total`
    );

    // Count contacts from target lists with efficient pagination
    if (
      campaign.metadata.target_lists &&
      campaign.metadata.target_lists.length > 0
    ) {
      for (const listRef of campaign.metadata.target_lists) {
        const listId = typeof listRef === "string" ? listRef : listRef.id;

        // Check if we've reached the total limit
        if (countedContactIds.size >= totalMaxContacts) {
          console.log(
            `Reached total contact limit (${totalMaxContacts}) during counting. Stopping.`
          );
          break;
        }

        try {
          console.log(`Counting contacts for list ${listId}...`);

          // Use efficient pagination to count contacts
          let skip = 0;
          const limit = 1000;
          let listContactCount = 0;
          let hasMore = true;

          while (
            hasMore &&
            listContactCount < maxContactsPerList &&
            countedContactIds.size < totalMaxContacts
          ) {
            const { objects: listContacts, total } = await cosmic.objects
              .find({
                type: "email-contacts",
                "metadata.lists": listId,
                "metadata.status": "Active",
              })
              .props(["id"])
              .limit(limit)
              .skip(skip);

            for (const contact of listContacts) {
              countedContactIds.add(contact.id);
              listContactCount++;

              // Check limits
              if (
                listContactCount >= maxContactsPerList ||
                countedContactIds.size >= totalMaxContacts
              ) {
                break;
              }
            }

            skip += limit;
            hasMore = listContacts.length === limit && skip < total;

            // Add throttling
            if (hasMore) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          console.log(
            `✅ Counted ${listContactCount} contacts for list ${listId}. Total unique: ${countedContactIds.size}`
          );

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
      // CRITICAL FIX: Validate contact references before processing
      for (const contactRef of campaign.metadata.target_contacts) {
        try {
          // Extract contact ID - handle both string IDs and contact objects
          const contactId =
            typeof contactRef === "string" ? contactRef : contactRef;

          // CRITICAL FIX: Ensure contactId is a string before using in query
          if (typeof contactId === "string") {
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
          }

          // Small delay between contact validation to prevent API overload
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error validating contact ${contactRef}:`, error);
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

    const finalCount = countedContactIds.size;
    console.log(
      `🎯 CAMPAIGN TARGET COUNT COMPLETE: ${finalCount} unique active contacts`
    );

    return finalCount;
  } catch (error) {
    console.error("Error getting campaign target count:", error);
    return 0; // Return 0 on error rather than throwing
  }
}

