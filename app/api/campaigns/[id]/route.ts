// app/api/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  updateEmailCampaign,
  deleteEmailCampaign,
  getEmailCampaign,
  updateCampaignStatus,
} from "@/lib/cosmic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const campaign = await getEmailCampaign(id);

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      campaign,
    });
  } catch (error) {
    console.error("Campaign fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const data = await request.json();

    // Validate required fields for updates
    if (data.name && !data.name.trim()) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 }
      );
    }

    // Special handling for status updates
    if (data.status) {
      const validStatuses = [
        "Draft",
        "Scheduled",
        "Sending",
        "Sent",
        "Cancelled",
      ];
      if (!validStatuses.includes(data.status)) {
        return NextResponse.json(
          { error: "Invalid campaign status" },
          { status: 400 }
        );
      }
    }

    // Validate schedule date if provided
    if (data.send_date && data.send_date !== "") {
      const scheduleDate = new Date(data.send_date);
      const now = new Date();

      if (isNaN(scheduleDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid schedule date format" },
          { status: 400 }
        );
      }

      // Allow scheduling in the past for manual cron testing
      // In production, you might want to enforce future dates
      if (data.status === "Scheduled" && scheduleDate <= now) {
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        if (scheduleDate < fiveMinutesFromNow) {
          return NextResponse.json(
            { error: "Schedule date must be at least 5 minutes in the future" },
            { status: 400 }
          );
        }
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.template_id !== undefined)
      updateData.template_id = data.template_id;
    if (data.list_ids !== undefined) updateData.list_ids = data.list_ids;
    if (data.contact_ids !== undefined)
      updateData.contact_ids = data.contact_ids;
    if (data.target_tags !== undefined)
      updateData.target_tags = data.target_tags;
    if (data.send_date !== undefined) updateData.send_date = data.send_date;
    if (data.stats !== undefined) updateData.stats = data.stats;
    if (data.public_sharing_enabled !== undefined)
      updateData.public_sharing_enabled = data.public_sharing_enabled;

    // Handle status update with special logic
    if (data.status !== undefined) {
      // Get current campaign to check current status
      const currentCampaign = await getEmailCampaign(id);
      if (!currentCampaign) {
        return NextResponse.json(
          { error: "Campaign not found" },
          { status: 404 }
        );
      }

      const currentStatus = currentCampaign.metadata.status?.value || "Draft";

      // Prevent certain status transitions
      if (currentStatus === "Sent" && data.status !== "Sent") {
        return NextResponse.json(
          { error: "Cannot change status of sent campaign" },
          { status: 400 }
        );
      }

      if (
        currentStatus === "Sending" &&
        !["Sending", "Sent", "Cancelled"].includes(data.status)
      ) {
        return NextResponse.json(
          { error: "Cannot change status while campaign is sending" },
          { status: 400 }
        );
      }

      // If only status is being updated (no other fields), use the specialized status update function
      if (Object.keys(updateData).length === 0) {
        // Status-only update - use the specialized function
        await updateCampaignStatus(id, data.status, data.stats);
      } else {
        // Update other fields first, then update status
        const campaign = await updateEmailCampaign(id, updateData);
        if (campaign) {
          // Then update the status using the specialized function
          await updateCampaignStatus(id, data.status, data.stats);
        }
      }
    } else {
      // Regular update without status change
      await updateEmailCampaign(id, updateData);
    }

    // Fetch updated campaign
    const updatedCampaign = await getEmailCampaign(id);

    return NextResponse.json({
      success: true,
      message: "Campaign updated successfully",
      campaign: updatedCampaign,
    });
  } catch (error) {
    console.error("Campaign update error:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if campaign exists and get its current status
    const campaign = await getEmailCampaign(id);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const status = campaign.metadata.status?.value || "Draft";

    // Prevent deletion of campaigns that are currently sending
    if (status === "Sending") {
      return NextResponse.json(
        { error: "Cannot delete campaign while it is sending" },
        { status: 400 }
      );
    }

    await deleteEmailCampaign(id);

    return NextResponse.json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    console.error("Campaign deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
