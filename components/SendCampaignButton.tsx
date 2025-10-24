"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MarketingCampaign } from "@/types";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import ConfirmationModal from "@/components/ConfirmationModal";
import { Send, Clock, Check, AlertCircle } from "lucide-react";

interface SendCampaignButtonProps {
  campaign: MarketingCampaign;
}

export default function SendCampaignButton({
  campaign,
}: SendCampaignButtonProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentCampaign, setCurrentCampaign] = useState(campaign);

  const status = currentCampaign.metadata.status?.value || "Draft";

  // Format numbers with commas
  const formatNumber = (num: number) => num.toLocaleString("en-US");

  // Sync local state when prop changes
  useEffect(() => {
    setCurrentCampaign(campaign);
  }, [campaign]);

  // Check if campaign has targets
  const hasContacts =
    currentCampaign.metadata.target_contacts &&
    currentCampaign.metadata.target_contacts.length > 0;
  const hasTags =
    currentCampaign.metadata.target_tags &&
    currentCampaign.metadata.target_tags.length > 0;
  const hasLists =
    currentCampaign.metadata.target_lists &&
    currentCampaign.metadata.target_lists.length > 0;
  const hasTargets = hasContacts || hasTags || hasLists;

  // Real-time polling for campaign status updates
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    // Only poll if campaign is in sending state
    if (status === "Sending") {
      pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/campaigns/${campaign.id}`);
          if (response.ok) {
            const data = await response.json();
            console.log("Polling response:", JSON.stringify(data, null, 2));
            if (data.success && data.campaign) {
              // Update local state with fresh campaign data
              setCurrentCampaign(data.campaign);

              // If status changed from Sending, stop polling and refresh
              if (data.campaign.metadata.status?.value !== "Sending") {
                router.refresh();
                if (pollInterval) {
                  clearInterval(pollInterval);
                }
              }
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 3000); // Poll every 3 seconds
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [status, campaign.id, router]);

  // Check if campaign is scheduled for future
  const isScheduledForFuture = () => {
    if (!currentCampaign.metadata.send_date) return false;
    const scheduleDate = new Date(currentCampaign.metadata.send_date);
    const now = new Date();
    return scheduleDate > now;
  };

  const handleSendNow = async () => {
    if (!hasTargets) {
      addToast("Campaign has no target recipients", "error");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send campaign");
      }

      const data = await response.json();

      // Show success state in the same modal
      setShowSuccess(true);

      // Refresh the page to show updated status
      setTimeout(function () {
        router.refresh();
      }, 3000);
    } catch (error) {
      console.error("Campaign send error:", error);
      addToast(
        error instanceof Error ? error.message : "Failed to send campaign",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReturnToDraft = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/campaigns/${currentCampaign.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "Draft",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to return campaign to draft"
        );
      }

      addToast("Campaign returned to draft", "success");
      router.refresh();
    } catch (error) {
      console.error("Return to draft error:", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Failed to return campaign to draft",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getRecipientCount = () => {
    const contactCount = currentCampaign.metadata.target_contacts?.length || 0;
    const tagCount = currentCampaign.metadata.target_tags?.length || 0;
    const listCount = currentCampaign.metadata.target_lists?.length || 0;

    if (contactCount > 0 && tagCount > 0 && listCount > 0) {
      return contactCount + tagCount + listCount; // Approximate, as there could be overlaps
    } else if (contactCount > 0 && tagCount > 0) {
      return contactCount + tagCount; // Approximate, as tags could overlap with contacts
    } else if (contactCount > 0 && listCount > 0) {
      return contactCount + listCount; // Approximate, as lists could overlap with contacts
    } else if (tagCount > 0 && listCount > 0) {
      return `Tag${tagCount === 1 ? "" : "s"} + List${
        listCount === 1 ? "" : "s"
      }`;
    } else if (contactCount > 0) {
      return contactCount;
    } else if (listCount > 0) {
      // For lists, we can't determine exact count without querying contacts
      // Show a placeholder that indicates list-based targeting
      return `List${
        listCount === 1 ? "" : "s"
      }: ${currentCampaign.metadata.target_lists
        ?.map((list) =>
          typeof list === "string" ? list : list.metadata?.name || "Unnamed"
        )
        .join(", ")}`;
    } else {
      // For tags, we can't determine exact count without querying contacts
      // Show a placeholder that indicates tag-based targeting
      return `Tag${
        tagCount === 1 ? "" : "s"
      }: ${currentCampaign.metadata.target_tags?.join(", ")}`;
    }
  };

  const getRecipientDisplay = () => {
    const contactCount = currentCampaign.metadata.target_contacts?.length || 0;
    const tagCount = currentCampaign.metadata.target_tags?.length || 0;
    const listCount = currentCampaign.metadata.target_lists?.length || 0;

    const parts = [];

    if (contactCount > 0) {
      parts.push(`${contactCount} contact${contactCount === 1 ? "" : "s"}`);
    }

    if (listCount > 0) {
      const listNames = currentCampaign.metadata.target_lists
        ?.map((list) =>
          typeof list === "string" ? list : list.metadata?.name || "Unnamed"
        )
        .join(", ");
      parts.push(
        `${listCount} list${listCount === 1 ? "" : "s"} (${listNames})`
      );
    }

    if (tagCount > 0) {
      parts.push(
        `tag${
          tagCount === 1 ? "" : "s"
        }: ${currentCampaign.metadata.target_tags?.join(", ")}`
      );
    }

    if (parts.length === 0) {
      return "No recipients selected";
    }

    return `Recipients from ${parts.join(" + ")}`;
  };

  const handleModalClose = () => {
    setShowConfirmModal(false);
    setShowSuccess(false);
  };

  // Show different UI based on campaign status
  if (status === "Sent") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center p-4 bg-green-50 border border-green-200 rounded-lg">
          <Check className="h-5 w-5 text-green-600 mr-2" />
          <span className="text-green-800 font-medium">
            Campaign Sent Successfully
          </span>
        </div>

        {currentCampaign.metadata.stats && (
          <div className="text-sm text-gray-600 text-center">
            <div>
              Sent to {formatNumber(currentCampaign.metadata.stats.sent || 0)}{" "}
              recipients
            </div>
            {currentCampaign.metadata.stats.delivered !== undefined &&
              Number(currentCampaign.metadata.stats.delivered) > 0 && (
                <div>
                  Delivered:{" "}
                  {formatNumber(currentCampaign.metadata.stats.delivered)}
                </div>
              )}
          </div>
        )}
      </div>
    );
  }

  if (status === "Sending") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <LoadingSpinner size="md" variant="primary" className="mr-2" />
          <span className="text-yellow-800 font-medium">
            Campaign is Sending
          </span>
        </div>

        {currentCampaign.metadata.sending_progress && (
          <div className="text-sm text-gray-600 text-center">
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div
                className="bg-yellow-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${currentCampaign.metadata.sending_progress.progress_percentage}%`,
                }}
              ></div>
            </div>
            <div>
              Progress:{" "}
              {formatNumber(currentCampaign.metadata.sending_progress.sent)} /{" "}
              {formatNumber(currentCampaign.metadata.sending_progress.total)} (
              {currentCampaign.metadata.sending_progress.progress_percentage}%)
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === "Cancelled") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
          <span className="text-red-800 font-medium">Campaign Cancelled</span>
        </div>
      </div>
    );
  }

  if (status === "Scheduled") {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-center mb-2">
            <Clock className="h-5 w-5 text-blue-600 mr-2" />
            <span className="text-blue-800 font-medium">
              Campaign Scheduled
            </span>
          </div>
          {currentCampaign.metadata.send_date && (
            <div className="text-sm text-gray-700 text-center">
              <div className="font-medium">
                {new Date(currentCampaign.metadata.send_date).toLocaleString()}
              </div>
              <div className="mt-1 text-gray-600">{getRecipientDisplay()}</div>
            </div>
          )}
        </div>

        <Button
          onClick={() => setShowConfirmModal(true)}
          disabled={isLoading || !hasTargets}
          className="w-full"
        >
          <Send className="h-4 w-4 mr-2" />
          Send Now Instead
        </Button>

        <Button
          onClick={handleReturnToDraft}
          disabled={isLoading}
          variant="outline"
          className="w-full"
        >
          Return to Draft
        </Button>

        <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-200">
          The campaign will automatically send at the scheduled time.
        </div>
      </div>
    );
  }

  // Draft status - show send options
  return (
    <div className="space-y-4">
      {!hasTargets && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-orange-800">
              <div className="font-medium">No recipients selected</div>
              <div className="mt-1">
                Please select contacts or tags before sending.
              </div>
            </div>
          </div>
        </div>
      )}

      {hasTargets && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="text-sm text-gray-700 text-center">
            <div className="font-medium">Ready to send to:</div>
            <div className="mt-1">{getRecipientDisplay()}</div>
          </div>
        </div>
      )}

      {/* Send Now Button */}
      <Button
        onClick={() => setShowConfirmModal(true)}
        disabled={isLoading || !hasTargets}
        className="w-full"
      >
        {isLoading ? (
          <>
            <LoadingSpinner size="sm" variant="white" className="mr-2" />
            Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Send Now
          </>
        )}
      </Button>

      <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-200">
        <div>
          Emails will be sent in batches via background processing for optimal
          delivery.
        </div>
        {currentCampaign.metadata.send_date && isScheduledForFuture() && (
          <div className="mt-2 text-blue-600 font-medium">
            💡 Tip: Click "Update Campaign" above to schedule this campaign for{" "}
            {new Date(currentCampaign.metadata.send_date).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Enhanced Confirmation/Success Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onOpenChange={handleModalClose}
        title={
          showSuccess ? "✅ Campaign Sending Started!" : "Send Campaign Now?"
        }
        description={
          showSuccess
            ? `Your campaign "${
                currentCampaign.metadata.name
              }" is now being sent to ${getRecipientDisplay()}!`
            : `Are you sure you want to send "${
                currentCampaign.metadata.name
              }" to ${getRecipientDisplay()}? This action cannot be undone.`
        }
        confirmText={showSuccess ? "Got it!" : "Send Campaign"}
        cancelText={showSuccess ? "" : "Cancel"}
        onConfirm={showSuccess ? handleModalClose : handleSendNow}
        isLoading={isLoading}
        variant="default"
        preventAutoClose={true}
      />
    </div>
  );
}
