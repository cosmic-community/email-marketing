import { NextRequest, NextResponse } from "next/server";
import { getMultipleListContactCounts, getEmailLists } from "@/lib/cosmic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const listIds = searchParams.get("ids");

    let ids: string[];

    if (listIds) {
      // If specific list IDs are provided, use those
      ids = listIds.split(",").filter(Boolean);
    } else {
      // Otherwise, fetch all lists and get their IDs
      const lists = await getEmailLists();
      ids = lists.map((list) => list.id);
    }

    if (ids.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    // Get real-time contact counts for each list (only active contacts)
    const counts = await getMultipleListContactCounts(ids, {
      statusFilter: "Active",
    });

    return NextResponse.json({ success: true, data: counts });
  } catch (error) {
    console.error("Error fetching list contact counts:", error);
    return NextResponse.json(
      { error: "Failed to fetch list contact counts" },
      { status: 500 }
    );
  }
}
