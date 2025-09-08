'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mail, X } from 'lucide-react'
import { useToast } from '@/hooks/useToast'

interface TestEmailModalProps {
  campaignId: string
  campaignName: string
  templateName: string
}

export default function TestEmailModal({ campaignId, campaignName, templateName }: TestEmailModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [emails, setEmails] = useState<string[]>([''])
  const [isLoading, setIsLoading] = useState(false)
  const { addToast } = useToast()

  const handleAddEmail = () => {
    setEmails([...emails, ''])
  }

  const handleRemoveEmail = (index: number) => {
    if (emails.length > 1) {
      setEmails(emails.filter((_, i) => i !== index))
    }
  }

  const handleEmailChange = (index: number, value: string) => {
    const newEmails = [...emails]
    newEmails[index] = value
    setEmails(newEmails)
  }

  const handleSendTestEmail = async () => {
    const validEmails = emails.filter(email => email.trim() && email.includes('@'))
    
    if (validEmails.length === 0) {
      addToast('Please enter at least one valid email address', 'error')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test_emails: validEmails }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to send test email')
      }

      addToast(`Test email sent successfully to ${validEmails.length} recipient${validEmails.length !== 1 ? 's' : ''}!`, 'success')
      setIsOpen(false)
      setEmails(['']) // Reset form
    } catch (error) {
      console.error('Test email error:', error)
      addToast(error instanceof Error ? error.message : 'Failed to send test email', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setIsOpen(false)
      setEmails(['']) // Reset form when closing
    }
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        size="sm"
        className="flex items-center space-x-2"
      >
        <Mail className="h-4 w-4" />
        <span>Send Test</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Send Test Email</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Campaign: <span className="font-medium">{campaignName}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Template: <span className="font-medium">{templateName}</span>
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={isLoading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Test Email Recipients
                  </label>
                  <p className="text-sm text-gray-600 mb-4">
                    Send a test version of this campaign to verify how it looks before sending to your contacts.
                  </p>

                  <div className="space-y-3">
                    {emails.map((email, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => handleEmailChange(index, e.target.value)}
                          placeholder="Enter email address"
                          className="form-input flex-1"
                          disabled={isLoading}
                        />
                        {emails.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(index)}
                            disabled={isLoading}
                            className="text-red-500 hover:text-red-700 disabled:opacity-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {emails.length < 5 && (
                    <button
                      type="button"
                      onClick={handleAddEmail}
                      disabled={isLoading}
                      className="mt-3 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
                    >
                      + Add another email
                    </button>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> Template variables will be replaced with sample data (John Doe) in test emails.
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendTestEmail}
                  disabled={isLoading || emails.every(email => !email.trim())}
                  className="btn-primary"
                >
                  {isLoading ? 'Sending...' : 'Send Test Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}