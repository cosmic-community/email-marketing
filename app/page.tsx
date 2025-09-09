import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Users, Mail, Template, BarChart3, ArrowRight } from 'lucide-react'
import { getEmailContacts, getMarketingCampaigns, getEmailTemplates } from '@/lib/cosmic'
import DashboardStats from '@/components/DashboardStats'
import { MarketingCampaign, EmailContact } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  // Fetch data in parallel
  const [
    { contacts, total: totalContacts },
    campaigns,
    templates
  ] = await Promise.all([
    getEmailContacts({ limit: 1000 }), // Get all contacts to calculate stats
    getMarketingCampaigns(),
    getEmailTemplates()
  ])

  // Calculate stats
  const activeContacts = contacts.filter(contact => 
    contact.metadata.status.value === 'Active'
  ).length

  const sentCampaigns = campaigns.filter(campaign => 
    campaign.metadata.status.value === 'Sent'
  ).length

  const scheduledCampaigns = campaigns.filter(campaign => 
    campaign.metadata.status.value === 'Scheduled'
  ).length

  // Calculate total emails sent
  const totalEmailsSent = campaigns.reduce((total, campaign) => {
    return total + (campaign.metadata.stats?.sent || 0)
  }, 0)

  // Calculate average open rate
  const campaignsWithStats = campaigns.filter(campaign => 
    campaign.metadata.stats?.sent && campaign.metadata.stats.sent > 0
  )
  
  const averageOpenRate = campaignsWithStats.length > 0
    ? (campaignsWithStats.reduce((total, campaign) => {
        const openRate = parseFloat(campaign.metadata.stats?.open_rate?.replace('%', '') || '0')
        return total + openRate
      }, 0) / campaignsWithStats.length).toFixed(1) + '%'
    : '0%'

  // Recent campaigns (last 5)
  const recentCampaigns = campaigns
    .sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime())
    .slice(0, 5)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Email Marketing Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Manage your email campaigns and grow your audience
              </p>
            </div>
            <div className="flex space-x-4">
              <Link href="/campaigns/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Campaign
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <DashboardStats 
          totalCampaigns={campaigns.length}
          totalContacts={totalContacts}
          activeContacts={activeContacts}
          totalTemplates={templates.length}
          sentCampaigns={sentCampaigns}
          scheduledCampaigns={scheduledCampaigns}
          totalEmailsSent={totalEmailsSent}
          averageOpenRate={averageOpenRate}
        />

        {/* Quick Actions & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Quick Actions */}
          <div className="lg:col-span-1">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Link href="/campaigns/new" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Mail className="mr-3 h-4 w-4" />
                    Create New Campaign
                  </Button>
                </Link>
                
                <Link href="/contacts/new" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="mr-3 h-4 w-4" />
                    Add New Contact
                  </Button>
                </Link>
                
                <Link href="/templates/new" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Template className="mr-3 h-4 w-4" />
                    Create Email Template
                  </Button>
                </Link>
                
                <Link href="/settings" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <BarChart3 className="mr-3 h-4 w-4" />
                    View Settings
                  </Button>
                </Link>
              </div>
            </Card>
          </div>

          {/* Recent Campaigns */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent Campaigns</h2>
                <Link href="/campaigns">
                  <Button variant="ghost" size="sm">
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              
              {recentCampaigns.length > 0 ? (
                <div className="space-y-4">
                  {recentCampaigns.map((campaign) => (
                    <div key={campaign.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{campaign.metadata.name}</h3>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            campaign.metadata.status.value === 'Sent' ? 'bg-green-100 text-green-800' :
                            campaign.metadata.status.value === 'Draft' ? 'bg-gray-100 text-gray-800' :
                            campaign.metadata.status.value === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {campaign.metadata.status.value}
                          </span>
                          {campaign.metadata.stats?.sent && (
                            <span className="text-sm text-gray-600">
                              {campaign.metadata.stats.sent} sent
                            </span>
                          )}
                        </div>
                      </div>
                      <Link href={`/campaigns/${campaign.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Mail className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No campaigns yet</h3>
                  <p className="mt-1 text-sm text-gray-500">Get started by creating your first email campaign.</p>
                  <div className="mt-6">
                    <Link href="/campaigns/new">
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Campaign
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}