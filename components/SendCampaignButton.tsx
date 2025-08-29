'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import confetti from 'canvas-confetti'

interface SendCampaignButtonProps {
  campaignId: string
  campaignName: string
  recipientCount: number
  disabled?: boolean
}

export default function SendCampaignButton({ 
  campaignId, 
  campaignName, 
  recipientCount,
  disabled = false 
}: SendCampaignButtonProps) {
  const router = useRouter()
  const [isSending, setIsSending] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [emailsSent, setEmailsSent] = useState(0)

  const handleSendCampaign = async () => {
    setIsSending(true)
    
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send campaign')
      }

      const result = await response.json()
      setEmailsSent(result.emailsSent || recipientCount)
      
      // Trigger confetti animation
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      })

      setShowConfirmation(false)
      setShowSuccess(true)

    } catch (error) {
      console.error('Send error:', error)
      alert(error instanceof Error ? error.message : 'Failed to send campaign')
    } finally {
      setIsSending(false)
    }
  }

  const handleSuccessClose = () => {
    setShowSuccess(false)
    // Refresh the page when user manually closes the modal
    router.refresh()
  }

  return (
    <>
      <Button 
        onClick={() => setShowConfirmation(true)}
        disabled={disabled || isSending}
        className="btn-primary"
      >
        {isSending ? 'Sending...' : 'Send Campaign'}
      </Button>

      {/* Send Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Send Campaign</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-gray-600 mb-4">
              Are you sure you want to send "{campaignName}" to {recipientCount} recipients?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    This action cannot be undone
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    The email campaign will be sent immediately to all selected recipients.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmation(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendCampaign}
              disabled={isSending}
              className="btn-primary"
            >
              {isSending ? 'Sending...' : `Send to ${recipientCount} Recipients`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={handleSuccessClose}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <DialogTitle className="text-xl font-bold text-gray-900">
                Campaign Sent!
              </DialogTitle>
            </div>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-gray-600 text-lg">
              Campaign sent successfully! {emailsSent} emails sent.
            </p>
            
            <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-green-800">
                    Campaign Status Updated
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Your campaign has been marked as "Sent" and delivery tracking has begun.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleSuccessClose}
              className="btn-primary w-full"
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}