"use client";

import { useState } from "react";
import CampaignsList from "@/components/CampaignsList";
import CampaignsCalendar from "@/components/CampaignsCalendar";
import { MarketingCampaign } from "@/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { List, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface CampaignsViewProps {
  initialCampaigns: MarketingCampaign[];
  totalCampaigns: number;
  initialLimit: number;
}

export default function CampaignsView({
  initialCampaigns,
  totalCampaigns,
  initialLimit,
}: CampaignsViewProps) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [campaigns, setCampaigns] =
    useState<MarketingCampaign[]>(initialCampaigns);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false); // Changed: Added refresh state
  const [total, setTotal] = useState(totalCampaigns); // Changed: Track total count
  const [hasMore, setHasMore] = useState(
    initialCampaigns.length < totalCampaigns
  );

  const loadMoreCampaigns = async () => {
    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/campaigns?limit=${initialLimit}&skip=${campaigns.length}`
      );

      if (!response.ok) {
        throw new Error("Failed to load more campaigns");
      }

      const result = await response.json();

      if (result.success) {
        const newCampaigns = [...campaigns, ...result.data];
        setCampaigns(newCampaigns);
        setTotal(result.total);
        setHasMore(newCampaigns.length < result.total);
      }
    } catch (error) {
      console.error("Error loading more campaigns:", JSON.stringify(error));
      alert("Failed to load more campaigns. Please try again.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Changed: New function to refresh campaigns after duplication
  const handleCampaignDuplicated = async () => {
    setIsRefreshing(true);
    try {
      // Fetch fresh data with current pagination
      const response = await fetch(
        `/api/campaigns?limit=${campaigns.length}`
      );

      if (!response.ok) {
        throw new Error("Failed to refresh campaigns");
      }

      const result = await response.json();

      if (result.success) {
        setCampaigns(result.data);
        setTotal(result.total);
        setHasMore(result.data.length < result.total);
      }
    } catch (error) {
      console.error("Error refreshing campaigns:", JSON.stringify(error));
      // Don't show an alert here as it would be intrusive after successful duplication
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Tabs */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {/* Changed: Show refreshing state */}
          {isRefreshing ? (
            <div className="flex items-center space-x-2">
              <LoadingSpinner size="sm" />
              <span>Refreshing campaigns...</span>
            </div>
          ) : (
            <span>
              Showing {campaigns.length} of {total} campaigns
            </span>
          )}
        </div>
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as "list" | "calendar")}
        >
          <TabsList>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              <span>List</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Calendar</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* View Content */}
      {view === "list" ? (
        <>
          <CampaignsList 
            campaigns={campaigns} 
            onCampaignDuplicated={handleCampaignDuplicated} // Changed: Pass callback
          />

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center pt-8">
              <Button
                onClick={loadMoreCampaigns}
                disabled={isLoadingMore}
                variant="outline"
                size="lg"
                className="min-w-[200px]"
              >
                {isLoadingMore ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Loading...
                  </>
                ) : (
                  `Load More Campaigns (${
                    total - campaigns.length
                  } remaining)`
                )}
              </Button>
            </div>
          )}
        </>
      ) : (
        <CampaignsCalendar campaigns={campaigns} />
      )}
    </div>
  );
}