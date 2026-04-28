// app/api/campaigns/[id]/clicks/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getClickEventsByCampaign, getMarketingCampaign } from "@/lib/cosmic";

export const dynamic = "force-dynamic";

// Helper function to escape CSV values
function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  // If value contains comma, newline, or quote, wrap in quotes and escape quotes
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

// Helper function to format date for CSV
function formatDateForCsv(dateString?: string): string {
  if (!dateString) return "";
  try {
    return new Date(dateString).toISOString();
  } catch {
    return dateString;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get campaign info for filename
    let campaignName = "campaign";
    try {
      const campaign = await getMarketingCampaign(id);
      if (campaign?.metadata?.name) {
        campaignName = campaign.metadata.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }
    } catch (error) {
      console.error("Error fetching campaign for export:", error);
      // Continue with default name
    }

    // Initialize variables for batch processing
    const batchSize = 100;
    let allEvents: any[] = [];
    let skip = 0;
    let hasMoreData = true;

    // Fetch click events in batches to handle large datasets efficiently
    while (hasMoreData) {
      try {
        const result = await getClickEventsByCampaign(id, {
          limit: batchSize,
          skip: skip,
        });

        if (result.events.length === 0) {
          hasMoreData = false;
        } else {
          allEvents = [...allEvents, ...result.events];
          skip += batchSize;

          // If we got fewer events than batch size, we've reached the end
          if (result.events.length < batchSize) {
            hasMoreData = false;
          }
        }

        // Safety check to prevent infinite loops
        if (allEvents.length > 50000) {
          console.warn("Export limit reached: 50,000 click events");
          break;
        }
      } catch (error) {
        console.error("Error fetching batch:", error);
        hasMoreData = false;
      }
    }

    if (allEvents.length === 0) {
      return NextResponse.json(
        { error: "No click events found for this campaign" },
        { status: 404 }
      );
    }

    // Define CSV headers
    const headers = [
      "Contact Name",
      "Contact Email",
      "URL",
      "Timestamp",
      "User Agent",
      "IP Address",
    ];

    // Build CSV content
    let csvContent = headers.map(escapeCsvValue).join(",") + "\n";

    // Process events in chunks to avoid memory issues
    const chunkSize = 1000;
    for (let i = 0; i < allEvents.length; i += chunkSize) {
      const chunk = allEvents.slice(i, i + chunkSize);

      for (const event of chunk) {
        const row = [
          escapeCsvValue(event.contact_name || ""),
          escapeCsvValue(event.contact_email || ""),
          escapeCsvValue(event.url || ""),
          escapeCsvValue(formatDateForCsv(event.timestamp)),
          escapeCsvValue(event.user_agent || ""),
          escapeCsvValue(event.ip_address || ""),
        ];

        csvContent += row.join(",") + "\n";
      }
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `${campaignName}-clicks-${timestamp}.csv`;

    // Create response with appropriate headers
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": Buffer.byteLength(csvContent, "utf8").toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Error exporting click events:", error);
    return NextResponse.json(
      {
        error: "Failed to export click events",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}