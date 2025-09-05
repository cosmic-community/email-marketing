'use client'

import { MarketingCampaign } from '@/types'

interface CampaignProgressProps {
  campaign: MarketingCampaign & {
    metadata: MarketingCampaign['metadata'] & {
      total_recipients?: number
      current_batch?: number
      batch_size?: number
      last_batch_sent_at?: string
      error_log?: Array<{
        timestamp: string
        batch: number
        error: string
        retry_count: number
      }>
    }
  }
}

export default function CampaignProgress({ campaign }: CampaignProgressProps) {
  const totalRecipients = campaign.metadata?.total_recipients || 0
  const currentBatch = campaign.metadata?.current_batch || 0
  const batchSize = campaign.metadata?.batch_size || 100
  const sentCount = campaign.metadata?.stats?.sent || 0
  const status = campaign.metadata?.status?.value
  
  // Calculate progress
  const progress = totalRecipients > 0 ? (sentCount / totalRecipients) * 100 : 0
  const remainingRecipients = Math.max(0, totalRecipients - sentCount)
  
  const getStatusColor = () => {
    switch (status) {
      case 'Sending':
        return 'bg-blue-500'
      case 'Sent':
        return 'bg-green-500'
      case 'Paused':
        return 'bg-yellow-500'
      case 'Cancelled':
        return 'bg-red-500'
      default:
        return 'bg-gray-300'
    }
  }

  const formatLastSent = () => {
    const lastSent = campaign.metadata?.last_batch_sent_at
    if (!lastSent) return 'Not started'
    
    const date = new Date(lastSent)
    return date.toLocaleString()
  }

  if (status === 'Draft' || status === 'Scheduled') {
    return (
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Campaign Status</h3>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
          <span className="text-gray-600">{status}</span>
        </div>
        {status === 'Scheduled' && (
          <p className="mt-2 text-sm text-gray-600">
            Scheduled for: {campaign.metadata?.send_date ? 
              new Date(campaign.metadata.send_date).toLocaleString() : 'Not set'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Campaign Progress</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 ${getStatusColor()} rounded-full`}></div>
          <span className="font-medium text-gray-900">{status}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progress</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              status === 'Sent' ? 'bg-green-500' : 
              status === 'Sending' ? 'bg-blue-500' : 'bg-gray-400'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{sentCount}</div>
          <div className="text-sm text-gray-600">Sent</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{remainingRecipients}</div>
          <div className="text-sm text-gray-600">Remaining</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{totalRecipients}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{currentBatch}</div>
          <div className="text-sm text-gray-600">Batches</div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Batch size:</span>
          <span className="font-medium">{batchSize} contacts</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Last batch sent:</span>
          <span className="font-medium">{formatLastSent()}</span>
        </div>
        {campaign.metadata?.batch_delay_minutes && (
          <div className="flex justify-between">
            <span className="text-gray-600">Batch delay:</span>
            <span className="font-medium">{campaign.metadata.batch_delay_minutes} minutes</span>
          </div>
        )}
      </div>

      {/* Error Log */}
      {campaign.metadata?.error_log && campaign.metadata.error_log.length > 0 && (
        <div className="mt-4 p-3 bg-red-50 rounded-md">
          <h4 className="text-sm font-medium text-red-900 mb-2">Recent Errors</h4>
          <div className="space-y-1">
            {campaign.metadata.error_log.slice(-3).map((error, index) => (
              <div key={index} className="text-xs text-red-700">
                <span className="font-medium">Batch {error.batch}:</span> {error.error}
                <span className="text-red-600 ml-2">
                  ({new Date(error.timestamp).toLocaleString()})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}