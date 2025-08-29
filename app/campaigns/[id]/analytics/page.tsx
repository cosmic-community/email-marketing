// app/campaigns/[id]/analytics/page.tsx
import { getMarketingCampaign } from '@/lib/cosmic'
import CampaignAnalytics from '@/components/CampaignAnalytics'
import { notFound } from 'next/navigation'

export default async function CampaignAnalyticsPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params
  
  const campaign = await getMarketingCampaign(id)
  
  if (!campaign) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Page Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Campaign Analytics</h1>
              <p className="text-gray-600 mt-1">Track opens, clicks, and engagement</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CampaignAnalytics 
          campaignId={campaign.id} 
          campaignName={campaign.title}
        />
      </main>
    </div>
  )
}