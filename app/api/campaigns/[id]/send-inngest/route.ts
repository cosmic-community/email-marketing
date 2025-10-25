import { NextRequest, NextResponse } from "next/server";
import { getMarketingCampaign, updateCampaignStatus } from "@/lib/cosmic";
import { inngest } from "@/lib/inngest";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;

    console.log(
      `🚀 [TRIGGER] Initiating campaign send via Inngest: ${campaignId}`
    );

    // Get the campaign
    const campaign = await getMarketingCampaign(campaignId);

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Check if campaign is in the right status
    const currentStatus = campaign.metadata.status?.value;
    if (currentStatus !== "Draft" && currentStatus !== "Scheduled") {
      return NextResponse.json(
        {
          error: `Campaign cannot be sent from ${currentStatus} status`,
        },
        { status: 400 }
      );
    }

    // Update campaign status to "Sending"
    await updateCampaignStatus(campaignId, "Sending", {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
      open_rate: "0%",
      click_rate: "0%",
    });

    // Trigger the Inngest background function
    await inngest.send({
      name: "campaign/send",
      data: {
        campaignId,
        campaign,
      },
    });

    console.log(`✅ [TRIGGER] Campaign ${campaignId} queued in Inngest`);

    return NextResponse.json({
      success: true,
      message: "Campaign send initiated via Inngest",
      campaignId,
    });
  } catch (error) {
    console.error("Error triggering campaign send:", error);
    return NextResponse.json(
      { error: "Failed to trigger campaign send" },
      { status: 500 }
    );
  }
}
