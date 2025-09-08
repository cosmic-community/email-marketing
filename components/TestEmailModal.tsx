'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CheckCircle, AlertCircle, Mail, Loader2, Info } from 'lucide-react'

interface TestEmailModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (emails: string[]) => Promise<void>
  campaignId: string
  campaignName: string
  templateName?: string
  isLoading?: boolean
}

export default function TestEmailModal({
  isOpen,
  onClose,
  onSend,
  campaignId,
  campaignName,
  templateName,
  isLoading = false
}: TestEmailModalProps) {
  const [testEmails, setTestEmails] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  // Parse and validate email addresses
  const parseEmails = (emailString: string): string[] => {
    if (!emailString.trim()) return []
    
    return emailString
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0)
  }

  const validateEmails = (emails: string[]): { valid: string[], invalid: string[] } => {
    const valid: string[] = []
    const invalid: string[] = []
    
    emails.forEach(email => {
      if (emailRegex.test(email)) {
        valid.push(email)
      } else {
        invalid.push(email)
      }
    })
    
    return { valid, invalid }
  }

  const handleSend = async () => {
    setError('')
    setSuccess('')

    // Parse email addresses
    const emailList = parseEmails(testEmails)
    
    if (emailList.length === 0) {
      setError('Test email addresses are required')
      return
    }

    // Validate email addresses
    const { valid, invalid } = validateEmails(emailList)
    
    if (invalid.length > 0) {
      setError(`Invalid email addresses: ${invalid.join(', ')}`)
      return
    }

    if (valid.length === 0) {
      setError('No valid email addresses provided')
      return
    }

    try {
      await onSend(valid)
      setSuccess(`Test email sent successfully to ${valid.length} recipient${valid.length > 1 ? 's' : ''}`)
      
      // Clear form after successful send
      setTimeout(() => {
        setTestEmails('')
        setSuccess('')
        onClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test email')
    }
  }

  const handleEmailChange = (value: string) => {
    setTestEmails(value)
    setError('') // Clear error when user starts typing
    setSuccess('') // Clear success message
  }

  const handleClose = () => {
    if (!isLoading) {
      setTestEmails('')
      setError('')
      setSuccess('')
      onClose()
    }
  }

  const emailList = parseEmails(testEmails)
  const { valid, invalid } = validateEmails(emailList)

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Mail className="h-5 w-5 text-blue-600" />
            <span>Send Test Email</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Campaign/Template Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Send a test version of "{campaignName}" 
              {templateName && ` using template "${templateName}"`} 
              to review before launching
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-green-600 text-sm">{success}</p>
            </div>
          )}

          {/* Email Input */}
          <div className="space-y-2">
            <Label htmlFor="testEmails">Test Email Addresses *</Label>
            <Input
              id="testEmails"
              type="text"
              value={testEmails}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="spirony@gmail.com, tony@cosmicjs.com"
              disabled={isLoading}
              className={`${invalid.length > 0 ? 'border-red-300' : ''}`}
            />
            <p className="text-xs text-gray-500">
              Separate multiple email addresses with commas
            </p>
            
            {/* Email validation feedback */}
            {testEmails.trim() && emailList.length > 0 && (
              <div className="text-xs space-y-1">
                {valid.length > 0 && (
                  <p className="text-green-600">
                    ✓ {valid.length} valid email{valid.length > 1 ? 's' : ''}: {valid.join(', ')}
                  </p>
                )}
                {invalid.length > 0 && (
                  <p className="text-red-600">
                    ✗ {invalid.length} invalid email{invalid.length > 1 ? 's' : ''}: {invalid.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Test Email Features Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-2">Test Email Features:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Subject line will include [TEST] prefix</li>
                  <li>• Template variables will be replaced with sample data</li>
                  <li>• Email will include a test banner at the top</li>
                  <li>• Test emails are saved to your settings for future use</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={isLoading || valid.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Test Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}