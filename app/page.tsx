import { getMarketingCampaigns, getEmailContacts, getEmailTemplates } from '@/lib/cosmic'
import DashboardStats from '@/components/DashboardStats'
import CampaignsList from '@/components/CampaignsList'
import { Button } from '@/components/ui/button'
import { Plus, Mail, Users, FileText } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const [campaigns, contactsResponse, templates] = await Promise.all([
    getMarketingCampaigns(),
    getEmailContacts(), // This returns PaginatedContactsResponse
    getEmailTemplates()
  ])

  // Extract the contacts array from the paginated response
  const contacts = contactsResponse.contacts
  
  // Calculate stats
  const totalCampaigns = campaigns.length
  const totalContacts = contactsResponse.total // Use total from paginated response
  const totalTemplates = templates.length
  
  // Calculate active contacts
  const activeContacts = contacts.filter(contact => 
    contact.metadata.status.value === 'Active'
  ).length

  // Get recent campaigns (last 5)
  const recentCampaigns = campaigns
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  // Calculate campaign stats
  const sentCampaigns = campaigns.filter(c => c.metadata.status.value === 'Sent').length
  const scheduledCampaigns = campaigns.filter(c => c.metadata.status.value === 'Scheduled').length

  const dashboardStats = {
    totalCampaigns,
    totalContacts,
    activeContacts,
    totalTemplates,
    sentCampaigns,
    scheduledCampaigns,
    totalEmailsSent: campaigns.reduce((sum, campaign) => {
      return sum + (campaign.metadata.stats?.sent || 0)
    }, 0),
    averageOpenRate: campaigns.length > 0 
      ? Math.round(campaigns.reduce((sum, campaign) => {
          const openRate = parseFloat(campaign.metadata.stats?.open_rate?.replace('%', '') || '0')
          return sum + openRate
        }, 0) / campaigns.length) + '%'
      : '0%'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Email Marketing Dashboard</h1>
              <p className="text-gray-600 mt-1">Manage your campaigns, contacts, and templates</p>
            </div>
            <div className="flex space-x-4">
              <Link href="/contacts/new">
                <Button variant="outline">
                  <Users className="mr-2 h-4 w-4" />
                  Add Contact
                </Button>
              </Link>
              <Link href="/templates/new">
                <Button variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  New Template
                </Button>
              </Link>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Dashboard Stats */}
        <DashboardStats stats={dashboardStats} />

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/campaigns/new" className="group">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white group-hover:bg-blue-600">
                    <Mail className="h-6 w-6" />
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900 group-hover:text-blue-600">Create Campaign</h3>
                  <p className="text-sm text-gray-500">Start a new email marketing campaign</p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/contacts" className="group">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-green-500 text-white group-hover:bg-green-600">
                    <Users className="h-6 w-6" />
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900 group-hover:text-green-600">Manage Contacts</h3>
                  <p className="text-sm text-gray-500">View and organize your subscriber list</p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/templates" className="group">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-purple-500 text-white group-hover:bg-purple-600">
                    <FileText className="h-6 w-6" />
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900 group-hover:text-purple-600">Email Templates</h3>
                  <p className="text-sm text-gray-500">Create and edit email templates</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Recent Campaigns */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Campaigns</h2>
              <Link href="/campaigns">
                <Button variant="outline" size="sm">View All</Button>
              </Link>
            </div>
          </div>
          <div className="p-6">
            {recentCampaigns.length > 0 ? (
              <CampaignsList campaigns={recentCampaigns} />
            ) : (
              <div className="text-center py-8">
                <Mail className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No campaigns yet</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating your first email campaign.</p>
                <div className="mt-6">
                  <Link href="/campaigns/new">
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      New Campaign
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}