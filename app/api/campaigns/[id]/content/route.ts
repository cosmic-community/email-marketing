// app/api/campaigns/[id]/content/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getEmailCampaign } from "@/lib/cosmic";
import { cosmic } from "@/lib/cosmic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { subject, content, preheader_text } = await request.json();

    // Validate required fields
    if (!subject || !content) {
      return NextResponse.json(
        { error: "Subject and content are required" },
        { status: 400 }
      );
    }

    // Check if campaign exists
    const campaign = await getEmailCampaign(id);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Check if campaign can be edited (not sent or sending)
    const status = campaign.metadata.status?.value || "Draft";
    if (status === "Sent" || status === "Sending") {
      return NextResponse.json(
        { error: "Cannot edit content of sent or sending campaign" },
        { status: 400 }
      );
    }

    // Update campaign content
    const updateData = {
      metadata: {
        campaign_content: {
          subject: subject.trim(),
          content: content.trim(),
          preheader_text: preheader_text?.trim() || "",
          template_type: campaign.metadata.campaign_content?.template_type || {
            key: "custom",
            value: "Custom",
          },
          original_template_id:
            campaign.metadata.campaign_content?.original_template_id,
        },
        preheader_text: preheader_text?.trim() || "",
      },
    };

    await cosmic.objects.updateOne(id, updateData);

    // Fetch updated campaign to return
    const updatedCampaign = await getEmailCampaign(id);

    return NextResponse.json({
      success: true,
      message: "Campaign content updated successfully",
      campaign: updatedCampaign,
    });
  } catch (error) {
    console.error("Campaign content update error:", error);
    return NextResponse.json(
      { error: "Failed to update campaign content" },
      { status: 500 }
    );
  }
}
