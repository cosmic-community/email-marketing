import { getSettings } from '@/lib/cosmic'
import Link from 'next/link'
import { CheckCircle, Mail, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { 
    success?: string
    already_verified?: string
  }
}

export default async function VerifiedPage({ searchParams }: PageProps) {
  const settings = await getSettings()
  const isSuccess = searchParams.success === 'true'
  const alreadyVerified = searchParams.already_verified === 'true'

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
          {isSuccess && (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <div className="mb-6">
                <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
              </div>
              
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                Email Verified Successfully! 🎉
              </h1>
              
              <p className="text-lg text-gray-600 mb-6">
                Thank you for confirming your subscription to {settings?.metadata.company_name || 'our newsletter'}.
              </p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-center space-x-2 mb-3">
                  <Mail className="w-6 h-6 text-green-600" />
                  <h2 className="text-xl font-semibold text-green-800">You're All Set!</h2>
                </div>
                <p className="text-green-700 mb-4">
                  Your email address has been verified and you're now an active subscriber.
                </p>
                <p className="text-green-700 text-sm">
                  We've sent you a welcome email with more information. You'll start receiving our updates and exclusive content soon.
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="bg-blue-50 rounded-lg p-6 text-left">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">What's Next?</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2">✓</span>
                      <span>Check your inbox for a welcome email</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2">✓</span>
                      <span>Add our email to your contacts to ensure delivery</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2">✓</span>
                      <span>Look forward to valuable content and updates</span>
                    </li>
                  </ul>
                </div>
                
                {settings?.metadata.website_url && (
                  <div className="pt-4">
                    <a 
                      href={settings.metadata.website_url}
                      className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
                    >
                      Visit Our Website
                    </a>
                  </div>
                )}
              </div>
              
              <div className="mt-8 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Questions? Contact us at{' '}
                  {settings?.metadata.support_email && (
                    <a 
                      href={`mailto:${settings.metadata.support_email}`}
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      {settings.metadata.support_email}
                    </a>
                  )}
                  {!settings?.metadata.support_email && settings?.metadata.from_email && (
                    <a 
                      href={`mailto:${settings.metadata.from_email}`}
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      {settings.metadata.from_email}
                    </a>
                  )}
                </p>
              </div>
            </div>
          )}

          {alreadyVerified && (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <div className="mb-6">
                <AlertCircle className="w-20 h-20 text-yellow-500 mx-auto" />
              </div>
              
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                Already Verified
              </h1>
              
              <p className="text-lg text-gray-600 mb-6">
                Your email address has already been verified. You're an active subscriber!
              </p>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
                <p className="text-yellow-800">
                  You don't need to verify again. You'll continue receiving our updates and exclusive content.
                </p>
              </div>
              
              {settings?.metadata.website_url && (
                <div className="pt-4">
                  <a 
                    href={settings.metadata.website_url}
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
                  >
                    Visit Our Website
                  </a>
                </div>
              )}
              
              <div className="mt-8">
                <Link 
                  href="/subscribe"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Back to Subscribe Page
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

