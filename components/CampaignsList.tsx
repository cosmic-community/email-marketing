'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MarketingCampaign } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import ConfirmationModal from '@/components/ConfirmationModal'
import TimeAgo from '@/components/TimeAgo'
import { Eye, Edit, Calendar, Mail, TrendingUp, Copy, MoreVertical, Clock } from 'lucide-react'

interface CampaignsListProps {
  campaigns: MarketingCampaign[]
}

export default function CampaignsList({ campaigns }: CampaignsListProps) {
  const router = useRouter()
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState<MarketingCampaign | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showActionsId, setShowActionsId] = useState<string | null>(null)

  const handleDuplicateCampaign = async (campaign: MarketingCampaign) => {
    setDuplicatingId(campaign.id)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to duplicate campaign')
      }

      const result = await response.json()
      setSuccess(`Campaign "${campaign.metadata?.name}" duplicated successfully!`)
      
      // Force refresh to get the latest data immediately
      router.refresh()
      
      // Additional refresh after a delay to ensure the new campaign appears
      setTimeout(() => {
        router.refresh()
      }, 1500)

    } catch (error: any) {
      setError(error.message || 'Failed to duplicate campaign')
    } finally {
      setDuplicatingId(null)
      setShowDuplicateConfirm(null)
      setShowActionsId(null)
    }
  }

  const handleDuplicate = (e: React.MouseEvent, campaign: MarketingCampaign) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDuplicateConfirm(campaign)
    setShowActionsId(null)
  }

  const toggleActions = (e: React.MouseEvent, campaignId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setShowActionsId(showActionsId === campaignId ? null : campaignId)
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12">
        <Mail className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No campaigns</h3>
        <p className="mt-1 text-sm text-gray-500">Get started by creating a new email campaign.</p>
        <div className="mt-6">
          <Link href="/campaigns/new">
            <Button>Create Campaign</Button>
          </Link>
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'Scheduled':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'Sending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'Sent':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'Cancelled':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return 'Invalid date'
    }
  }

  // Changed: New function to format time
  const formatTime = (dateString: string) => {
    if (!dateString) return ''
    try {
      return new Date(dateString).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } catch {
      return ''
    }
  }

  // Changed: New function to format both date and time
  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'Not scheduled'
    try {
      const date = new Date(dateString)
      const dateStr = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      return `${dateStr} at ${timeStr}`
    } catch {
      return 'Invalid date'
    }
  }

  const getSentDate = (campaign: MarketingCampaign) => {
    // For sent campaigns, we can use the modified_at date as an approximation
    // or look for a specific sent_at field if it exists in the campaign stats
    if (campaign.metadata.status.value === 'Sent') {
      // If there's a specific sent date in stats or metadata, use that
      if (campaign.metadata.stats && campaign.metadata.sending_progress?.last_updated) {
        return campaign.metadata.sending_progress.last_updated
      }
      // Otherwise use the modified date as an approximation
      return campaign.modified_at
    }
    return null
  }

  const canDuplicate = (campaign: MarketingCampaign) => {
    // Allow duplication for all campaigns except those currently sending
    return campaign.metadata.status.value !== 'Sending'
  }

  return (
    <div className="space-y-4">
      {/* Success/Error Messages */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-600">{success}</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {campaigns.map((campaign) => {
        const sentDate = getSentDate(campaign)
        
        return (
          <div key={campaign.id} className="relative">
            <Link href={`/campaigns/${campaign.id}`} className="block">
              <Card className="hover:shadow-md transition-shadow duration-200 border-l-4 border-l-slate-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    {/* Campaign Info - Left Side */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {campaign.metadata.name}
                        </h3>
                        <Badge 
                          variant="outline" 
                          className={`${getStatusColor(campaign.metadata.status.value)} text-xs font-medium px-2 py-1`}
                        >
                          {campaign.metadata.status.value}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center space-x-6 text-sm text-gray-600">
                        {campaign.metadata.status.value === 'Sent' && sentDate ? (
                          <div className="flex items-center space-x-1">
                            <Clock className="h-4 w-4" />
                            <span>
                              Sent <TimeAgo date={sentDate} />
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-4 w-4" />
                            {/* Changed: Show both date and time for scheduled campaigns */}
                            <span>{formatDateTime(campaign.metadata.send_date || '')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats - Right Side */}
                    <div className="flex items-center space-x-8 ml-6">
                      {campaign.metadata.status.value === 'Sent' && campaign.metadata.stats ? (
                        <>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-900">
                              {campaign.metadata.stats.sent || 0}
                            </div>
                            <div className="text-xs text-gray-500">sent</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              {campaign.metadata.stats.click_rate || '0%'}
                            </div>
                            <div className="text-xs text-gray-500">click rate</div>
                          </div>
                        </>
                      ) : (
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-400">—</div>
                          <div className="text-xs text-gray-500">no stats yet</div>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        
                        {/* Actions Dropdown */}
                        <div className="relative">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => toggleActions(e, campaign.id)}
                            className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                          
                          {showActionsId === campaign.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                              <div className="py-1">
                                {canDuplicate(campaign) && (
                                  <button
                                    onClick={(e) => handleDuplicate(e, campaign)}
                                    disabled={duplicatingId === campaign.id}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                  >
                                    {duplicatingId === campaign.id ? (
                                      <>
                                        <LoadingSpinner size="sm" className="mr-3" />
                                        <span>Duplicating...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-4 w-4 mr-3" />
                                        <span>Duplicate Campaign</span>
                                      </>
                                    )}
                                  </button>
                                )}
                                <Link
                                  href={`/campaigns/${campaign.id}`}
                                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Edit className="h-4 w-4 mr-3" />
                                  <span>Edit Campaign</span>
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        )
      })}

      {/* Duplicate Confirmation Modal */}
      {showDuplicateConfirm && (
        <ConfirmationModal
          isOpen={true}
          onOpenChange={(open: boolean) => !open && setShowDuplicateConfirm(null)}
          title="Duplicate Campaign"
          message={`Are you sure you want to duplicate "${showDuplicateConfirm.metadata?.name}"? A copy will be created with "(Copy)" added to the name and set to Draft status.`}
          confirmText="Duplicate Campaign"
          cancelText="Cancel"
          onConfirm={() => handleDuplicateCampaign(showDuplicateConfirm)}
          isLoading={duplicatingId === showDuplicateConfirm.id}
        />
      )}

      {/* Click outside handler for actions dropdown */}
      {showActionsId && (
        <div 
          className="fixed inset-0 z-5" 
          onClick={() => setShowActionsId(null)}
        />
      )}
    </div>
  )
}