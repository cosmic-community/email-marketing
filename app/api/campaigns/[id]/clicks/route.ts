import { NextRequest, NextResponse } from "next/server";
import { getClickEventsByCampaign } from "@/lib/cosmic";

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

    const result = await getClickEventsByCampaign(id, {
      limit,
      skip,
    });

    return NextResponse.json({
      success: true,
      data: {
        events: result.events,
        pagination: {
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching click events:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch click events" },
      { status: 500 }
    );
  }
}
