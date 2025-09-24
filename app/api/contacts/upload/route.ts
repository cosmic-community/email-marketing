import { NextRequest, NextResponse } from "next/server";
import { createEmailContact, getEmailContacts } from "@/lib/cosmic";
import { EmailContact } from "@/types";
import { revalidatePath, revalidateTag } from "next/cache";

interface ContactData {
  first_name: string;
  last_name?: string;
  email: string;
  status: "Active" | "Unsubscribed" | "Bounced";
  list_ids?: string[];
  tags?: string[];
  subscribe_date?: string;
  notes?: string;
}

interface UploadResult {
  success: boolean;
  message: string;
  results: {
    total_processed: number;
    successful: number;
    duplicates: number;
    validation_errors: number;
    creation_errors: number;
  };
  contacts: EmailContact[];
  duplicates?: string[];
  validation_errors?: string[];
  creation_errors?: string[];
  is_batch_job?: boolean;
  batch_id?: string;
}

// Enhanced column mapping function for flexible CSV parsing
function createColumnMap(headers: string[]): Record<string, number> {
  const columnMap: Record<string, number> = {};

  // Normalize headers for comparison (lowercase, remove spaces/underscores)
  const normalizedHeaders = headers.map((h) =>
    h.toLowerCase().replace(/[_\s-]/g, "")
  );

  // Define possible column name variations for each field
  const fieldMappings = {
    first_name: ["firstname", "fname", "name", "givenname", "forename"],
    last_name: ["lastname", "lname", "surname", "familyname"],
    email: ["email", "emailaddress", "mail", "e-mail"],
    status: ["status", "state", "subscription", "active"],
    tags: ["tags", "categories", "groups", "interests", "labels"],
    notes: ["notes", "comments", "description", "memo"],
    subscribe_date: [
      "subscribedate",
      "joindate",
      "signupdate",
      "createddate",
      "optintime",
      "confirmtime",
    ],
  };

  // Find matching columns for each field
  Object.entries(fieldMappings).forEach(([field, variations]) => {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const normalized = normalizedHeaders[i];
      if (
        (normalized && variations.includes(normalized)) ||
        (normalized && normalized.includes(field.replace("_", "")))
      ) {
        columnMap[field] = i;
        break;
      }
    }
  });

  return columnMap;
}

// Enhanced CSV parsing with better quote handling
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = "";
      i++;
    } else {
      current += char;
      i++;
    }
  }

  // Add the last field
  result.push(current.trim());

  return result;
}

