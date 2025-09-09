'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Trash2, Search, Filter, Loader2, RefreshCw, Edit, Users, AlertTriangle } from 'lucide-react'
import { EmailContact } from '@/types'
import ConfirmationModal from '@/components/ConfirmationModal'
import EditContactModal from '@/components/EditContactModal'
import BulkActionsModal from '@/components/BulkActionsModal'

interface ContactsListProps {
  contacts: EmailContact[]
  currentPage: number
  totalContacts: number
  searchTerm: string
  statusFilter: string
}

export default function ContactsList({ 
  contacts, 
  currentPage, 
  totalContacts, 
  searchTerm: initialSearchTerm, 
  statusFilter: initialStatusFilter 
}: ContactsListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm)
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Bulk selection state
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [showBulkActions, setShowBulkActions] = useState(false)

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm !== initialSearchTerm) {
        updateURL({ search: searchTerm, page: '1' })
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [searchTerm, initialSearchTerm])

  // Status filter effect
  useEffect(() => {
    if (statusFilter !== initialStatusFilter) {
      updateURL({ status: statusFilter, page: '1' })
    }
  }, [statusFilter, initialStatusFilter])

  const updateURL = (params: Record<string, string>) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === '' || value === 'all') {
        current.delete(key)
      } else {
        current.set(key, value)
      }
    })

    const search = current.toString()
    const query = search ? `?${search}` : ''
    
    router.push(`/contacts${query}`)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      router.refresh()
      // Add a small delay to show the loading state
      setTimeout(() => setIsRefreshing(false), 500)
    } catch (error) {
      console.error('Error refreshing data:', error)
      setIsRefreshing(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete contact')
      }

      router.refresh()
    } catch (error) {
      console.error('Error deleting contact:', error)
      alert('Failed to delete contact')
    } finally {
      setDeletingId(null)
    }
  }

  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(contacts.map(contact => contact.id))
    } else {
      setSelectedContacts([])
    }
  }

  const handleSelectContact = (contactId: string, checked: boolean) => {
    if (checked) {
      setSelectedContacts(prev => [...prev, contactId])
    } else {
      setSelectedContacts(prev => prev.filter(id => id !== contactId))
    }
  }

  const isAllSelected = contacts.length > 0 && selectedContacts.length === contacts.length
  const isPartiallySelected = selectedContacts.length > 0 && selectedContacts.length < contacts.length

  // Bulk actions handlers
  const handleBulkDelete = async () => {
    setBulkActionLoading(true)
    try {
      const response = await fetch('/api/contacts/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: selectedContacts })
      })

      if (!response.ok) {
        throw new Error('Failed to delete contacts')
      }

      setSelectedContacts([])
      router.refresh()
    } catch (error) {
      console.error('Error deleting contacts:', error)
      alert('Failed to delete some contacts')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkUpdate = async (updates: { status?: string; tags?: string[]; tagAction?: string }) => {
    setBulkActionLoading(true)
    try {
      const response = await fetch('/api/contacts/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: selectedContacts,
          updates: updates
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update contacts')
      }

      const result = await response.json()
      console.log('Bulk update result:', result)

      setSelectedContacts([])
      setShowBulkActions(false)
      router.refresh()
    } catch (error) {
      console.error('Error updating contacts:', error)
      alert(error instanceof Error ? error.message : 'Failed to update contacts')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800'
      case 'Unsubscribed':
        return 'bg-gray-100 text-gray-800'
      case 'Bounced':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (totalContacts === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts yet</h3>
        <p className="text-gray-600 mb-6">Start building your email list by adding your first contact.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400 h-4 w-4" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Unsubscribed">Unsubscribed</SelectItem>
                <SelectItem value="Bounced">Bounced</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="ml-2"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        
        {/* Pagination info */}
        <div className="mt-4 text-sm text-gray-600">
          Showing {contacts.length} of {totalContacts} contacts
          {currentPage > 1 && ` (page ${currentPage})`}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedContacts.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                {selectedContacts.length} contact{selectedContacts.length > 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkActions(true)}
                disabled={bulkActionLoading}
                className="bg-white"
              >
                <Edit className="h-4 w-4 mr-2" />
                Update Selected
              </Button>
              <ConfirmationModal
                title="Delete Selected Contacts"
                description={`Are you sure you want to delete ${selectedContacts.length} selected contact${selectedContacts.length > 1 ? 's' : ''}? This action cannot be undone.`}
                onConfirm={handleBulkDelete}
                confirmText="Delete"
                variant="destructive"
                isLoading={bulkActionLoading}
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkActionLoading}
                    className="bg-white text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {bulkActionLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete Selected
                  </Button>
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedContacts([])}
                className="text-gray-500 hover:text-gray-700"
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                    className={isPartiallySelected ? 'data-[state=indeterminate]:bg-blue-600' : ''}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tags
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subscribe Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Checkbox
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {contact.metadata.first_name} {contact.metadata.last_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{contact.metadata.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusColor(contact.metadata.status.value)}`}>
                      {contact.metadata.status.value}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {contact.metadata.tags && contact.metadata.tags.length > 0 ? (
                        contact.metadata.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-gray-400 text-sm">No tags</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {contact.metadata.subscribe_date ? formatDate(contact.metadata.subscribe_date) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <EditContactModal contact={contact}>
                        <Button
                          variant="ghost"
                          size="sm"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </EditContactModal>
                      <ConfirmationModal
                        title="Delete Contact"
                        description={`Are you sure you want to delete ${contact.metadata.first_name} ${contact.metadata.last_name}? This action cannot be undone.`}
                        onConfirm={() => handleDelete(contact.id)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deletingId === contact.id}
                            className="text-red-600 hover:text-red-700"
                          >
                            {deletingId === contact.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {contacts.length === 0 && totalContacts > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts found</h3>
          <p className="text-gray-600">Try adjusting your search or filter criteria.</p>
        </div>
      )}

      {/* Bulk Actions Modal */}
      <BulkActionsModal
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedCount={selectedContacts.length}
        onUpdate={handleBulkUpdate}
        isLoading={bulkActionLoading}
      />
    </div>
  )
}