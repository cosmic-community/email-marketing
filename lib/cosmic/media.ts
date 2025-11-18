import { MediaItem } from "@/types";
import { cosmic } from "./client";
import { hasStatus } from "./utils";

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

