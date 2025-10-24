import { NextRequest, NextResponse } from "next/server";
import { getUnsubscribedContactsByCampaign } from "@/lib/cosmic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    const result = await getUnsubscribedContactsByCampaign(id, {
      limit,
      skip,
    });

    return NextResponse.json({
      success: true,
      data: {
        contacts: result.contacts,
        pagination: {
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching unsubscribes:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch unsubscribes" },
      { status: 500 }
    );
  }
}
