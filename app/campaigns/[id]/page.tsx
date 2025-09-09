// app/campaigns/[id]/page.tsx
import { notFound } from 'next/navigation'
import { getMarketingCampaign, getEmailTemplate, getEmailContacts } from '@/lib/cosmic'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarIcon, UsersIcon, TagIcon, MailIcon, BarChart3Icon } from 'lucide-react'
import TestEmailModal from '@/components/TestEmailModal'
import SendCampaignButton from '@/components/SendCampaignButton'
import DeleteCampaignButton from '@/components/DeleteCampaignButton'
import Link from 'next/link'
import { formatDate, formatDateTime } from '@/lib/utils'

interface CampaignPageProps {
  params: Promise<{ id: string }>
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params
  
  // Fetch campaign data
  const campaign = await getMarketingCampaign(id)
  
  if (!campaign) {
    notFound()
  }

  // Fetch associated template
  let template = null
  if (campaign.metadata.template && typeof campaign.metadata.template === 'string') {
    template = await getEmailTemplate(campaign.metadata.template)
  }

  // Get target contacts for display
  let targetContacts: any[] = []
  if (campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0) {
    // Get contacts by IDs - we need to fetch all contacts and filter
    const allContacts = await getEmailContacts({ page: 1, limit: 1000 })
    targetContacts = allContacts.contacts.filter(contact => 
      campaign.metadata.target_contacts?.includes(contact.id)
    )
  }

  // If targeting by tags, get contacts with those tags
  if (campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0) {
    const allContacts = await getEmailContacts({ page: 1, limit: 1000 })
    const taggedContacts = allContacts.contacts.filter(contact => {
      const contactTags = contact.metadata.tags || []
      return campaign.metadata.target_tags?.some(tag => contactTags.includes(tag))
    })
    
    // Merge with existing contacts, avoiding duplicates
    const existingIds = new Set(targetContacts.map(c => c.id))
    const newTaggedContacts = taggedContacts.filter(c => !existingIds.has(c.id))
    targetContacts = [...targetContacts, ...newTaggedContacts]
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'bg-gray-100 text-gray-800'
      case 'Scheduled':
        return 'bg-blue-100 text-blue-800'
      case 'Sending':
        return 'bg-yellow-100 text-yellow-800'
      case 'Sent':
        return 'bg-green-100 text-green-800'
      case 'Cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const activeTargetContacts = targetContacts.filter(contact => 
    contact.metadata.status.value === 'Active'
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <Link href="/campaigns">
                <Button variant="outline" size="sm">
                  ← Back to Campaigns
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{campaign.metadata.name}</h1>
                <p className="text-gray-600 mt-1">Campaign Details</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Badge className={getStatusColor(campaign.metadata.status.value)}>
                {campaign.metadata.status.value}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column - Campaign Details */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Campaign Information */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Campaign Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Campaign Name
                  </label>
                  <p className="text-lg text-gray-900">{campaign.metadata.name}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <Badge className={getStatusColor(campaign.metadata.status.value)}>
                    {campaign.metadata.status.value}
                  </Badge>
                </div>
                
                {campaign.metadata.send_date && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                      <CalendarIcon className="w-4 h-4 mr-1" />
                      Send Date
                    </label>
                    <p className="text-gray-900">{formatDate(campaign.metadata.send_date)}</p>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Created
                  </label>
                  <p className="text-gray-900">{formatDateTime(campaign.created_at)}</p>
                </div>
              </div>
            </Card>

            {/* Template Information */}
            {template && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <MailIcon className="w-5 h-5 mr-2" />
                  Email Template
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Template Name
                    </label>
                    <p className="text-lg text-gray-900">{template.metadata.name}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject Line
                    </label>
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg border">
                      {template.metadata.subject}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Template Type
                    </label>
                    <Badge variant="secondary">
                      {template.metadata.template_type.value}
                    </Badge>
                  </div>
                </div>
              </Card>
            )}

            {/* Campaign Statistics */}
            {campaign.metadata.stats && campaign.metadata.status.value === 'Sent' && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <BarChart3Icon className="w-5 h-5 mr-2" />
                  Campaign Statistics
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {campaign.metadata.stats.sent || 0}
                    </div>
                    <div className="text-sm text-gray-500">Sent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {campaign.metadata.stats.opened || 0}
                    </div>
                    <div className="text-sm text-gray-500">Opened</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {campaign.metadata.stats.open_rate || '0%'}
                    </div>
                    <div className="text-sm text-gray-500">Open Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {campaign.metadata.stats.clicked || 0}
                    </div>
                    <div className="text-sm text-gray-500">Clicked</div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Right Column - Targeting & Actions */}
          <div className="space-y-6">
            
            {/* Targeting Information */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <UsersIcon className="w-5 h-5 mr-2" />
                Targeting
              </h2>
              <div className="space-y-4">
                
                {/* Target Contacts */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Contacts
                  </label>
                  <p className="text-lg font-semibold text-gray-900">
                    {activeTargetContacts.length} active contacts
                  </p>
                  <p className="text-sm text-gray-500">
                    {targetContacts.length} total contacts selected
                  </p>
                </div>

                {/* Target Tags */}
                {campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <TagIcon className="w-4 h-4 mr-1" />
                      Target Tags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {campaign.metadata.target_tags.map((tag, index) => (
                        <Badge key={index} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Actions */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Actions</h2>
              <div className="space-y-3">
                
                {/* Test Email */}
                <TestEmailModal 
                  campaignId={campaign.id}
                  campaign={campaign}
                  template={template}
                />

                {/* Send Campaign */}
                <SendCampaignButton 
                  campaign={campaign}
                  contactCount={activeTargetContacts.length}
                />

                {/* Edit Campaign */}
                <Link href={`/campaigns/${campaign.id}/edit`}>
                  <Button variant="outline" className="w-full">
                    Edit Campaign
                  </Button>
                </Link>

                {/* Delete Campaign */}
                <DeleteCampaignButton 
                  campaignId={campaign.id}
                  campaignName={campaign.metadata.name}
                  isDraft={campaign.metadata.status.value === 'Draft'}
                />
              </div>
            </Card>

            {/* Sending Progress (if sending) */}
            {campaign.metadata.sending_progress && campaign.metadata.status.value === 'Sending' && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Sending Progress</h2>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{campaign.metadata.sending_progress.progress_percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${campaign.metadata.sending_progress.progress_percentage}%` }}
                    ></div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {campaign.metadata.sending_progress.sent} of {campaign.metadata.sending_progress.total} sent
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}