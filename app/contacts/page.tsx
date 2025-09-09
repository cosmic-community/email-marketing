import { getEmailContacts } from '@/lib/cosmic'
import ContactsList from '@/components/ContactsList'
import { Button } from '@/components/ui/button'
import { RefreshCw, Upload } from 'lucide-react'
import CSVUploadModal from '@/components/CSVUploadModal'
import CreateContactModal from '@/components/CreateContactModal'
import PaginationControls from '@/components/PaginationControls'

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ContactsPageProps {
  searchParams: Promise<{
    page?: string
    limit?: string
    search?: string
    status?: string
  }>
}

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  const limit = parseInt(params.limit || '25')
  const search = params.search || ''
  const status = params.status || 'all'

  const { contacts, total } = await getEmailContacts({ 
    page, 
    limit, 
    search, 
    status: status === 'all' ? undefined : status 
  })

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with action buttons */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Email Contacts</h1>
              <p className="text-gray-600 mt-1">
                Manage your subscriber list ({total} contact{total !== 1 ? 's' : ''})
              </p>
            </div>
            <div className="flex space-x-4">
              <CSVUploadModal />
              <CreateContactModal />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ContactsList 
          contacts={contacts} 
          currentPage={page}
          totalContacts={total}
          searchTerm={search}
          statusFilter={status}
        />
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-8">
            <PaginationControls
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              itemsPerPage={limit}
            />
          </div>
        )}
      </main>
    </div>
  )
}