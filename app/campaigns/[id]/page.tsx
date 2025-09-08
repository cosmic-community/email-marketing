// app/campaigns/[id]/page.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMarketingCampaign, getEmailTemplates, getEmailContacts } from '@/lib/cosmic'
import EditCampaignForm from '@/components/EditCampaignForm'
import SendCampaignButton from '@/components/SendCampaignButton'
import DeleteCampaignButton from '@/components/DeleteCampaignButton'
import TestEmailModal from '@/components/TestEmailModal'
import { MarketingCampaign, EmailTemplate, EmailContact } from '@/types'
import { Button } from '@/components/ui/button'
import { Mail } from 'lucide-react'

// Force dynamic rendering to ensure this runs on the server
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CampaignDetailsPage({ params }: PageProps) {
  // Await params in Next.js 15+
  const { id } = await params
  
  try {
    // Fetch all data server-side
    const [campaign, templates, contacts] = await Promise.all([
      getMarketingCampaign(id),
      getEmailTemplates(),
      getEmailContacts()
    ])

    if (!campaign) {
      notFound()
    }

    console.log('Campaign data in page:', JSON.stringify(campaign.metadata, null, 2))

    // Generate preview content - prioritize template snapshot for sent campaigns
    const generatePreviewContent = () => {
      // If campaign has been sent, use the template snapshot
      if (campaign.metadata?.status?.value === 'Sent' && campaign.metadata?.template_snapshot) {
        const snapshot = campaign.metadata.template_snapshot
        
        let emailContent = snapshot.content || ''
        let emailSubject = snapshot.subject || ''

        // Replace template variables with sample data
        emailContent = emailContent.replace(/\{\{first_name\}\}/g, 'John')
        emailContent = emailContent.replace(/\{\{last_name\}\}/g, 'Doe')
        emailSubject = emailSubject.replace(/\{\{first_name\}\}/g, 'John')
        emailSubject = emailSubject.replace(/\{\{last_name\}\}/g, 'Doe')

        return { 
          subject: emailSubject, 
          content: emailContent,
          isSnapshot: true,
          snapshotDate: snapshot.snapshot_date
        }
      }

      // For draft campaigns, use current template (existing logic)
      let templateData: EmailTemplate | null = null
      
      // Try to get template from campaign metadata
      if (campaign.metadata?.template && typeof campaign.metadata.template === 'object') {
        templateData = campaign.metadata.template
      } else if (campaign.metadata?.template_id || typeof campaign.metadata?.template === 'string') {
        // Find template by ID from the templates array
        const templateId = campaign.metadata.template_id || campaign.metadata.template
        templateData = templates.find((t: EmailTemplate) => t.id === templateId) || null
      }

      if (!templateData?.metadata) {
        return { subject: 'No template selected', content: 'No template content available', isSnapshot: false }
      }

      let emailContent = templateData.metadata.content || ''
      let emailSubject = templateData.metadata.subject || ''

      // Replace template variables with sample data
      emailContent = emailContent.replace(/\{\{first_name\}\}/g, 'John')
      emailContent = emailContent.replace(/\{\{last_name\}\}/g, 'Doe')
      emailSubject = emailSubject.replace(/\{\{first_name\}\}/g, 'John')
      emailSubject = emailSubject.replace(/\{\{last_name\}\}/g, 'Doe')

      return { subject: emailSubject, content: emailContent, isSnapshot: false }
    }

    const preview = generatePreviewContent()
    const isDraft = campaign.metadata?.status?.value === 'Draft'

    // Calculate recipient count
    const recipientCount = (campaign.metadata?.target_contacts?.length || 0) + 
                          (campaign.metadata?.target_tags?.length || 0)

    // Check if campaign has a template for test email functionality
    const hasTemplate = !!(
      campaign.metadata?.template_id ||
      (campaign.metadata?.template && typeof campaign.metadata.template === 'object')
    )

    // Get template name for the modal
    const getTemplateName = (): string => {
      if (campaign.metadata?.template && typeof campaign.metadata.template === 'object') {
        return campaign.metadata.template.metadata?.name || 'Selected Template'
      } else if (campaign.metadata?.template_id) {
        const template = templates.find((t: EmailTemplate) => t.id === campaign.metadata?.template_id)
        return template?.metadata?.name || 'Selected Template'
      }
      return 'Selected Template'
    }

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <Link href="/campaigns" className="text-primary-600 hover:text-primary-700 mb-2 inline-block">
                  ← Back to Campaigns
                </Link>
                <h1 className="text-3xl font-bold text-gray-900">
                  {campaign.metadata?.name}
                </h1>
                <p className="text-gray-600 mt-1">
                  Campaign Details & Settings
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                  campaign.metadata?.status?.value === 'Sent' 
                    ? 'bg-green-100 text-green-800' 
                    : campaign.metadata?.status?.value === 'Scheduled'
                    ? 'bg-blue-100 text-blue-800'
                    : campaign.metadata?.status?.value === 'Draft'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {campaign.metadata?.status?.value}
                </span>
                {isDraft && (
                  <>
                    <DeleteCampaignButton 
                      campaignId={campaign.id}
                      campaignName={campaign.metadata?.name || 'Campaign'}
                      isDraft={isDraft}
                    />
                    {hasTemplate && (
                      <TestEmailModal
                        campaignId={campaign.id}
                        campaignName={campaign.metadata?.name || 'Campaign'}
                        templateName={getTemplateName()}
                      />
                    )}
                    <SendCampaignButton 
                      campaignId={campaign.id}
                      campaignName={campaign.metadata?.name || 'Campaign'}
                      recipientCount={recipientCount}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Campaign Stats - Removed open stats */}
          {campaign.metadata?.stats && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Campaign Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card">
                  <div className="text-3xl font-bold text-gray-900">
                    {campaign.metadata.stats.sent || 0}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Emails Sent</div>
                </div>
                <div className="card">
                  <div className="text-3xl font-bold text-gray-900">
                    {campaign.metadata.stats.clicked || 0}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Clicked</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {campaign.metadata.stats.click_rate || '0%'} click rate
                  </div>
                </div>
                <div className="card">
                  <div className="text-3xl font-bold text-gray-900">
                    {campaign.metadata.stats.bounced || 0}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Bounced</div>
                </div>
              </div>
            </div>
          )}

          {/* Email Preview */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Email Preview</h2>
              {preview.isSnapshot && (
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    📸 Sent Snapshot
                  </span>
                  {preview.snapshotDate && (
                    <span className="text-xs text-gray-500">
                      Captured: {new Date(preview.snapshotDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {preview.isSnapshot && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">
                  <strong>📸 Snapshot Content:</strong> This shows the exact email content that was sent to recipients. 
                  The original template may have changed since this campaign was sent.
                </p>
              </div>
            )}
            
            <div className="card">
              <div className="border-b border-gray-200 pb-4 mb-6">
                <div className="text-sm text-gray-500 mb-2">Subject Line:</div>
                <div className="text-lg font-semibold text-gray-900">{preview.subject}</div>
              </div>
              
              <div className="text-sm text-gray-500 mb-4">Email Content:</div>
              <div className="border rounded-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <style>
                          body {
                            margin: 0;
                            padding: 20px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            background: #ffffff;
                          }
                          
                          /* Reset styles to prevent interference */
                          * {
                            box-sizing: border-box;
                          }
                          
                          /* Common email styles */
                          table {
                            border-collapse: collapse;
                            width: 100%;
                          }
                          
                          img {
                            max-width: 100%;
                            height: auto;
                          }
                          
                          a {
                            color: #007cba;
                            text-decoration: none;
                          }
                          
                          a:hover {
                            text-decoration: underline;
                          }
                          
                          .container {
                            max-width: 600px;
                            margin: 0 auto;
                          }
                        </style>
                      </head>
                      <body>
                        <div class="container">
                          ${preview.content}
                        </div>
                      </body>
                    </html>
                  `}
                  style={{
                    width: '100%',
                    height: '500px',
                    border: 'none',
                    borderRadius: '4px'
                  }}
                  title="Email Preview"
                />
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> Template variables like {`{{first_name}}`} and {`{{last_name}}`} will be replaced with actual contact data when sent.
                  {preview.isSnapshot && ' This preview shows the exact content that was sent to recipients.'}
                </p>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <EditCampaignForm 
            campaign={campaign} 
            templates={templates} 
            contacts={contacts} 
          />
        </main>
      </div>
    )
  } catch (error) {
    console.error('Failed to load campaign data:', error)
    notFound()
  }
}