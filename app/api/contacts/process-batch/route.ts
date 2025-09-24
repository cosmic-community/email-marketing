import { NextRequest, NextResponse } from "next/server";
import { createEmailContact } from "@/lib/cosmic";
import { revalidatePath } from "next/cache";

interface ProcessBatchRequest {
  batchId: string;
  contacts: Array<{
    first_name: string;
    last_name?: string;
    email: string;
    status: "Active" | "Unsubscribed" | "Bounced";
    list_ids?: string[];
    tags?: string[];
    subscribe_date?: string;
    notes?: string;
  }>;
  chunkIndex: number;
  selectedListIds?: string[];
}

interface ProcessBatchResult {
  success: boolean;
  results: {
    successful: number;
    duplicates: number;
    creation_errors: number;
  };
  errors?: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse<ProcessBatchResult | { error: string }>> {
  try {
    const { batchId, contacts, chunkIndex, selectedListIds = [] }: ProcessBatchRequest = await request.json();

    if (!batchId || !contacts || !Array.isArray(contacts)) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    console.log(`Processing batch ${chunkIndex}: ${contacts.length} contacts for batch ${batchId}`);

    const results = {
      successful: 0,
      duplicates: 0,
      creation_errors: 0,
    };

    const errors: string[] = [];
    const startTime = Date.now();

    // Process contacts in this chunk with enhanced error handling
    for (const contact of contacts) {
      try {
        // Validate required fields
        if (!contact.email || !contact.first_name) {
          results.creation_errors++;
          errors.push(`Invalid contact data: missing email or first_name`);
          continue;
        }

        // Add selected list IDs to contact
        const contactData = {
          ...contact,
          list_ids: selectedListIds.length > 0 ? selectedListIds : (contact.list_ids || []),
        };

        // Create the contact
        await createEmailContact(contactData);
        results.successful++;
        
        // Log progress every 25 contacts
        if (results.successful % 25 === 0) {
          console.log(`Batch ${chunkIndex}: Processed ${results.successful}/${contacts.length} contacts`);
        }

      } catch (error) {
        results.creation_errors++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        
        // Check if it's a duplicate error
        if (errorMessage.includes("duplicate") || errorMessage.includes("already exists")) {
          results.duplicates++;
          results.creation_errors--; // Don't count duplicates as creation errors
        } else {
          errors.push(`Failed to create contact ${contact.email}: ${errorMessage}`);
        }

        // Limit error collection to prevent memory issues
        if (errors.length > 50) {
          errors.push(`... and ${contacts.length - (results.successful + results.creation_errors)} more errors`);
          break;
        }
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`Batch ${chunkIndex} completed in ${processingTime}ms: ${results.successful} successful, ${results.creation_errors} errors`);

    // Update batch job progress would go here if implemented
    // await updateBatchJobProgress(batchId, results);

    // Revalidate contacts cache for real-time UI updates
    revalidatePath("/contacts");

    const response: ProcessBatchResult = {
      success: true,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Batch processing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    return NextResponse.json(
      { error: `Failed to process batch: ${errorMessage}` },
      { status: 500 }
    );
  }
}