import { NextRequest, NextResponse } from "next/server";
import { getUploadJobs } from "@/lib/cosmic";

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = parseInt(searchParams.get("skip") || "0");
    const status = searchParams.get("status") || undefined;

    const jobs = await getUploadJobs({
      limit: Math.min(limit, 50), // Cap at 50
      skip,
      status: status === "all" ? undefined : status,
    });

    return NextResponse.json({
      success: true,
      data: jobs,
      total: jobs.length,
      limit,
      skip,
    });
  } catch (error) {
    console.error("Error fetching upload jobs:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch upload jobs",
        data: []
      },
      { status: 500 }
    );
  }
}