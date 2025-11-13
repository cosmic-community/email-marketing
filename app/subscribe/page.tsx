import SubscriptionForm from '@/components/SubscriptionForm'
import { getSettings } from '@/lib/cosmic'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: {
    error?: string
  }
}

export default async function SubscribePage({ searchParams }: PageProps) {
  const settings = await getSettings()
  const error = searchParams.error

  // Map error codes to user-friendly messages
  const errorMessages: Record<string, { title: string; message: string }> = {
    invalid_verification_link: {
      title: 'Invalid Verification Link',
      message: 'The verification link appears to be invalid or incomplete. Please check your email and try clicking the link again.'
    },
    contact_not_found: {
      title: 'Subscription Not Found',
      message: 'We couldn\'t find a subscription associated with this verification link. The subscription may have been removed or the link may be incorrect.'
    },
    invalid_token: {
      title: 'Invalid Verification Token',
      message: 'The verification token is invalid. Please check your email and use the most recent verification link we sent you.'
    },
    token_expired: {
      title: 'Verification Link Expired',
      message: 'This verification link has expired (links are valid for 24 hours). Please submit the form below to receive a new verification email.'
    },
    verification_failed: {
      title: 'Verification Failed',
      message: 'An error occurred while verifying your email. Please try again or contact support if the problem persists.'
    }
  }

  const errorInfo = error && errorMessages[error]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Simple header without main nav */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-2">
              {settings?.metadata.brand_logo?.imgix_url ? (
                <img
                  src={`${settings.metadata.brand_logo.imgix_url}?w=64&h=64&fit=crop&auto=format,compress`}
                  alt={`${settings.metadata.company_name || 'Company'} logo`}
                  className="w-8 h-8 object-contain"
                />
              ) : (
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
              <span className="text-xl font-bold text-gray-900">
                {settings?.metadata.company_name || 'Cosmic Email Marketing'}
              </span>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Stay Updated
            </h1>
            <p className="text-xl text-gray-600 mb-2">
              Join our email list to receive the latest updates, tips, and exclusive content.
            </p>
            <p className="text-gray-500">
              {settings?.metadata.company_name && (
                <>Subscribe to {settings.metadata.company_name}'s newsletter</>
              )}
            </p>
          </div>

          {/* Error Message */}
          {errorInfo && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-red-900 mb-1">
                    {errorInfo.title}
                  </h3>
                  <p className="text-red-700">
                    {errorInfo.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Subscription Form Card */}
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <SubscriptionForm />
          </div>

          {/* Benefits Section */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              What you'll get:
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Regular Updates</h3>
                  <p className="text-gray-600 text-sm">Stay informed with our latest news and insights</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Exclusive Content</h3>
                  <p className="text-gray-600 text-sm">Access subscriber-only tips and resources</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">No Spam</h3>
                  <p className="text-gray-600 text-sm">We respect your inbox and only send valuable content</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Easy Unsubscribe</h3>
                  <p className="text-gray-600 text-sm">Unsubscribe anytime with one click</p>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy Notice */}
          <div className="text-center mt-8">
            <p className="text-sm text-gray-500">
              By subscribing, you agree to receive email communications from us.
              {settings?.metadata.privacy_policy_url && (
                <>
                  {' '}Read our{' '}
                  <a
                    href={settings.metadata.privacy_policy_url}
                    className="text-blue-600 hover:text-blue-800 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </a>
                </>
              )}
              . You can unsubscribe at any time.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}