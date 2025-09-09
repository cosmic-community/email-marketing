'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Send, Loader2, Calendar, Users, Tag } from 'lucide-react'
import { MarketingCampaign, EmailContact } from '@/types'
import { formatDate } from '@/lib/utils'

export interface SendCampaignButtonProps {
  campaign: MarketingCampaign
}

export default function SendCampaignButton({ campaign }: SendCampaignButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Calculate target count
  const targetContactsCount = campaign.metadata.target_contacts?.length || 0
  const targetTagsCount = campaign.metadata.target_tags?.length || 0

  const handleSend = async () => {
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/send`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send campaign')
      }

      setIsOpen(false)
      router.refresh()
      alert('Campaign sent successfully!')

    } catch (error) {
      console.error('Error sending campaign:', error)
      alert(error instanceof Error ? error.message : 'Failed to send campaign')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSend = campaign.metadata.status.value === 'Draft' || campaign.metadata.status.value === 'Scheduled'

  if (!canSend) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send className="mr-2 h-4 w-4" />
          Send Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Campaign</DialogTitle>
          <DialogDescription>
            Are you sure you want to send "{campaign.metadata.name}" to your selected audience?
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Campaign Details */}
          <div className="bg-gray-50 p-4 rounded-md space-y-2">
            <h4 className="font-medium text-gray-900">Campaign Details</h4>
            
            {targetContactsCount > 0 && (
              <div className="flex items-center text-sm text-gray-600">
                <Users className="mr-2 h-4 w-4" />
                {targetContactsCount} selected contact{targetContactsCount !== 1 ? 's' : ''}
              </div>
            )}
            
            {targetTagsCount > 0 && (
              <div className="flex items-center text-sm text-gray-600">
                <Tag className="mr-2 h-4 w-4" />
                {targetTagsCount} selected tag{targetTagsCount !== 1 ? 's' : ''}: {campaign.metadata.target_tags?.join(', ')}
              </div>
            )}
            
            {campaign.metadata.send_date && (
              <div className="flex items-center text-sm text-gray-600">
                <Calendar className="mr-2 h-4 w-4" />
                Scheduled for: {formatDate(campaign.metadata.send_date)}
              </div>
            )}
            
            {!targetContactsCount && !targetTagsCount && (
              <div className="text-sm text-orange-600">
                ⚠️ No target contacts or tags selected
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md">
            <p className="text-sm text-yellow-800">
              <strong>Warning:</strong> Once sent, this campaign cannot be modified or cancelled. 
              Make sure you've reviewed the content and target audience.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSubmitting || (!targetContactsCount && !targetTagsCount)}
            className="min-w-[120px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Now
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}