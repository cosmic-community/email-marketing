'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Send, Loader2 } from 'lucide-react'
import { MarketingCampaign, EmailTemplate } from '@/types'

interface TestEmailModalProps {
  campaignId: string;
  campaign?: MarketingCampaign;
  template?: EmailTemplate | null;
}

export default function TestEmailModal({ campaignId, campaign, template }: TestEmailModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testEmail) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail })
      })

      if (response.ok) {
        alert('Test email sent successfully!')
        setIsOpen(false)
        setTestEmail('')
      } else {
        const error = await response.json()
        alert(`Failed to send test email: ${error.error}`)
      }
    } catch (error) {
      console.error('Error sending test email:', error)
      alert('Failed to send test email')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center space-x-2">
          <Send className="h-4 w-4" />
          <span>Send Test Email</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSendTest} className="space-y-4">
          <div>
            <Label htmlFor="testEmail">Test Email Address</Label>
            <Input
              id="testEmail"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your@email.com"
              required
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !testEmail}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Test'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}