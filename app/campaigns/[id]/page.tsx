// app/campaigns/[id]/page.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMarketingCampaign, getEmailTemplate, getCampaignTargetContacts, getEmailLists } from '@/lib/cosmic'
import { MarketingCampaign, EmailTemplate, EmailContact, EmailList } from '@/types'
import SendCampaignButton from '@/components/SendCampaignButton'
import DeleteCampaignButton from '@/components/DeleteCampaignButton'
import TestEmailModal from '@/components/TestEmailModal'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface CampaignPageProps {
  params: Promise<{ id: string }>
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params
  
  const campaign = await getMarketingCampaign(id)
  
  if (!campaign) {
    notFound()
  }

  // Get template details if template ID is available
  let template: EmailTemplate | null = null
  if (campaign.metadata.template && typeof campaign.metadata.template === 'string') {
    template = await getEmailTemplate(campaign.metadata.template)
  } else if (campaign.metadata.template && typeof campaign.metadata.template === 'object') {
    template = campaign.metadata.template as EmailTemplate
  }

  // Get target contacts
  let targetContacts: EmailContact[] = []
  try {
    targetContacts = await getCampaignTargetContacts(campaign)
  } catch (error) {
    console.error('Error fetching target contacts:', error)
  }

  // Get all lists to resolve list names for display and links
  const allLists = await getEmailLists()
  const listMap = new Map(allLists.map(list => [list.id, list]))

  // Get list details for selected lists - with proper null handling
  const selectedLists = campaign.metadata.target_lists?.map(listRef => {
    const listId = typeof listRef === 'string' ? listRef : listRef.id
    return listMap.get(listId)
  }).filter((list): list is EmailList => list !== undefined) || []

  const statusColor = {
    'Draft': 'bg-gray-100 text-gray-800',
    'Scheduled': 'bg-blue-100 text-blue-800', 
    'Sending': 'bg-yellow-100 text-yellow-800',
    'Sent': 'bg-green-100 text-green-800',
    'Cancelled': 'bg-red-100 text-red-800'
  }[campaign.metadata.status.value] || 'bg-gray-100 text-gray-800'

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <Link 
                href="/campaigns"
                className="text-sm font-medium text-gray-500 hover:text-gray-700 mb-2 inline-block"
              >
                ← Back to Campaigns
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">{campaign.metadata.name}</h1>
              <div className="mt-2 flex items-center space-x-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
                  {campaign.metadata.status.value}
                </span>
                {campaign.metadata.send_date && (
                  <span className="text-sm text-gray-500">
                    Scheduled: {new Date(campaign.metadata.send_date).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex space-x-3">
              <TestEmailModal 
                campaignId={campaign.id} 
                campaignName={campaign.metadata.name}
              />
              <SendCampaignButton campaign={campaign} />
              <Link 
                href={`/campaigns/${campaign.id}/edit`}
                className="btn-outline"
              >
                Edit Campaign
              </Link>
              <DeleteCampaignButton 
                campaignId={campaign.id}
                campaignName={campaign.metadata.name}
                isDraft={campaign.metadata.status.value === 'Draft'}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Campaign Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Campaign Details</h2>
              
              <div className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Campaign Name</dt>
                  <dd className="mt-1 text-sm text-gray-900">{campaign.metadata.name}</dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Template</dt>
                  <dd className="mt-1">
                    {template ? (
                      <Link 
                        href={`/templates/${template.id}/edit`}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        {template.metadata.name}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-500">No template selected</span>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-medium text-gray-500">Subject Line</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {campaign.metadata.template_snapshot?.subject || template?.metadata.subject || 'No subject'}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-medium text-gray-500">Target Recipients</dt>
                  <dd className="mt-1 text-sm text-gray-900">{targetContacts.length} contacts</dd>
                </div>

                {campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Target Tags</dt>
                    <dd className="mt-1">
                      <div className="flex flex-wrap gap-2">
                        {campaign.metadata.target_tags.map((tag, index) => (
                          <span 
                            key={index}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </dd>
                  </div>
                )}

                {selectedLists.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      Selected Lists ({selectedLists.length}):
                    </dt>
                    <dd className="mt-1">
                      <div className="flex flex-wrap gap-2">
                        {selectedLists.map((list) => (
                          <Link
                            key={list.id}
                            href={`/contacts?list_id=${list.id}`}
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                          >
                            {list.metadata.name}
                          </Link>
                        ))}
                      </div>
                    </dd>
                  </div>
                )}
              </div>
            </div>

            {/* Campaign Statistics */}
            {campaign.metadata.stats && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Campaign Statistics</h2>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{campaign.metadata.stats.sent || 0}</div>
                    <div className="text-sm text-gray-500">Sent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{campaign.metadata.stats.opened || 0}</div>
                    <div className="text-sm text-gray-500">Opened</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{campaign.metadata.stats.clicked || 0}</div>
                    <div className="text-sm text-gray-500">Clicked</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{campaign.metadata.stats.bounced || 0}</div>
                    <div className="text-sm text-gray-500">Bounced</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-gray-900">{campaign.metadata.stats.open_rate || '0%'}</div>
                    <div className="text-sm text-gray-500">Open Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-gray-900">{campaign.metadata.stats.click_rate || '0%'}</div>
                    <div className="text-sm text-gray-500">Click Rate</div>
                  </div>
                </div>
              </div>
            )}

            {/* Sending Progress */}
            {campaign.metadata.sending_progress && campaign.metadata.status.value === 'Sending' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending Progress</h2>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm font-medium text-gray-900 mb-1">
                      <span>Progress</span>
                      <span>{campaign.metadata.sending_progress.progress_percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${campaign.metadata.sending_progress.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-green-600">{campaign.metadata.sending_progress.sent}</div>
                      <div className="text-sm text-gray-500">Sent</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-red-600">{campaign.metadata.sending_progress.failed}</div>
                      <div className="text-sm text-gray-500">Failed</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-600">{campaign.metadata.sending_progress.total}</div>
                      <div className="text-sm text-gray-500">Total</div>
                    </div>
                  </div>

                  {campaign.metadata.sending_progress.last_updated && (
                    <div className="text-xs text-gray-500">
                      Last updated: {new Date(campaign.metadata.sending_progress.last_updated).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Template Preview */}
            {template && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Template Preview</h3>
                
                <div className="border rounded-lg p-4 bg-gray-50 max-h-64 overflow-y-auto">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900 mb-2">
                      Subject: {campaign.metadata.template_snapshot?.subject || template.metadata.subject}
                    </div>
                    <div 
                      className="text-gray-700 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ 
                        __html: campaign.metadata.template_snapshot?.content || template.metadata.content 
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <Link 
                    href={`/templates/${template.id}/edit`}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Edit Template →
                  </Link>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              
              <div className="space-y-3">
                <Link 
                  href={`/campaigns/${campaign.id}/edit`}
                  className="w-full btn-outline text-center"
                >
                  Edit Campaign
                </Link>
                
                <Link 
                  href="/campaigns/new"
                  className="w-full btn-outline text-center"
                >
                  Duplicate Campaign
                </Link>
                
                <Link 
                  href="/contacts?list_id=all"
                  className="w-full btn-outline text-center"
                >
                  View All Contacts
                </Link>
                
                <Link 
                  href="/templates"
                  className="w-full btn-outline text-center"
                >
                  Browse Templates
                </Link>
              </div>
            </div>

            {/* Campaign Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Campaign Info</h3>
              
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="text-sm text-gray-900">{new Date(campaign.created_at).toLocaleDateString()}</dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Modified</dt>
                  <dd className="text-sm text-gray-900">{new Date(campaign.modified_at).toLocaleDateString()}</dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Campaign ID</dt>
                  <dd className="text-sm text-gray-900 font-mono">{campaign.id}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}