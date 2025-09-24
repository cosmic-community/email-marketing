import { cosmic } from "@/lib/cosmic";

export interface BatchJobData {
  id?: string;
  job_type: "CSV Upload" | "Bulk Import" | "Data Migration";
  status: "Pending" | "Processing" | "Completed" | "Failed" | "Cancelled";
  total_records: number;
  processed_records: number;
  successful_records: number;
  failed_records: number;
  progress_percentage: number;
  started_at: string;
  completed_at?: string;
  error_message?: string;
  job_data?: any;
}

export async function createBatchJob(data: Omit<BatchJobData, 'id'>): Promise<string> {
  try {
    const { object } = await cosmic.objects.insertOne({
      title: `${data.job_type} - ${new Date().toLocaleString()}`,
      type: "batch-jobs",
      metadata: {
        job_type: {
          key: data.job_type.toLowerCase().replace(" ", "_"),
          value: data.job_type,
        },
        status: {
          key: data.status.toLowerCase(),
          value: data.status,
        },
        total_records: data.total_records,
        processed_records: data.processed_records,
        successful_records: data.successful_records,
        failed_records: data.failed_records,
        progress_percentage: data.progress_percentage,
        started_at: data.started_at,
        completed_at: data.completed_at,
        error_message: data.error_message || "",
        job_data: data.job_data || {},
      },
    });

    console.log(`Created batch job: ${object.id}`);
    return object.id;
  } catch (error) {
    console.error("Error creating batch job:", error);
    throw new Error("Failed to create batch job");
  }
}

export async function updateBatchJob(
  id: string, 
  updates: Partial<Omit<BatchJobData, 'id'>>
): Promise<void> {
  try {
    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {};

    if (updates.status !== undefined) {
      metadataUpdates.status = {
        key: updates.status.toLowerCase(),
        value: updates.status,
      };
    }

    if (updates.processed_records !== undefined) metadataUpdates.processed_records = updates.processed_records;
    if (updates.successful_records !== undefined) metadataUpdates.successful_records = updates.successful_records;
    if (updates.failed_records !== undefined) metadataUpdates.failed_records = updates.failed_records;
    if (updates.progress_percentage !== undefined) metadataUpdates.progress_percentage = updates.progress_percentage;
    if (updates.completed_at !== undefined) metadataUpdates.completed_at = updates.completed_at;
    if (updates.error_message !== undefined) metadataUpdates.error_message = updates.error_message;
    if (updates.job_data !== undefined) metadataUpdates.job_data = updates.job_data;

    await cosmic.objects.updateOne(id, {
      metadata: metadataUpdates,
    });

    console.log(`Updated batch job: ${id}`);
  } catch (error) {
    console.error(`Error updating batch job ${id}:`, error);
    throw new Error("Failed to update batch job");
  }
}

export async function getBatchJob(id: string): Promise<BatchJobData | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(["id", "title", "metadata"])
      .depth(0);

    if (!object) return null;

    return {
      id: object.id,
      job_type: object.metadata.job_type?.value || "CSV Upload",
      status: object.metadata.status?.value || "Pending",
      total_records: object.metadata.total_records || 0,
      processed_records: object.metadata.processed_records || 0,
      successful_records: object.metadata.successful_records || 0,
      failed_records: object.metadata.failed_records || 0,
      progress_percentage: object.metadata.progress_percentage || 0,
      started_at: object.metadata.started_at || "",
      completed_at: object.metadata.completed_at,
      error_message: object.metadata.error_message,
      job_data: object.metadata.job_data,
    };
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error(`Error fetching batch job ${id}:`, error);
    throw new Error("Failed to fetch batch job");
  }
}

export async function getAllBatchJobs(limit = 50): Promise<BatchJobData[]> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: "batch-jobs" })
      .props(["id", "title", "metadata", "created_at"])
      .limit(limit);

    return objects.map((object: any) => ({
      id: object.id,
      job_type: object.metadata.job_type?.value || "CSV Upload",
      status: object.metadata.status?.value || "Pending",
      total_records: object.metadata.total_records || 0,
      processed_records: object.metadata.processed_records || 0,
      successful_records: object.metadata.successful_records || 0,
      failed_records: object.metadata.failed_records || 0,
      progress_percentage: object.metadata.progress_percentage || 0,
      started_at: object.metadata.started_at || object.created_at,
      completed_at: object.metadata.completed_at,
      error_message: object.metadata.error_message,
      job_data: object.metadata.job_data,
    }));
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return [];
    }
    console.error("Error fetching batch jobs:", error);
    throw new Error("Failed to fetch batch jobs");
  }
}

// Helper function to check if an error has a status property
function hasStatus(error: any): error is { status: number } {
  return typeof error === "object" && error !== null && "status" in error;
}

// Utility functions for batch processing
export class BatchProcessor {
  static chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static calculateProgress(processed: number, total: number): number {
    return Math.round((processed / total) * 100);
  }

  static estimateTimeRemaining(processed: number, total: number, startTime: number): string {
    if (processed === 0) return "Calculating...";
    
    const elapsed = Date.now() - startTime;
    const rate = processed / elapsed; // items per ms
    const remaining = total - processed;
    const estimatedMs = remaining / rate;
    
    const seconds = Math.ceil(estimatedMs / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    return `${Math.ceil(seconds / 3600)}h`;
  }
}