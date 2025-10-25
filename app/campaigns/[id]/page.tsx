// app/campaigns/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";

// Force dynamic rendering to ensure fresh data
export const dynamic = "force-dynamic";
export const revalidate = 0;

import {
  getMarketingCampaign,
  getEmailTemplates,
  getEmailLists,
  getUnsubscribedContactsByCampaign,
  getClickEventsByCampaign,
  getClickStatsByCampaign,
} from "@/lib/cosmic";
import CampaignPageClient from "@/components/CampaignPageClient";
import { EmailContact } from "@/types";

export const metadata = {
  title: "Campaign Details | Email Marketing",
  description: "View and edit email marketing campaign details",
};

interface CampaignPageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;

  try {
    // Fetch campaign, templates, and lists - contacts are handled via search in the components
    const [campaign, templates, lists] = await Promise.all([
      getMarketingCampaign(id),
      getEmailTemplates(),
      getEmailLists(),
    ]);

    if (!campaign) {
      notFound();
    }

    // Fetch unsubscribed contacts and click events (show stats for any status)
    let unsubscribedContacts: EmailContact[] = [];
    let unsubscribesTotal = 0;
    let clickEvents: any[] = [];
    let clicksTotal = 0;
    let clickStats: any = null;

    // Always fetch stats data if available
    try {
      const result = await getUnsubscribedContactsByCampaign(id, {
        limit: 10,
      });
      unsubscribedContacts = result.contacts;
      unsubscribesTotal = result.total;
    } catch (error) {
      console.error("Error fetching unsubscribed contacts:", error);
      // Continue without unsubscribed contacts data
    }

    try {
      const result = await getClickEventsByCampaign(id, {
        limit: 10,
      });
      clickEvents = result.events;
      clicksTotal = result.total;
    } catch (error) {
      console.error("Error fetching click events:", error);
      // Continue without click events data
    }

    try {
      clickStats = await getClickStatsByCampaign(id);
    } catch (error) {
      console.error("Error fetching aggregated click stats:", error);
      // Continue without aggregated stats
    }

    // Use pre-synced stats from campaign metadata
    // Stats are updated periodically by the cron job at /api/cron/sync-campaign-stats
    // and can be manually refreshed via the sync button in the UI
    const stats = campaign.metadata.stats;

    return (
      <div className="min-h-screen bg-gray-50 pb-16">
        {/* Page Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                  <Link href="/campaigns" className="hover:text-gray-700">
                    Campaigns
                  </Link>
                  <span>/</span>
                  <span className="text-gray-900">
                    {campaign.metadata.name}
                  </span>
                </nav>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {campaign.metadata.name}
                </h1>
                <div className="flex items-center space-x-4">
                  <span
                    className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                      campaign.metadata.status?.value === "Sent"
                        ? "bg-green-100 text-green-800"
                        : campaign.metadata.status?.value === "Scheduled"
                        ? "bg-blue-100 text-blue-800"
                        : campaign.metadata.status?.value === "Sending"
                        ? "bg-yellow-100 text-yellow-800"
                        : campaign.metadata.status?.value === "Draft"
                        ? "bg-gray-100 text-gray-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {campaign.metadata.status?.value || "Draft"}
                  </span>
                  <span className="text-sm text-gray-500">
                    Campaign ID: {campaign.id}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <CampaignPageClient
            campaign={campaign}
            templates={templates}
            contacts={
              // With depth=1, target_contacts should be populated with full objects
              // If they're strings, pass empty array and contacts will be searched via the UI
              Array.isArray(campaign.metadata.target_contacts) &&
              campaign.metadata.target_contacts.length > 0 &&
              typeof campaign.metadata.target_contacts[0] === "object"
                ? (campaign.metadata.target_contacts as EmailContact[])
                : []
            }
            lists={lists}
            stats={stats}
            unsubscribedContacts={unsubscribedContacts}
            unsubscribesTotal={unsubscribesTotal}
            clickEvents={clickEvents}
            clicksTotal={clicksTotal}
            clickStats={clickStats}
          />
        </main>
      </div>
    );
  } catch (error) {
    console.error(`Error loading campaign ${id}:`, error);
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                  <Link href="/campaigns" className="hover:text-gray-700">
                    Campaigns
                  </Link>
                  <span>/</span>
                  <span className="text-gray-900">Campaign Details</span>
                </nav>
                <h1 className="text-3xl font-bold text-gray-900">
                  Campaign Details
                </h1>
              </div>
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Error Loading Campaign
            </h2>
            <p className="text-gray-600 mb-6">
              Unable to load the campaign details. The campaign may not exist or
              there was a server error.
            </p>
            <Link
              href="/campaigns"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Campaigns
            </Link>
          </div>
        </main>
      </div>
    );
  }
}
