import { getEmailTemplates, getEmailContacts } from '@/lib/cosmic'
import CreateCampaignForm from '@/components/CreateCampaignForm'

export default async function NewCampaignPage() {
  const [templates, contactsResponse] = await Promise.all([
    getEmailTemplates(),
    getEmailContacts() // This returns PaginatedContactsResponse
  ])
  
  // Extract the contacts array from the paginated response
  const contacts = contactsResponse.contacts

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">Create New Campaign</h1>
            <p className="text-gray-600 mt-1">Set up your email marketing campaign</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <CreateCampaignForm 
            templates={templates}
            contacts={contacts}
          />
        </div>
      </main>
    </div>
  )
}