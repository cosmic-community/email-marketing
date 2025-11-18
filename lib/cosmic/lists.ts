import { EmailList, CreateListData } from "@/types";
import { cosmic } from "./client";
import { hasStatus } from "./utils";

// Email Lists
export async function getEmailLists(): Promise<EmailList[]> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: "email-lists" })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(0); // Use depth(0) for better performance

    // Return lists with contact counts from metadata
    // Contact counts are updated when contacts are added/removed from lists
    return objects as EmailList[];
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
      .depth(0); // Use depth(0) for better performance

    if (!object) return null;

    // Return list with contact count from metadata
    // Contact count is updated when contacts are added/removed from lists
    return object as EmailList;
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
  listId: string,
  options?: {
    statusFilter?: string; // Optional status filter (e.g., "Active")
    maxCount?: number; // Optional maximum count to prevent long queries
  }
): Promise<number> {
  try {
    // Build query with optional status filter
    const query: any = {
      type: "email-contacts",
      "metadata.lists": listId,
    };

    if (options?.statusFilter) {
      query["metadata.status"] = options.statusFilter;
    }

    // Use minimal query with limit 1 and minimal props to get just the total count
    const result = await cosmic.objects
      .find(query)
      .props(["id"]) // Minimal props - just need one field
      .limit(1); // Minimal limit since we only care about the total

    // Apply max count limit if specified
    const actualCount = result.total || 0;
    const maxCount = options?.maxCount || Number.MAX_SAFE_INTEGER;

    return Math.min(actualCount, maxCount);
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

// New function: Get contact count for multiple lists efficiently
export async function getMultipleListContactCounts(
  listIds: string[],
  options?: {
    statusFilter?: string;
    maxCountPerList?: number;
  }
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // Process lists sequentially to avoid overwhelming the API
  for (const listId of listIds) {
    try {
      counts[listId] = await getListContactCountEfficient(listId, {
        statusFilter: options?.statusFilter,
        maxCount: options?.maxCountPerList,
      });

      // Add throttling between requests
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error getting count for list ${listId}:`, error);
      counts[listId] = 0;
    }
  }

  return counts;
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

