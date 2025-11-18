import { UploadJob, CreateUploadJobData } from "@/types";
import { cosmic } from "./client";
import { hasStatus } from "./utils";

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

