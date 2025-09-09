// app/campaigns/[id]/page.tsx
import { notFound } from 'next/navigation'
import { getMarketingCampaign, getEmailTemplate, getEmailContacts } from '@/lib/cosmic'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Calendar, Users, Tag, Template, BarChart3, Edit, Send, TestTube, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { formatDate, formatDateTime } from '@/lib/utils'
import TestEmailModal from '@/components/TestEmailModal'
import SendCampaignButton from '@/components/SendCampaignButton'
import DeleteCampaignButton from '@/components/DeleteCampaignButton'
import { EmailContact } from '@/types'

interface CampaignPageProps {
  params: Promise<{ id: string }>
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params
  
  // Get campaign details
  const campaign = await getMarketingCampaign(id)
  
  if (!campaign) {
    notFound()
  }

  // Get template details
  let template = null
  if (campaign.metadata.template) {
    if (typeof campaign.metadata.template === 'string') {
      template = await getEmailTemplate(campaign.metadata.template)
    } else {
      template = campaign.metadata.template
    }
  }

  // Get target contacts if specified
  const targetContacts: EmailContact[] = []
  if (campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0) {
    const { contacts } = await getEmailContacts({ limit: 1000 })
    const targetIds = campaign.metadata.target_contacts
    targetContacts.push(...contacts.filter(contact => targetIds.includes(contact.id)))
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

  const isDraft = campaign.metadata.status.value === 'Draft'
  const canEdit = campaign.metadata.status.value === 'Draft' || campaign.metadata.status.value === 'Scheduled'
  const canSend = campaign.metadata.status.value === 'Draft' || campaign.metadata.status.value === 'Scheduled'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Link href="/campaigns">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Campaigns
                </Button>
              </Link>
              <div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-3xl font-bold text-gray-900">{campaign.metadata.name}</h1>
                  <Badge className={getStatusColor(campaign.metadata.status.value)}>
                    {campaign.metadata.status.value}
                  </Badge>
                </div>
                <p className="text-gray-600 mt-1">
                  Created on {formatDate(campaign.created_at)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {template && (
                <TestEmailModal 
                  campaignId={campaign.id}
                  template={template}
                />
              )}
              
              {canEdit && (
                <Link href={`/campaigns/${campaign.id}/edit`}>
                  <Button variant="outline" size="sm">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Campaign
                  </Button>
                </Link>
              )}
              
              {canSend && (
                <SendCampaignButton 
                  campaign={campaign}
                />
              )}
              
              <DeleteCampaignButton 
                campaignId={campaign.id}
                campaignName={campaign.metadata.name}
                isDraft={isDraft}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Campaign Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <BarChart3 className="mr-2 h-5 w-5" />
                Campaign Overview
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">
                    {campaign.metadata.stats?.sent || 0}
                  </p>
                  <p className="text-sm text-gray-600">Emails Sent</p>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">
                    {campaign.metadata.stats?.open_rate || '0%'}
                  </p>
                  <p className="text-sm text-gray-600">Open Rate</p>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">
                    {campaign.metadata.stats?.click_rate || '0%'}
                  </p>
                  <p className="text-sm text-gray-600">Click Rate</p>
                </div>
              </div>

              {campaign.metadata.stats && campaign.metadata.stats.sent > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Delivered</p>
                      <p className="font-semibold">{campaign.metadata.stats.delivered || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Opened</p>
                      <p className="font-semibold">{campaign.metadata.stats.opened || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Clicked</p>
                      <p className="font-semibold">{campaign.metadata.stats.clicked || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Bounced</p>
                      <p className="font-semibold">{campaign.metadata.stats.bounced || 0}</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Template Preview */}
            {template && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Template className="mr-2 h-5 w-5" />
                  Email Template
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Template Name</p>
                    <p className="text-gray-900">{template.metadata.name}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-gray-600">Subject Line</p>
                    <p className="text-gray-900">{template.metadata.subject}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-gray-600">Content Preview</p>
                    <div 
                      className="mt-2 p-4 bg-gray-50 rounded-lg max-h-64 overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: template.metadata.content }}
                    />
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Campaign Settings */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Settings</h2>
              
              <div className="space-y-4">
                {campaign.metadata.send_date && (
                  <div className="flex items-center">
                    <Calendar className="mr-3 h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Scheduled Date</p>
                      <p className="text-gray-900">{formatDate(campaign.metadata.send_date)}</p>
                    </div>
                  </div>
                )}
                
                {campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0 && (
                  <div className="flex items-start">
                    <Users className="mr-3 h-4 w-4 text-gray-400 mt-1" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Target Contacts</p>
                      <p className="text-gray-900">{campaign.metadata.target_contacts.length} selected contacts</p>
                    </div>
                  </div>
                )}
                
                {campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0 && (
                  <div className="flex items-start">
                    <Tag className="mr-3 h-4 w-4 text-gray-400 mt-1" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Target Tags</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {campaign.metadata.target_tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Campaign Timeline */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
              
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Campaign Created</p>
                    <p className="text-xs text-gray-500">{formatDateTime(campaign.created_at)}</p>
                  </div>
                </div>
                
                {campaign.modified_at !== campaign.created_at && (
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Last Modified</p>
                      <p className="text-xs text-gray-500">{formatDateTime(campaign.modified_at)}</p>
                    </div>
                  </div>
                )}
                
                {campaign.metadata.status.value === 'Sent' && campaign.metadata.stats?.sent && (
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Campaign Sent</p>
                      <p className="text-xs text-gray-500">{campaign.metadata.stats.sent} emails delivered</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}