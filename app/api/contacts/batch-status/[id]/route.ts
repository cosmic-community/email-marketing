// app/api/contacts/batch-status/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cosmic } from "@/lib/cosmic";

interface BatchStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  total_contacts: number;
  processed: number;
  successful: number;
  errors: number;
  progress_percentage: number;
  started_at: string;
  completed_at?: string;
  error_message?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<BatchStatus | { error: string }>> {
  try {
    // IMPORTANT: In Next.js 15+, params are now Promises and MUST be awaited
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Batch ID is required" }, { status: 400 });
    }

    console.log(`Fetching batch status for ID: ${id}`);

    // Fetch batch job from Cosmic CMS
    const { object: batchJob } = await cosmic.objects
      .findOne({ id })
      .props(["id", "title", "metadata"])
      .depth(0);

    if (!batchJob) {
      return NextResponse.json({ error: "Batch job not found" }, { status: 404 });
    }

    const status: BatchStatus = {
      id: batchJob.id,
      status: batchJob.metadata.status?.value || "pending",
      total_contacts: batchJob.metadata.total_records || 0,
      processed: batchJob.metadata.processed_records || 0,
      successful: batchJob.metadata.successful_records || 0,
      errors: batchJob.metadata.failed_records || 0,
      progress_percentage: batchJob.metadata.progress_percentage || 0,
      started_at: batchJob.metadata.started_at || "",
      completed_at: batchJob.metadata.completed_at,
      error_message: batchJob.metadata.error_message,
    };

    return NextResponse.json(status);

  } catch (error) {
    console.error(`Error fetching batch status for ${await params.then(p => p.id)}:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    return NextResponse.json(
      { error: `Failed to fetch batch status: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    // IMPORTANT: In Next.js 15+, params are now Promises and MUST be awaited
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: "Batch ID is required" }, { status: 400 });
    }

    const updates = await request.json();

    console.log(`Updating batch status for ID: ${id}`, updates);

    // Update batch job in Cosmic CMS - ONLY include changed fields
    const metadataUpdates: any = {};

    if (updates.status !== undefined) {
      metadataUpdates.status = {
        key: updates.status.toLowerCase(),
        value: updates.status.charAt(0).toUpperCase() + updates.status.slice(1),
      };
    }

    if (updates.processed !== undefined) metadataUpdates.processed_records = updates.processed;
    if (updates.successful !== undefined) metadataUpdates.successful_records = updates.successful;
    if (updates.errors !== undefined) metadataUpdates.failed_records = updates.errors;
    if (updates.progress_percentage !== undefined) metadataUpdates.progress_percentage = updates.progress_percentage;
    if (updates.completed_at !== undefined) metadataUpdates.completed_at = updates.completed_at;
    if (updates.error_message !== undefined) metadataUpdates.error_message = updates.error_message;

    await cosmic.objects.updateOne(id, {
      metadata: metadataUpdates,
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(`Error updating batch status for ${await params.then(p => p.id)}:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    return NextResponse.json(
      { error: `Failed to update batch status: ${errorMessage}` },
      { status: 500 }
    );
  }
}