"use client";

import { useState, useCallback } from "react";
import {
  MarketingCampaign,
  EmailTemplate,
  EmailContact,
  EmailList,
} from "@/types";
import EditCampaignForm from "@/components/EditCampaignForm";
import EditCampaignContentForm from "@/components/EditCampaignContentForm";
import CampaignActions from "@/components/CampaignActions";
import TimeAgo from "@/components/TimeAgo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  Clock,
  UserMinus,
  Mail,
  RefreshCw,
  Trash2,
  MousePointerClick,
  ExternalLink as ExternalLinkIcon,
  BarChart3,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import ConfirmationModal from "@/components/ConfirmationModal";

interface CampaignPageClientProps {
  campaign: MarketingCampaign;
  templates: EmailTemplate[];
  contacts: EmailContact[];
  lists: EmailList[];
  stats?: any;
  unsubscribedContacts?: EmailContact[];
  unsubscribesTotal?: number;
  clickEvents?: Array<{
    id: string;
    contact_id?: string;
    contact_email?: string;
    contact_name?: string;
    url: string;
    timestamp: string;
    user_agent?: string;
    ip_address?: string;
  }>;
  clicksTotal?: number;
  clickStats?: {
    uniqueClickers: number;
    totalClicks: number;
    linkStats: Array<{
      url: string;
      clickCount: number;
      uniqueClickers: number;
    }>;
  } | null;
}

