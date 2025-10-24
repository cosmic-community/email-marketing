import { NextRequest, NextResponse } from "next/server";
import { createMarketingCampaign, getMarketingCampaigns } from "@/lib/cosmic";
import { CreateCampaignData } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : undefined;
    const skip = searchParams.get("skip")
      ? parseInt(searchParams.get("skip")!)
      : undefined;

    const result = await getMarketingCampaigns({ limit, skip });

    return NextResponse.json({
      success: true,
      data: result.campaigns,
      total: result.total,
      limit: limit || result.total,
      skip: skip || 0,
    });
  } catch (error) {
    console.error("Campaigns fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      name,
      template_id,
      list_ids,
      contact_ids,
      target_tags,
      subject,
      content,
      send_date,
      public_sharing_enabled,
    } = await request.json();

    console.log("Creating campaign with data:", {
      name,
      template_id,
      list_ids,
      contact_ids,
      target_tags,
      public_sharing_enabled,
    });

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 }
      );
    }

    if (!subject || !content) {
      return NextResponse.json(
        { error: "Subject and content are required" },
        { status: 400 }
      );
    }

    // Validate that at least one target is provided (lists, contacts, or tags)
    const hasLists = list_ids && list_ids.length > 0;
    const hasContacts = contact_ids && contact_ids.length > 0;
    const hasTags = target_tags && target_tags.length > 0;

    if (!hasLists && !hasContacts && !hasTags) {
      return NextResponse.json(
        { error: "At least one target is required (lists, contacts, or tags)" },
        { status: 400 }
      );
    }

    // Create campaign with campaign_content (no template reference)
    const campaign = await createMarketingCampaign({
      name,
      template_id, // Only used to copy content, not stored
      list_ids,
      contact_ids,
      target_tags,
      subject,
      content,
      send_date,
      public_sharing_enabled: public_sharing_enabled ?? true, // Default to true if not specified
    });

    console.log("Campaign created successfully:", campaign.id);

    return NextResponse.json({
      success: true,
      message: "Campaign created successfully",
      data: campaign,
    });
  } catch (error: any) {
    console.error("Campaign creation error:", error);

    return NextResponse.json(
      {
        error: "Failed to create campaign",
        details: error.message || "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}