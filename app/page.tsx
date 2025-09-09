import { getMarketingCampaigns, getEmailTemplates, getEmailContacts } from '@/lib/cosmic'
import DashboardStats from '@/components/DashboardStats'
import { Users, Mail, Send, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function HomePage() {
  try {
    // Fetch dashboard data in parallel
    const [campaigns, templates, { total: totalContacts }] = await Promise.all([
      getMarketingCampaigns(),
      getEmailTemplates(),
      getEmailContacts({ limit: 1 }) // Just get count
    ])

    // Calculate stats
    const totalCampaigns = campaigns.length
    const activeCampaigns = campaigns.filter(c => c.metadata.status.value === 'Draft' || c.metadata.status.value === 'Scheduled').length
    const totalTemplates = templates.length

    const stats = [
      {
        title: 'Total Contacts',
        value: totalContacts.toString(),
        description: 'Active subscribers',
        icon: Users,
        color: 'text-blue-600'
      },
      {
        title: 'Email Templates',
        value: totalTemplates.toString(),
        description: 'Available templates',
        icon: Mail,
        color: 'text-green-600'
      },
      {
        title: 'Total Campaigns',
        value: totalCampaigns.toString(),
        description: 'All campaigns',
        icon: Send,
        color: 'text-purple-600'
      },
      {
        title: 'Active Campaigns',
        value: activeCampaigns.toString(),
        description: 'Ready to send',
        icon: TrendingUp,
        color: 'text-orange-600'
      }
    ]

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl">
                Email Marketing
                <span className="text-blue-600"> Dashboard</span>
              </h1>
              <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
                Manage your email campaigns, templates, and subscriber lists all in one place.
              </p>
              <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
                <div className="rounded-md shadow">
                  <Link href="/campaigns/new">
                    <Button size="lg" className="w-full">
                      <Send className="mr-2 h-5 w-5" />
                      Create Campaign
                    </Button>
                  </Link>
                </div>
                <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
                  <Link href="/contacts/new">
                    <Button variant="outline" size="lg" className="w-full">
                      <Users className="mr-2 h-5 w-5" />
                      Add Contact
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DashboardStats stats={stats} />

          {/* Quick Actions */}
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Link href="/contacts" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Manage Contacts</h3>
                    <p className="text-gray-600 text-sm">View and organize your subscriber list</p>
                  </div>
                </div>
              </Link>

              <Link href="/templates" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <Mail className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Email Templates</h3>
                    <p className="text-gray-600 text-sm">Create and manage email templates</p>
                  </div>
                </div>
              </Link>

              <Link href="/campaigns" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <Send className="h-8 w-8 text-purple-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Campaigns</h3>
                    <p className="text-gray-600 text-sm">View and manage your campaigns</p>
                  </div>
                </div>
              </Link>

              <Link href="/settings" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <TrendingUp className="h-8 w-8 text-orange-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Settings</h3>
                    <p className="text-gray-600 text-sm">Configure your email settings</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Campaigns */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Recent Campaigns</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {campaigns.slice(0, 5).map((campaign) => (
                  <div key={campaign.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{campaign.metadata.name}</h4>
                        <p className="text-sm text-gray-500">
                          Status: <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            campaign.metadata.status.value === 'Sent' 
                              ? 'bg-green-100 text-green-800'
                              : campaign.metadata.status.value === 'Draft'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {campaign.metadata.status.value}
                          </span>
                        </p>
                      </div>
                      <Link href={`/campaigns/${campaign.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                    </div>
                  </div>
                ))}
                {campaigns.length === 0 && (
                  <div className="p-6 text-center text-gray-500">
                    <Send className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No campaigns yet</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by creating your first campaign.</p>
                    <div className="mt-6">
                      <Link href="/campaigns/new">
                        <Button size="sm">
                          <Send className="mr-2 h-4 w-4" />
                          Create Campaign
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Templates */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Email Templates</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {templates.slice(0, 5).map((template) => (
                  <div key={template.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{template.metadata.name}</h4>
                        <p className="text-sm text-gray-500">
                          Type: {template.metadata.template_type.value}
                        </p>
                      </div>
                      <Link href={`/templates/${template.id}/edit`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="p-6 text-center text-gray-500">
                    <Mail className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No templates yet</h3>
                    <p className="mt-1 text-sm text-gray-500">Create your first email template to get started.</p>
                    <div className="mt-6">
                      <Link href="/templates/new">
                        <Button size="sm">
                          <Mail className="mr-2 h-4 w-4" />
                          Create Template
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    console.error('Error loading dashboard:', error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Dashboard Error</h1>
          <p className="text-gray-600 mb-6">There was an error loading the dashboard. Please try again.</p>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    )
  }
}