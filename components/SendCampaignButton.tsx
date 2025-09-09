'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Send, Loader2, Users, Calendar } from 'lucide-react'
import { MarketingCampaign, EmailContact } from '@/types'

interface SendCampaignButtonProps {
  campaign: MarketingCampaign;
  contactCount?: number;
}

export default function SendCampaignButton({ campaign, contactCount }: SendCampaignButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const canSend = campaign.metadata.status.value === 'Draft' || campaign.metadata.status.value === 'Scheduled'
  const hasTargets = (campaign.metadata.target_contacts && campaign.metadata.target_contacts.length > 0) ||
                    (campaign.metadata.target_tags && campaign.metadata.target_tags.length > 0)

  const handleSend = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/send`, {
        method: 'POST'
      })

      if (response.ok) {
        setIsOpen(false)
        router.refresh()
      } else {
        const error = await response.json()
        alert(`Failed to send campaign: ${error.error}`)
      }
    } catch (error) {
      console.error('Error sending campaign:', error)
      alert('Failed to send campaign')
    } finally {
      setIsLoading(false)
    }
  }

  if (!canSend || !hasTargets) {
    return (
      <Button
        variant="outline"
        disabled
        className="flex items-center space-x-2"
      >
        <Send className="h-4 w-4" />
        <span>Cannot Send</span>
      </Button>
    )
  }

  const targetContactsCount = campaign.metadata.target_contacts?.length || 0
  const targetTagsCount = campaign.metadata.target_tags?.length || 0
  const estimatedRecipients = contactCount || targetContactsCount

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center space-x-2">
          <Send className="h-4 w-4" />
          <span>Send Campaign</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Campaign Summary</h4>
            <div className="space-y-2 text-sm text-blue-800">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Estimated recipients: {estimatedRecipients}</span>
              </div>
              {targetTagsCount > 0 && (
                <div className="flex items-center space-x-2">
                  <span>Target tags: {targetTagsCount}</span>
                </div>
              )}
              {campaign.metadata.send_date && (
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span>Scheduled: {campaign.metadata.send_date}</span>
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Are you sure you want to send this campaign? This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading}
            className="min-w-[100px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Now'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}