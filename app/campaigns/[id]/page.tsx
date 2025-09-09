// app/campaigns/[id]/page.tsx
import { getMarketingCampaign, getEmailTemplate, getEmailContacts } from '@/lib/cosmic'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Calendar, 
  Users, 
  Mail, 
  BarChart3, 
  Edit, 
  Send,
  Eye,
  MousePointer,
  UserMinus,
  AlertTriangle,
  CheckCircle,
  Clock,
  Tag
} from 'lucide-react'
import Link from 'next/link'
import { formatDate, formatDateTime } from '@/lib/utils'
import SendCampaignButton from '@/components/SendCampaignButton'
import TestEmailModal from '@/components/TestEmailModal'
import DeleteCampaignButton from '@/components/DeleteCampaignButton'
import { EmailContact, EmailTemplate } from '@/types'

interface CampaignPageProps {
  params: Promise<{ id: string }>
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params
  
  const campaign = await getMarketingCampaign(id)
  if (!campaign) {
    notFound()
  }

  // Get the template details
  let template: EmailTemplate | null = null
  if (campaign.metadata.template) {
    const templateId = typeof campaign.metadata.template === 'string' 
      ? campaign.metadata.template 
      : campaign.metadata.template.id
    
    template = await getEmailTemplate(templateId)
  }

  // Get target contacts - FIX: Extract contacts array from paginated response
  let targetContacts: EmailContact[] = []
  if (campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0) {
    const contactsResponse = await getEmailContacts() // This returns PaginatedContactsResponse
    const allContacts = contactsResponse.contacts // Extract the contacts array
    
    targetContacts = allContacts.filter(contact => 
      campaign.metadata.target_contacts?.includes(contact.id)
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'bg-gray-100 text-gray-800'
      case 'Scheduled':
        return 'bg-blue-100 text-blue-800'
      case 'Sending':
        return 'bg-orange-100 text-orange-800'
      case 'Sent':
        return 'bg-green-100 text-green-800'
      case 'Cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Draft':
        return <Edit className="h-4 w-4" />
      case 'Scheduled':
        return <Clock className="h-4 w-4" />
      case 'Sending':
        return <Send className="h-4 w-4" />
      case 'Sent':
        return <CheckCircle className="h-4 w-4" />
      case 'Cancelled':
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <Edit className="h-4 w-4" />
    }
  }

  const stats = campaign.metadata.stats || {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
    open_rate: '0%',
    click_rate: '0%'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{campaign.metadata.name}</h1>
                <p className="text-gray-600 mt-1">Campaign Details & Performance</p>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(campaign.metadata.status.value)}
                <Badge className={getStatusColor(campaign.metadata.status.value)}>
                  {campaign.metadata.status.value}
                </Badge>
              </div>
            </div>
            <div className="flex space-x-3">
              <TestEmailModal 
                campaign={campaign}
                template={template}
              />
              {campaign.metadata.status.value === 'Draft' && (
                <Link href={`/campaigns/${campaign.id}/edit`}>
                  <Button variant="outline">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Campaign
                  </Button>
                </Link>
              )}
              {(campaign.metadata.status.value === 'Draft' || campaign.metadata.status.value === 'Scheduled') && (
                <SendCampaignButton 
                  campaign={campaign}
                  targetContacts={targetContacts}
                />
              )}
              <DeleteCampaignButton campaignId={campaign.id} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="targeting">Targeting</TabsTrigger>
            <TabsTrigger value="template">Template</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Campaign Info */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Mail className="mr-2 h-5 w-5" />
                    Campaign Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Campaign Name</label>
                    <p className="text-gray-900">{campaign.metadata.name}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <div className="mt-1">
                      <Badge className={getStatusColor(campaign.metadata.status.value)}>
                        {campaign.metadata.status.value}
                      </Badge>
                    </div>
                  </div>

