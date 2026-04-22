"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MarketingCampaign,
  EmailTemplate,
  EmailContact,
  EmailList,
} from "@/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import SendCampaignButton from "@/components/SendCampaignButton";
import TestEmailModal from "@/components/TestEmailModal";
import { Save, TestTube, Share, Copy, ExternalLink, Users } from "lucide-react";

interface CampaignActionsProps {
  campaign: MarketingCampaign;
  templates: EmailTemplate[];
  contacts: EmailContact[];
  lists: EmailList[];
  formData: {
    name: string;
    target_type: "lists" | "contacts" | "tags";
    list_ids: string[];
    contact_ids: string[];
    target_tags: string[];
    send_date: string;
    schedule_type: "now" | "scheduled";
  };
  isLoading: boolean;
  onSubmit: () => Promise<void>;
  totalContacts?: number;
}

export default function CampaignActions({
  campaign,
  templates,
  contacts,
  lists,
  formData,
  isLoading,
  onSubmit,
  totalContacts,
}: CampaignActionsProps) {
  const { toast } = useToast();
  const canEdit = campaign.metadata?.status?.value === "Draft";
  const status = campaign.metadata?.status?.value || "Draft";

  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/public/campaigns/${campaign.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({
        title: "Link copied!",
        description: "The public campaign link has been copied to your clipboard.",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast({
        title: "Copy failed",
        description: "Unable to copy link to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleOpenInNewTab = () => {
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  };

  // Format number with commas
  const formatCount = (num: number) => {
    return num.toLocaleString("en-US");
  };

  // Get the list names for the "Ready to send to" display
  const getTargetListNames = () => {
    if (formData.target_type !== "lists") return [];
    return formData.list_ids
      .map((id) => {
        const list = lists.find((l) => l.id === id);
        return list?.metadata.name || "Unknown List";
      })
      .filter(Boolean);
  };

  // Determine the display count: prefer the totalContacts prop from EditCampaignForm,
  // fall back to direct contact count for contact-based targeting
  const displayCount = (() => {
    if (formData.target_type === "lists" && totalContacts !== undefined) {
      return totalContacts;
    }
    if (formData.target_type === "contacts") {
      return formData.contact_ids.length;
    }
    return null;
  })();

  const hasTargets =
    (formData.target_type === "lists" && formData.list_ids.length > 0) ||
    (formData.target_type === "contacts" && formData.contact_ids.length > 0) ||
    (formData.target_type === "tags" && formData.target_tags.length > 0);

  const targetListNames = getTargetListNames();

  return (
    <div className="space-y-4">
      {/* Update Campaign Button */}
      {canEdit && (
        <Button
          onClick={onSubmit}
          disabled={isLoading || !formData.name}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Updating...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Update Campaign
            </>
          )}
        </Button>
      )}

      {/* Send Test Email - Right below Update Campaign button, full width */}
      {status === "Draft" && (
        <div className="w-full">
          <TestEmailModal
            campaignId={campaign.id}
            campaignName={campaign.metadata.name}
          />
        </div>
      )}

      {/* Ready to Send To - shows targets and contact count */}
      {hasTargets && (
        <div className="p-4 bg-gray-50 border rounded-lg space-y-3">
          <div className="text-sm font-semibold text-gray-800 text-center">
            Ready to send to:
          </div>

          {/* Contact count badge */}
          {displayCount !== null && displayCount > 0 && (
            <div className="flex items-center justify-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 border border-blue-200 rounded-full">
                <Users className="h-3.5 w-3.5 text-blue-700" />
                <span className="text-sm font-bold text-blue-900">
                  {formatCount(displayCount)} contact{displayCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          )}

          {/* Target details */}
          {formData.target_type === "lists" && targetListNames.length > 0 && (
            <p className="text-xs text-gray-600 text-center">
              Recipients from {targetListNames.length} list{targetListNames.length !== 1 ? "s" : ""} ({targetListNames.join(", ")})
            </p>
          )}
          {formData.target_type === "contacts" && (
            <p className="text-xs text-gray-600 text-center">
              {formData.contact_ids.length} individual contact{formData.contact_ids.length !== 1 ? "s" : ""}
            </p>
          )}
          {formData.target_type === "tags" && (
            <p className="text-xs text-gray-600 text-center">
              Contacts with tag{formData.target_tags.length !== 1 ? "s" : ""}: {formData.target_tags.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Send Campaign Button */}
      <SendCampaignButton campaign={campaign} />

      {/* Share Campaign Section */}
      <div className="border-t pt-4">
        <div className="flex items-center space-x-2 mb-3">
          <Share className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Share Campaign</span>
        </div>
        
        <div className="space-y-2">
          <Button
            onClick={handleCopyLink}
            variant="outline"
            className="w-full justify-start"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Public Link
          </Button>
          
          <Button
            onClick={handleOpenInNewTab}
            variant="outline"
            className="w-full justify-start"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in New Tab
          </Button>
        </div>
        
        <p className="text-xs text-gray-500 mt-2">
          Share this public link to let anyone view the campaign content without logging in.
        </p>
      </div>
    </div>
  );
}