'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { MarketingCampaign } from '@/types'

export interface DeleteCampaignButtonProps {
  campaignId: string
  campaignName: string
  isDraft: boolean
}

export default function DeleteCampaignButton({ campaignId, campaignName, isDraft }: DeleteCampaignButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete campaign')
      }

      setIsOpen(false)
      router.push('/campaigns')
      router.refresh()

    } catch (error) {
      console.error('Error deleting campaign:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete campaign')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <AlertTriangle className="mr-2 h-5 w-5 text-red-500" />
            Delete Campaign
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{campaignName}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 p-3 rounded-md">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> Deleting this campaign will permanently remove all associated data including:
            </p>
            <ul className="text-sm text-red-700 mt-2 ml-4 list-disc">
              <li>Campaign configuration and content</li>
              <li>Target audience settings</li>
              {!isDraft && <li>Send statistics and performance data</li>}
              <li>All historical records</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isDeleting}
            variant="destructive"
            className="min-w-[100px]"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}