                  {campaign.metadata.send_date && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        {campaign.metadata.status.value === 'Sent' ? 'Sent Date' : 'Scheduled Date'}
                      </label>
                      <p className="text-gray-900 flex items-center">
                        <Calendar className="mr-2 h-4 w-4" />
                        {formatDate(campaign.metadata.send_date)}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-gray-500">Created</label>
                    <p className="text-gray-900">{formatDateTime(campaign.created_at)}</p>
                  </div>

                  {campaign.modified_at !== campaign.created_at && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Last Modified</label>
                      <p className="text-gray-900">{formatDateTime(campaign.modified_at)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="mr-2 h-5 w-5" />
                    Quick Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.sent || 0}</div>
                    <div className="text-sm text-gray-500">Emails Sent</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.delivered || 0}</div>
                    <div className="text-sm text-gray-500">Delivered</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{stats.open_rate || '0%'}</div>
                    <div className="text-sm text-gray-500">Open Rate</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Targeting Tab */}
          <TabsContent value="targeting">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Target Contacts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="mr-2 h-5 w-5" />
                    Target Contacts
                    <Badge variant="secondary" className="ml-2">{targetContacts.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {targetContacts.length > 0 ? (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {targetContacts.map((contact) => (
                        <div key={contact.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div>
                            <p className="font-medium">{contact.metadata.first_name} {contact.metadata.last_name}</p>
                            <p className="text-sm text-gray-500">{contact.metadata.email}</p>
                          </div>
                          <Badge 
                            className={
                              contact.metadata.status.value === 'Active' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }
                          >
                            {contact.metadata.status.value}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">No specific contacts targeted</p>
                  )}
                </CardContent>
              </Card>

              {/* Target Tags */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Tag className="mr-2 h-5 w-5" />
                    Target Tags
                    <Badge variant="secondary" className="ml-2">
                      {campaign.metadata.target_tags?.length || 0}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {campaign.metadata.target_tags.map((tag, index) => (
                        <Badge key={index} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">No specific tags targeted</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Template Tab */}
          <TabsContent value="template">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Mail className="mr-2 h-5 w-5" />
                  Email Template
                </CardTitle>
              </CardHeader>
              <CardContent>
                {template ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Template Name</label>
                      <p className="text-gray-900">{template.metadata.name}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-500">Subject Line</label>
                      <p className="text-gray-900">{template.metadata.subject}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-500">Template Type</label>
                      <Badge variant="outline">{template.metadata.template_type.value}</Badge>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-500">Email Content Preview</label>
                      <div 
                        className="mt-2 p-4 bg-gray-50 rounded border max-h-96 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: template.metadata.content }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">Template not found or not selected</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              {/* Sent */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Send className="h-8 w-8 text-blue-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Sent</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.sent || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Opened */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Eye className="h-8 w-8 text-green-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Opened</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.opened || 0}</p>
                      <p className="text-xs text-gray-500">{stats.open_rate}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Clicked */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <MousePointer className="h-8 w-8 text-purple-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Clicked</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.clicked || 0}</p>
                      <p className="text-xs text-gray-500">{stats.click_rate}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Unsubscribed */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <UserMinus className="h-8 w-8 text-red-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Unsubscribed</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.unsubscribed || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sending Progress (if campaign is currently sending) */}
            {campaign.metadata.status.value === 'Sending' && campaign.metadata.sending_progress && (
              <Card>
                <CardHeader>
                  <CardTitle>Sending Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{campaign.metadata.sending_progress.progress_percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${campaign.metadata.sending_progress.progress_percentage}%` }}
                      ></div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-green-600">{campaign.metadata.sending_progress.sent}</p>
                        <p className="text-sm text-gray-500">Sent</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600">{campaign.metadata.sending_progress.failed}</p>
                        <p className="text-sm text-gray-500">Failed</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-600">{campaign.metadata.sending_progress.total}</p>
                        <p className="text-sm text-gray-500">Total</p>
                      </div>
                    </div>
                    {campaign.metadata.sending_progress.last_batch_completed && (
                      <p className="text-xs text-gray-500 mt-2">
                        Last batch completed: {formatDateTime(campaign.metadata.sending_progress.last_batch_completed)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}