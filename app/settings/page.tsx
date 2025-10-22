import { Suspense } from 'react'
import SettingsForm from '@/components/SettingsForm'
import { getSettings } from '@/lib/cosmic'

// Force dynamic rendering - prevents static generation and caching
export const dynamic = 'force-dynamic'

async function SettingsContent() {
  let settings = null
  
  try {
    settings = await getSettings()
  } catch (error) {
    console.error('Error fetching settings:', error)
  }

  return <SettingsForm initialSettings={settings} />
}

function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Form skeleton */}
      <div className="space-y-4">
        <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
        <div className="space-y-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
        <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Page Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Manage your email marketing configuration</p>
          </div>
        </div>
      </div>

      {/* Main Content with Suspense for streaming */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<SettingsLoadingSkeleton />}>
          <SettingsContent />
        </Suspense>
      </main>
    </div>
  )
}