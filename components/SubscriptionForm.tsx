'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, AlertCircle, Mail, Shield } from 'lucide-react'

export default function SubscriptionForm() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  
  // Bot protection states
  const [honeypot, setHoneypot] = useState('') // Honeypot field - should remain empty
  const [formStartTime, setFormStartTime] = useState<number>(0)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [botProtectionReady, setBotProtectionReady] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Initialize bot protection on mount
  useEffect(() => {
    setFormStartTime(Date.now())
    
    // Mark protection as ready after a short delay
    const timer = setTimeout(() => {
      setBotProtectionReady(true)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  // Track user interactions to distinguish from bots
  const handleUserInteraction = () => {
    if (!hasUserInteracted) {
      setHasUserInteracted(true)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      setStatus('error')
      setMessage('Email is required')
      return
    }

    // Bot protection checks
    const submissionTime = Date.now()
    const timeSpent = submissionTime - formStartTime
    
    // Check if form was submitted too quickly (likely a bot)
    if (timeSpent < 2000) {
      setStatus('error')
      setMessage('Please take a moment to review your information before submitting.')
      return
    }

    // Check if user has actually interacted with the form
    if (!hasUserInteracted) {
      setStatus('error')
      setMessage('Please fill out the form manually.')
      return
    }

    // Check honeypot field - should be empty for real users
    if (honeypot.trim() !== '') {
      setStatus('error')
      setMessage('Spam detected. Please try again.')
      return
    }

    // Check if bot protection is ready
    if (!botProtectionReady) {
      setStatus('error')
      setMessage('Please wait a moment and try again.')
      return
    }

    setIsSubmitting(true)
    setStatus('idle')
    
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          first_name: firstName,
          last_name: lastName,
          source: 'Landing Page',
          // Include bot protection metadata
          bot_protection: {
            time_spent: timeSpent,
            user_interacted: hasUserInteracted,
            form_start_time: formStartTime,
            submission_time: submissionTime,
            honeypot_filled: honeypot.trim() !== '',
            user_agent: navigator.userAgent,
            screen_resolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language
          }
        })
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage(data.message || 'Successfully subscribed!')
        setEmail('')
        setFirstName('')
        setLastName('')
        setHoneypot('')
        setHasUserInteracted(false)
      } else {
        setStatus('error')
        setMessage(data.error || 'Failed to subscribe. Please try again.')
      }
    } catch (error) {
      console.error('Subscription error:', error)
      setStatus('error')
      setMessage('Network error. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-8">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-2xl font-semibold text-gray-900 mb-2">
          Welcome to our community!
        </h3>
        <p className="text-gray-600 mb-6">
          {message}
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <Mail className="w-5 h-5 text-blue-600" />
            <p className="text-blue-800 font-medium">Check your inbox!</p>
          </div>
          <p className="text-sm text-blue-700">
            We've sent you a welcome email with important information about your subscription.
          </p>
        </div>
        <Button 
          onClick={() => {
            setStatus('idle')
            setMessage('')
            setFormStartTime(Date.now())
            setHasUserInteracted(false)
          }}
          variant="outline"
          className="mt-4"
        >
          Subscribe Another Email
        </Button>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {/* Bot Protection Notice */}
      <div className="flex items-center space-x-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-md">
        <Shield className="w-4 h-4 text-green-600" />
        <span>Protected by advanced bot detection</span>
      </div>

      <div>
        <Label htmlFor="email" className="text-base font-medium">
          Email Address *
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            handleUserInteraction()
          }}
          onFocus={handleUserInteraction}
          placeholder="Enter your email address"
          required
          disabled={isSubmitting}
          className="mt-2 text-base h-12"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName" className="text-base font-medium">
            First Name (Optional)
          </Label>
          <Input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value)
              handleUserInteraction()
            }}
            onFocus={handleUserInteraction}
            placeholder="Your first name"
            disabled={isSubmitting}
            className="mt-2 text-base h-12"
          />
        </div>
        
        <div>
          <Label htmlFor="lastName" className="text-base font-medium">
            Last Name (Optional)
          </Label>
          <Input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value)
              handleUserInteraction()
            }}
            onFocus={handleUserInteraction}
            placeholder="Your last name"
            disabled={isSubmitting}
            className="mt-2 text-base h-12"
          />
        </div>
      </div>

      {/* Honeypot field - hidden from users, should remain empty */}
      <div style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
        <Label htmlFor="website">Website (leave blank)</Label>
        <Input
          id="website"
          name="website"
          type="text"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {status === 'error' && (
        <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-md">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{message}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting || !email || !botProtectionReady}
        className="w-full h-12 text-base font-medium"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Subscribing...
          </>
        ) : !botProtectionReady ? (
          <>
            <Shield className="w-5 h-5 mr-2" />
            Initializing Security...
          </>
        ) : (
          'Join Our Newsletter'
        )}
      </Button>

      <div className="text-center space-y-2">
        <p className="text-sm text-gray-500">
          We'll send you a confirmation email after you subscribe.
        </p>
        <p className="text-xs text-gray-400">
          We'll never share your email with anyone else.
        </p>
        <p className="text-xs text-gray-400">
          This form is protected against spam and automated submissions.
        </p>
      </div>
    </form>
  )
}