export default function CampaignPageClient({
  campaign,
  templates,
  contacts,
  lists,
  stats,
  unsubscribedContacts = [],
  unsubscribesTotal = 0,
  clickEvents = [],
  clicksTotal = 0,
  clickStats = null,
}: CampaignPageClientProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [handleSubmit, setHandleSubmit] = useState<
    (() => Promise<void>) | null
  >(null);
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load more state for unsubscribes
  const [unsubscribesPage, setUnsubscribesPage] = useState(1);
  const [unsubscribesData, setUnsubscribesData] =
    useState(unsubscribedContacts);
  const [unsubscribesTotalCount, setUnsubscribesTotalCount] =
    useState(unsubscribesTotal);
  const [unsubscribesHasMore, setUnsubscribesHasMore] = useState(
    unsubscribedContacts.length < unsubscribesTotal
  );
  const [isLoadingUnsubscribes, setIsLoadingUnsubscribes] = useState(false);

  // Load more state for clicks
  const [clicksPage, setClicksPage] = useState(1);
  const [clicksData, setClicksData] = useState(clickEvents);
  const [clicksTotalCount, setClicksTotalCount] = useState(clicksTotal);
  const [clicksHasMore, setClicksHasMore] = useState(
    clickEvents.length < clicksTotal
  );
  const [isLoadingClicks, setIsLoadingClicks] = useState(false);

  const handleFormDataChange = useCallback(
    (
      newFormData: any,
      newIsLoading: boolean,
      newHandleSubmit: () => Promise<void>
    ) => {
      setFormData(newFormData);
      setIsLoading(newIsLoading);
      setHandleSubmit(() => newHandleSubmit);
    },
    []
  );

  const handleRefreshStats = async () => {
    setIsRefreshingStats(true);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/sync-stats`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to refresh stats");
      }

      // Refresh the page to show updated stats
      router.refresh();
    } catch (error) {
      console.error("Error refreshing stats:", error);
      alert("Failed to refresh stats. Please try again.");
    } finally {
      setIsRefreshingStats(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setShowDeleteModal(false);

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete campaign");
      }

      router.push("/campaigns");
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete campaign";
      alert(errorMessage);
      setIsDeleting(false);
    }
  };

  const loadMoreUnsubscribes = async () => {
    setIsLoadingUnsubscribes(true);
    try {
      const nextPage = unsubscribesPage + 1;
      const response = await fetch(
        `/api/campaigns/${campaign.id}/unsubscribes?page=${nextPage}&limit=10`
      );
      const result = await response.json();

      if (result.success) {
        setUnsubscribesData([...unsubscribesData, ...result.data.contacts]);
        setUnsubscribesPage(nextPage);
        setUnsubscribesTotalCount(result.data.pagination.total);
        setUnsubscribesHasMore(
          unsubscribesData.length + result.data.contacts.length <
            result.data.pagination.total
        );
      }
    } catch (error) {
      console.error("Error loading more unsubscribes:", JSON.stringify(error));
    } finally {
      setIsLoadingUnsubscribes(false);
    }
  };

  const loadMoreClicks = async () => {
    setIsLoadingClicks(true);
    try {
      const nextPage = clicksPage + 1;
      const response = await fetch(
        `/api/campaigns/${campaign.id}/clicks?page=${nextPage}&limit=10`
      );
      const result = await response.json();

      if (result.success) {
        setClicksData([...clicksData, ...result.data.events]);
        setClicksPage(nextPage);
        setClicksTotalCount(result.data.pagination.total);
        setClicksHasMore(
          clicksData.length + result.data.events.length <
            result.data.pagination.total
        );
      }
    } catch (error) {
      console.error("Error loading more clicks:", JSON.stringify(error));
    } finally {
      setIsLoadingClicks(false);
    }
  };

  const status = campaign.metadata.status?.value || "Draft";

  // Format number with commas
  const formatNumber = (num: number) => {
    return num.toLocaleString("en-US");
  };

  const getSentDate = () => {
    // For sent campaigns, we can use the modified_at date as an approximation
    // or look for a specific sent date in stats or metadata
    if (status === "Sent") {
      // If there's a specific sent date in stats or metadata, use that
      if (
        campaign.metadata.stats &&
        campaign.metadata.sending_progress?.last_updated
      ) {
        return campaign.metadata.sending_progress.last_updated;
      }
      // Otherwise use the modified date as an approximation
      return campaign.modified_at;
    }
    return null;
  };

  const sentDate = getSentDate();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left Column - Campaign Form */}
      <div className="lg:col-span-2">
        <EditCampaignForm
          campaign={campaign}
          templates={templates}
          contacts={contacts}
          lists={lists}
          onFormDataChange={handleFormDataChange}
        />

        {/* Campaign Content Editor */}
        <div className="mt-8">
          <EditCampaignContentForm campaign={campaign} />
        </div>

        {/* Unsubscribed Contacts Section - Show for sending and sent campaigns with unsubscribed contacts */}
        {(status === "Sending" || status === "Sent") &&
          unsubscribesData.length > 0 && (
            <div className="mt-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <UserMinus className="h-5 w-5 text-red-500" />
                    <span>Unsubscribed Contacts</span>
                    <span className="text-sm font-normal text-gray-500">
                      (
                      {unsubscribesHasMore
                        ? `${formatNumber(
                            unsubscribesData.length
                          )} of ${formatNumber(unsubscribesTotalCount)}`
                        : formatNumber(unsubscribesTotalCount)}
                      )
                    </span>
                  </CardTitle>
                  <p className="text-sm text-gray-600">
                    Contacts who unsubscribed from this campaign
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {unsubscribesData.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                            <UserMinus className="h-4 w-4 text-red-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {contact.metadata.first_name}{" "}
                              {contact.metadata.last_name}
                            </div>
                            <div className="flex items-center space-x-1 text-sm text-gray-500">
                              <Mail className="h-3 w-3" />
                              <span>{contact.metadata.email}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">
                            Unsubscribed
                          </div>
                          {(contact.metadata as any).unsubscribed_date && (
                            <div className="text-xs text-gray-400">
                              <TimeAgo
                                date={
                                  (contact.metadata as any).unsubscribed_date
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {unsubscribesHasMore && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        onClick={loadMoreUnsubscribes}
                        disabled={isLoadingUnsubscribes}
                        className="w-full"
                      >
                        {isLoadingUnsubscribes
                          ? "Loading..."
                          : "Load More Unsubscribes"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

        {/* Click Analytics Section - Show aggregated stats */}
        {(status === "Sending" || status === "Sent") && clickStats && (
          <div className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  <span>Click Analytics</span>
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Aggregated click statistics and link performance
                </p>
              </CardHeader>
              <CardContent>
                {clickStats.totalClicks === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <BarChart3 className="mx-auto h-12 w-12 mb-3 text-gray-300" />
                    <p className="text-sm">No clicks yet</p>
                    <p className="text-xs mt-1">
                      Click statistics will appear once recipients click links
                      in the email
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <UsersIcon className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-medium text-blue-900">
                            Unique Clickers
                          </span>
                        </div>
                        <div className="text-3xl font-bold text-blue-900">
                          {formatNumber(clickStats.uniqueClickers)}
                        </div>
                        <div className="text-xs text-blue-700 mt-1">
                          {stats?.sent
                            ? `${Math.round(
                                (clickStats.uniqueClickers / stats.sent) * 100
                              )}% of recipients`
                            : "contacts clicked at least once"}
                        </div>
                      </div>
                      <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <MousePointerClick className="h-5 w-5 text-purple-600" />
                          <span className="text-sm font-medium text-purple-900">
                            Total Clicks
                          </span>
                        </div>
                        <div className="text-3xl font-bold text-purple-900">
                          {formatNumber(clickStats.totalClicks)}
                        </div>
                        <div className="text-xs text-purple-700 mt-1">
                          across {formatNumber(clickStats.linkStats.length)}{" "}
                          unique links
                        </div>
                      </div>
                    </div>

                    {/* Link Performance Table */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">
                        Link Performance
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left py-3 px-3 font-medium text-gray-700">
                                URL
                              </th>
                              <th className="text-center py-3 px-3 font-medium text-gray-700">
                                Total Clicks
                              </th>
                              <th className="text-center py-3 px-3 font-medium text-gray-700">
                                Unique Clickers
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {clickStats.linkStats.map((link, index) => (
                              <tr
                                key={index}
                                className="border-b hover:bg-gray-50"
                              >
                                <td className="py-3 px-3">
                                  <div className="flex items-center space-x-1 min-w-0">
                                    <ExternalLinkIcon className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                    <a
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate max-w-md"
                                      title={link.url}
                                    >
                                      {link.url}
                                    </a>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-semibold text-purple-800 bg-purple-100 rounded-full">
                                    {formatNumber(link.clickCount)}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">
                                    {formatNumber(link.uniqueClickers)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Click Events Section - Show for sending and sent campaigns with click events */}
        {(status === "Sending" || status === "Sent") &&
          clicksData.length > 0 && (
            <div className="mt-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MousePointerClick className="h-5 w-5 text-purple-500" />
                    <span>Click Events</span>
                    <span className="text-sm font-normal text-gray-500">
                      (
                      {clicksHasMore
                        ? `${formatNumber(clicksData.length)} of ${formatNumber(
                            clicksTotalCount
                          )}`
                        : formatNumber(clicksTotalCount)}
                      )
                    </span>
                  </CardTitle>
                  <p className="text-sm text-gray-600">
                    Detailed click tracking for this campaign
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-3 font-medium text-gray-700">
                            Contact
                          </th>
                          <th className="text-left py-3 px-3 font-medium text-gray-700">
                            URL
                          </th>
                          <th className="text-left py-3 px-3 font-medium text-gray-700">
                            Timestamp
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {clicksData.map((event) => (
                          <tr
                            key={event.id}
                            className="border-b hover:bg-gray-50"
                          >
                            <td className="py-3 px-3">
                              <div className="flex items-center space-x-2">
                                <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <MousePointerClick className="h-3 w-3 text-purple-600" />
                                </div>
                                <div className="min-w-0">
                                  {event.contact_name || event.contact_email ? (
                                    <>
                                      {event.contact_name && (
                                        <div className="text-xs font-medium text-gray-900 truncate">
                                          {event.contact_name}
                                        </div>
                                      )}
                                      {event.contact_email && (
                                        <div
                                          className="text-xs text-gray-600 truncate"
                                          title={event.contact_email}
                                        >
                                          {event.contact_email}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div className="text-xs text-gray-400">
                                      Unknown
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center space-x-1 min-w-0">
                                <ExternalLinkIcon className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                <a
                                  href={event.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate max-w-md"
                                  title={event.url}
                                >
                                  {event.url}
                                </a>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">
                              <TimeAgo date={event.timestamp} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {clicksHasMore && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        onClick={loadMoreClicks}
                        disabled={isLoadingClicks}
                        className="w-full"
                      >
                        {isLoadingClicks ? "Loading..." : "Load More Clicks"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

        {/* Danger Zone - Delete Campaign */}
        <div className="border-t pt-8 mt-8">
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader>
              <CardTitle className="text-red-800 flex items-center space-x-2">
                <Trash2 className="h-5 w-5" />
                <span>Danger Zone</span>
              </CardTitle>
              <p className="text-red-700 text-sm">
                Permanently delete this campaign. This action cannot be undone.
                {status === "Sending" &&
                  " Cannot delete campaigns that are currently sending."}
              </p>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteModal(true)}
                disabled={isDeleting || status === "Sending"}
                className="flex items-center space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Campaign</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Column - Actions & Stats */}
      <div className="space-y-6 sticky top-6 self-start">
        {/* Campaign Actions Card */}
        {formData && handleSubmit && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <span>Campaign Actions</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CampaignActions
                campaign={campaign}
                templates={templates}
                contacts={contacts}
                lists={lists}
                formData={formData}
                isLoading={isLoading}
                onSubmit={handleSubmit}
              />
            </CardContent>
          </Card>
        )}

        {/* Campaign Stats */}
        {(status === "Sent" || status === "Sending") && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Campaign Statistics</span>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshStats}
                  disabled={isRefreshingStats}
                  className="flex items-center space-x-1"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      isRefreshingStats ? "animate-spin" : ""
                    }`}
                  />
                  <span>{isRefreshingStats ? "Syncing..." : "Refresh"}</span>
                </Button>
              </div>
              {status === "Sent" && sentDate && (
                <div className="flex items-center space-x-1 text-sm text-gray-600 mt-2">
                  <Clock className="h-4 w-4" />
                  <span>
                    Sent <TimeAgo date={sentDate} />
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {status === "Sending" && campaign.metadata.sending_progress ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                      <span>Sending Progress</span>
                      <span>
                        {campaign.metadata.sending_progress.progress_percentage}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${campaign.metadata.sending_progress.progress_percentage}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Sent</div>
                      <div className="font-semibold">
                        {formatNumber(campaign.metadata.sending_progress.sent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Total</div>
                      <div className="font-semibold">
                        {formatNumber(campaign.metadata.sending_progress.total)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Failed</div>
                      <div className="font-semibold text-red-600">
                        {formatNumber(
                          campaign.metadata.sending_progress.failed
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Last Batch</div>
                      <div className="font-semibold">
                        {new Date(
                          campaign.metadata.sending_progress.last_batch_completed
                        ).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : stats ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {formatNumber(stats.sent || 0)}
                    </div>
                    <div className="text-sm text-gray-500">Sent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatNumber(stats.delivered || 0)}
                    </div>
                    <div className="text-sm text-gray-500">Delivered</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatNumber(stats.opened || 0)}
                    </div>
                    <div className="text-sm text-gray-500">Opened</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatNumber(stats.clicked || 0)}
                    </div>
                    <div className="text-sm text-gray-500">Clicked</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {formatNumber(stats.bounced || 0)}
                    </div>
                    <div className="text-sm text-gray-500">Bounced</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {formatNumber(stats.unsubscribed || 0)}
                    </div>
                    <div className="text-sm text-gray-500">Unsubscribed</div>
                  </div>
                  <div className="text-center col-span-2 border-t pt-4 mt-4">
                    <div className="flex justify-between">
                      <div>
                        <div className="text-lg font-bold text-blue-600">
                          {stats.open_rate || "0%"}
                        </div>
                        <div className="text-sm text-gray-500">Open Rate</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-purple-600">
                          {stats.click_rate || "0%"}
                        </div>
                        <div className="text-sm text-gray-500">Click Rate</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <TrendingUp className="mx-auto h-8 w-8 mb-2" />
                  <p>Statistics will appear once the campaign is sent</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Schedule Info */}
        {status === "Scheduled" && campaign.metadata.send_date && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Scheduled Sending</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-lg font-semibold text-blue-600">
                  {new Date(campaign.metadata.send_date).toLocaleDateString()}
                </div>
                <div className="text-sm text-gray-600">
                  at{" "}
                  {new Date(campaign.metadata.send_date).toLocaleTimeString()}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Campaign will be automatically sent via scheduled processing
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Campaign"
        message={`Are you sure you want to delete "${campaign.metadata.name}"? This action cannot be undone and will permanently remove this campaign from your account.`}
        confirmText="Delete Campaign"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  );
}