// Optimized batch processing with strict timeout control
async function processContactsBatch(
  contacts: ContactData[],
  batchSize: number = 50, // Reduced batch size for more reliable processing
  maxProcessingTime: number = 25000 // Reduced to 25 seconds with buffer for response
): Promise<{
  created: EmailContact[];
  creationErrors: string[];
  totalProcessed: number;
  shouldContinue: boolean;
  timeRemaining: number;
}> {
  const created: EmailContact[] = [];
  const creationErrors: string[] = [];
  const startTime = Date.now();
  let totalProcessed = 0;

  console.log(`Starting batch processing for ${contacts.length} contacts with batch size ${batchSize}`);

  // Process contacts in smaller batches with strict timeout monitoring
  for (let i = 0; i < contacts.length; i += batchSize) {
    const elapsedTime = Date.now() - startTime;
    
    // Much more conservative timeout check - stop if we're getting close to limit
    if (elapsedTime > maxProcessingTime * 0.8) {
      console.log(`Approaching timeout threshold. Processed ${totalProcessed} contacts. Time elapsed: ${elapsedTime}ms`);
      break;
    }

    const batch = contacts.slice(i, i + batchSize);
    
    // Process current batch sequentially to avoid overwhelming the API
    for (const contactData of batch) {
      try {
        // Check timeout before each contact
        const currentElapsed = Date.now() - startTime;
        if (currentElapsed > maxProcessingTime * 0.85) {
          console.log(`Individual contact timeout check. Breaking at ${totalProcessed} processed.`);
          break;
        }

        const newContact = await createEmailContact(contactData);
        created.push(newContact);
        totalProcessed++;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        creationErrors.push(`Failed to create contact ${contactData.email}: ${errorMessage}`);
        totalProcessed++;
      }

      // Small delay between individual contacts to prevent rate limiting
      if (totalProcessed % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Check if we should continue after each batch
    const batchElapsed = Date.now() - startTime;
    if (batchElapsed > maxProcessingTime * 0.85) {
      console.log(`Batch timeout reached. Breaking at ${totalProcessed} contacts.`);
      break;
    }

    // Larger delay between batches
    if (i + batchSize < contacts.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Progress logging
    if (totalProcessed % 100 === 0) {
      console.log(`Progress: ${totalProcessed}/${contacts.length} contacts processed`);
    }
  }

  const timeElapsed = Date.now() - startTime;
  const timeRemaining = maxProcessingTime - timeElapsed;
  const shouldContinue = totalProcessed < contacts.length && timeRemaining > 5000; // 5 seconds buffer

  console.log(`Batch processing completed: ${totalProcessed}/${contacts.length} processed in ${timeElapsed}ms`);

  return {
    created,
    creationErrors,
    totalProcessed,
    shouldContinue,
    timeRemaining
  };
}

export async function POST(
  request: NextRequest
): Promise<
  NextResponse<
    UploadResult | { error: string; errors?: string[]; total_errors?: number }
  >
> {
  try {
    // Set a timeout for the entire request
    const requestTimeout = setTimeout(() => {
      console.error('Request timeout after 30 seconds');
    }, 30000);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const listIdsJson = formData.get("list_ids") as string | null;

    // Clear the timeout since we got the form data
    clearTimeout(requestTimeout);

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Early validation checks
    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty. Please check your CSV file and try again." },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Please upload a CSV file" },
        { status: 400 }
      );
    }

    // More reasonable file size limit
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size must be less than 50MB" },
        { status: 400 }
      );
    }

    // Parse selected list IDs
    let selectedListIds: string[] = [];
    if (listIdsJson) {
      try {
        selectedListIds = JSON.parse(listIdsJson);
        if (!Array.isArray(selectedListIds)) {
          selectedListIds = [];
        }
      } catch (error) {
        console.error('Error parsing list IDs:', error);
        selectedListIds = [];
      }
    }

    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to read CSV file. Please ensure the file is not corrupted." },
        { status: 400 }
      );
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "CSV file appears to be empty or contains no readable content." },
        { status: 400 }
      );
    }

    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV must contain at least a header row and one data row" },
        { status: 400 }
      );
    }

    // Parse CSV header with better error handling
    const headerLine = lines[0];
    if (!headerLine) {
      return NextResponse.json(
        { error: "CSV header row is missing or empty" },
        { status: 400 }
      );
    }

    let headers: string[];
    try {
      headers = parseCSVLine(headerLine).map((h) =>
        h.replace(/^["']|["']$/g, "").trim()
      );
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to parse CSV header. Please check the file format." },
        { status: 400 }
      );
    }

    // Create flexible column mapping
    const columnMap = createColumnMap(headers);

    // Check if we found the required columns
    if (columnMap.email === undefined) {
      return NextResponse.json(
        {
          error:
            "Email column not found. Please ensure your CSV has an email column (variations: email, emailaddress, mail, e-mail)",
        },
        { status: 400 }
      );
    }

    if (columnMap.first_name === undefined) {
      return NextResponse.json(
        {
          error:
            "First name column not found. Please ensure your CSV has a first name column (variations: first_name, firstname, fname, name)",
        },
        { status: 400 }
      );
    }

    // Optimized duplicate checking with timeout
    let existingEmails = new Set<string>();
    try {
      console.log("Fetching existing contacts for duplicate checking...");
      
      // Limit the duplicate check for very large databases
      const duplicateCheckLimit = 10000; // Only check against 10k most recent contacts
      const result = await getEmailContacts({ limit: duplicateCheckLimit, skip: 0 });
      
      if (result.contacts && result.contacts.length > 0) {
        existingEmails = new Set(
          result.contacts
            .map((c) => c.metadata?.email)
            .filter(
              (email): email is string =>
                typeof email === "string" && email.length > 0
            )
            .map((email) => email.toLowerCase())
        );
      }
      
      console.log(`Loaded ${existingEmails.size} existing email addresses for duplicate checking`);
    } catch (error) {
      console.error("Error fetching existing contacts:", error);
      // Continue without duplicate checking if we can't fetch existing contacts
    }

    console.log(`Processing ${lines.length - 1} rows from CSV...`);
    
    const contacts: ContactData[] = [];
    const errors: string[] = [];
    const duplicates: string[] = [];

    // Process each data row with validation - limit processing to prevent hanging
    const maxRowsToProcess = Math.min(lines.length - 1, 5000); // Limit to 5000 rows max
    
    for (let i = 1; i <= maxRowsToProcess; i++) {
      const currentLine = lines[i];
      if (!currentLine || currentLine.trim() === "") {
        continue; // Skip empty lines
      }

      // Stop early if too many errors
      if (errors.length > 100) {
        console.log("Stopping validation due to too many errors");
        break;
      }

      let row: string[];
      try {
        row = parseCSVLine(currentLine);
      } catch (parseError) {
        errors.push(`Row ${i + 1}: Failed to parse CSV line`);
        continue;
      }

      const contact: Partial<ContactData> = {};

      // Extract data using column mapping with better error handling
      try {
        // Required fields
        const emailValue =
          row[columnMap.email]?.replace(/^["']|["']$/g, "").trim() || "";
        const firstNameValue =
          row[columnMap.first_name]?.replace(/^["']|["']$/g, "").trim() || "";

        contact.email = emailValue.toLowerCase();
        contact.first_name = firstNameValue;

        // Optional fields with null checks
        if (
          columnMap.last_name !== undefined &&
          row[columnMap.last_name] !== undefined
        ) {
          contact.last_name =
            row[columnMap.last_name]?.replace(/^["']|["']$/g, "").trim() || "";
        }

        if (
          columnMap.status !== undefined &&
          row[columnMap.status] !== undefined
        ) {
          const statusValue =
            row[columnMap.status]?.replace(/^["']|["']$/g, "").trim() || "";
          const normalizedStatus = statusValue.toLowerCase();
          if (
            ["active", "unsubscribed", "bounced"].includes(normalizedStatus)
          ) {
            contact.status = (normalizedStatus.charAt(0).toUpperCase() +
              normalizedStatus.slice(1)) as
              | "Active"
              | "Unsubscribed"
              | "Bounced";
          } else {
            contact.status = "Active";
          }
        } else {
          contact.status = "Active";
        }

        if (columnMap.tags !== undefined && row[columnMap.tags] !== undefined) {
          const tagsValue =
            row[columnMap.tags]?.replace(/^["']|["']$/g, "").trim() || "";
          if (tagsValue) {
            contact.tags = tagsValue
              .split(/[;,|]/)
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0);
          } else {
            contact.tags = [];
          }
        } else {
          contact.tags = [];
        }

        if (
          columnMap.notes !== undefined &&
          row[columnMap.notes] !== undefined
        ) {
          contact.notes =
            row[columnMap.notes]?.replace(/^["']|["']$/g, "").trim() || "";
        }

        if (
          columnMap.subscribe_date !== undefined &&
          row[columnMap.subscribe_date] !== undefined
        ) {
          const dateValue =
            row[columnMap.subscribe_date]?.replace(/^["']|["']$/g, "").trim() ||
            "";
          if (dateValue) {
            const parsedDate = new Date(dateValue);
            if (!isNaN(parsedDate.getTime())) {
              contact.subscribe_date = parsedDate.toISOString().split("T")[0];
            } else {
              contact.subscribe_date = new Date().toISOString().split("T")[0];
            }
          } else {
            contact.subscribe_date = new Date().toISOString().split("T")[0];
          }
        } else {
          contact.subscribe_date = new Date().toISOString().split("T")[0];
        }

        // Add selected list IDs to the contact
        contact.list_ids = selectedListIds;
      } catch (extractError) {
        errors.push(`Row ${i + 1}: Error extracting data from CSV row`);
        continue;
      }

      // Validate required fields
      if (!contact.first_name || contact.first_name.trim() === "") {
        errors.push(`Row ${i + 1}: First name is required`);
        continue;
      }

      if (!contact.email || contact.email.trim() === "") {
        errors.push(`Row ${i + 1}: Email is required`);
        continue;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contact.email)) {
        errors.push(`Row ${i + 1}: Invalid email format: ${contact.email}`);
        continue;
      }

      // Check for duplicates
      if (
        contact.email &&
        typeof contact.email === "string" &&
        existingEmails.has(contact.email)
      ) {
        duplicates.push(contact.email);
        continue;
      }

      // Create valid contact with all required fields
      const validContact: ContactData = {
        first_name: contact.first_name,
        last_name: contact.last_name || "",
        email: contact.email,
        status: contact.status || "Active",
        list_ids: contact.list_ids || [],
        tags: contact.tags || [],
        subscribe_date:
          contact.subscribe_date || new Date().toISOString().split("T")[0],
        notes: contact.notes || "",
      };

      contacts.push(validContact);

      // Add to existing emails set to prevent duplicates within the same file
      if (validContact.email) {
        existingEmails.add(validContact.email);
      }
    }

    // If there are too many errors, abort
    if (errors.length > 100) {
      return NextResponse.json(
        {
          error:
            "Too many validation errors in the CSV file. Please check your data format.",
          errors: errors.slice(0, 20),
          total_errors: errors.length,
        },
        { status: 400 }
      );
    }

    // If no valid contacts found, return early
    if (contacts.length === 0) {
      return NextResponse.json(
        {
          error: "No valid contacts found in the CSV file after validation.",
          errors: errors.length > 0 ? errors.slice(0, 10) : ["No valid contacts found"],
          total_errors: errors.length,
        },
        { status: 400 }
      );
    }

    console.log(`Validated ${contacts.length} contacts, starting batch processing...`);

    // Process contacts with conservative batch processing
    const batchResult = await processContactsBatch(contacts, 50, 25000); // 50 per batch, 25 second timeout
    
    console.log(`Batch processing completed: ${batchResult.totalProcessed}/${contacts.length} processed`);

    // Enhanced cache invalidation after successful upload
    if (batchResult.created.length > 0) {
      try {
        revalidatePath("/contacts");
        revalidatePath("/contacts/page");
        revalidatePath("/(dashboard)/contacts");
        revalidateTag("contacts");
        revalidateTag("email-contacts");
        revalidatePath("/");
      } catch (revalidateError) {
        console.error("Error during cache revalidation:", revalidateError);
        // Don't fail the whole request because of revalidation errors
      }
    }

    // Return results with batch information
    const result: UploadResult = {
      success: true,
      message: `Successfully imported ${batchResult.created.length} contacts${
        selectedListIds.length > 0 
          ? ` and added them to ${selectedListIds.length} selected list${selectedListIds.length !== 1 ? 's' : ''}` 
          : ''
      }${
        batchResult.totalProcessed < contacts.length 
          ? ` (${contacts.length - batchResult.totalProcessed} remaining due to processing time limits)`
          : ''
      }`,
      results: {
        total_processed: batchResult.totalProcessed,
        successful: batchResult.created.length,
        duplicates: duplicates.length,
        validation_errors: errors.length,
        creation_errors: batchResult.creationErrors.length,
      },
      contacts: batchResult.created,
      duplicates: duplicates.length > 0 ? duplicates.slice(0, 50) : undefined, // Limit duplicates list
      validation_errors: errors.length > 0 ? errors.slice(0, 20) : undefined, // Limit error list
      creation_errors: batchResult.creationErrors.length > 0 ? batchResult.creationErrors.slice(0, 20) : undefined,
      is_batch_job: batchResult.totalProcessed < contacts.length,
      batch_id: batchResult.shouldContinue ? `batch_${Date.now()}` : undefined,
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("CSV upload error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: `Failed to process CSV file: ${errorMessage}` },
      { status: 500 }
    );
  }
}