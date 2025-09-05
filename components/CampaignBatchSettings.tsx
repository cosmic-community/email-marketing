'use client'

interface CampaignBatchSettingsProps {
  batchSize: number
  batchDelayMinutes: number
  priority: string
  onBatchSizeChange: (size: number) => void
  onBatchDelayChange: (delay: number) => void
  onPriorityChange: (priority: string) => void
  disabled?: boolean
}

export default function CampaignBatchSettings({
  batchSize,
  batchDelayMinutes,
  priority,
  onBatchSizeChange,
  onBatchDelayChange,
  onPriorityChange,
  disabled = false
}: CampaignBatchSettingsProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Batch Processing Settings</h3>
      <p className="text-sm text-gray-600">
        Configure how your campaign will be sent to handle large recipient lists efficiently.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Batch Size */}
        <div>
          <label htmlFor="batch_size" className="block text-sm font-medium text-gray-700 mb-2">
            Batch Size
          </label>
          <select
            id="batch_size"
            value={batchSize}
            onChange={(e) => onBatchSizeChange(Number(e.target.value))}
            className="form-input"
            disabled={disabled}
          >
            <option value={50}>50 contacts</option>
            <option value={100}>100 contacts</option>
            <option value={250}>250 contacts</option>
            <option value={500}>500 contacts</option>
            <option value={1000}>1,000 contacts</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Number of emails sent in each batch
          </p>
        </div>

        {/* Batch Delay */}
        <div>
          <label htmlFor="batch_delay" className="block text-sm font-medium text-gray-700 mb-2">
            Delay Between Batches
          </label>
          <select
            id="batch_delay"
            value={batchDelayMinutes}
            onChange={(e) => onBatchDelayChange(Number(e.target.value))}
            className="form-input"
            disabled={disabled}
          >
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Wait time between sending batches
          </p>
        </div>

        {/* Priority */}
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => onPriorityChange(e.target.value)}
            className="form-input"
            disabled={disabled}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Campaign processing priority
          </p>
        </div>
      </div>

      {/* Estimated Send Time */}
      <div className="mt-4 p-3 bg-blue-50 rounded-md">
        <h4 className="text-sm font-medium text-blue-900 mb-1">Estimated Send Time</h4>
        <p className="text-sm text-blue-700">
          For large campaigns (10,000+ recipients), sending will be distributed over time to maintain deliverability.
          The cron job will process batches automatically every few minutes.
        </p>
      </div>
    </div>
  )
}