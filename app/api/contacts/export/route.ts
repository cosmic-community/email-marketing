import { NextRequest, NextResponse } from 'next/server'
import { getEmailContacts } from '@/lib/cosmic'

export const dynamic = 'force-dynamic'

// Helper function to escape CSV values
function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }
  
  const stringValue = String(value)
  
  // If value contains comma, newline, or quote, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  
  return stringValue
}

// Helper function to format date for CSV
function formatDateForCsv(dateString?: string): string {
  if (!dateString) return ''
  try {
    return new Date(dateString).toLocaleDateString('en-US')
  } catch {
    return dateString
  }
}

// Helper function to format lists for CSV
function formatListsForCsv(lists?: any[]): string {
  if (!lists || !Array.isArray(lists) || lists.length === 0) {
    return ''
  }
  
  return lists
    .map(list => {
      if (typeof list === 'string') return list
      return list.metadata?.name || list.title || list.id
    })
    .join('; ')
}

// Helper function to format tags for CSV
function formatTagsForCsv(tags?: string[]): string {
  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    return ''
  }
  
  return tags.join('; ')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Get filter parameters from URL
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || 'all'
    const listId = searchParams.get('list_id') || ''
    const format = searchParams.get('format') || 'csv'
    
    // Validate format
    if (format !== 'csv') {
      return NextResponse.json(
        { error: 'Only CSV format is currently supported' },
        { status: 400 }
      )
    }

    // Initialize variables for batch processing
    const batchSize = 100 // Process 100 contacts at a time
    let allContacts: any[] = []
    let skip = 0
    let hasMoreData = true

    // Fetch contacts in batches to handle large datasets efficiently
    while (hasMoreData) {
      try {
        const result = await getEmailContacts({
          limit: batchSize,
          skip: skip,
          search: search || undefined,
          status: status !== 'all' ? status : undefined,
          list_id: listId || undefined,
        })

        if (result.contacts.length === 0) {
          hasMoreData = false
        } else {
          allContacts = [...allContacts, ...result.contacts]
          skip += batchSize
          
          // If we got fewer contacts than batch size, we've reached the end
          if (result.contacts.length < batchSize) {
            hasMoreData = false
          }
        }
        
        // Safety check to prevent infinite loops
        if (allContacts.length > 50000) {
          console.warn('Export limit reached: 50,000 contacts')
          break
        }
        
      } catch (error) {
        console.error('Error fetching batch:', error)
        hasMoreData = false
      }
    }

    if (allContacts.length === 0) {
      return NextResponse.json(
        { error: 'No contacts found matching the specified criteria' },
        { status: 404 }
      )
    }

    // Define CSV headers
    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'Status',
      'Lists',
      'Tags',
      'Subscribe Date',
      'Notes',
      'Created Date',
      'Last Modified'
    ]

    // Build CSV content
    let csvContent = headers.map(escapeCsvValue).join(',') + '\n'

    // Process contacts in chunks to avoid memory issues
    const chunkSize = 1000
    for (let i = 0; i < allContacts.length; i += chunkSize) {
      const chunk = allContacts.slice(i, i + chunkSize)
      
      for (const contact of chunk) {
        const row = [
          escapeCsvValue(contact.metadata?.first_name || ''),
          escapeCsvValue(contact.metadata?.last_name || ''),
          escapeCsvValue(contact.metadata?.email || ''),
          escapeCsvValue(contact.metadata?.status?.value || contact.metadata?.status || ''),
          escapeCsvValue(formatListsForCsv(contact.metadata?.lists)),
          escapeCsvValue(formatTagsForCsv(contact.metadata?.tags)),
          escapeCsvValue(formatDateForCsv(contact.metadata?.subscribe_date)),
          escapeCsvValue(contact.metadata?.notes || ''),
          escapeCsvValue(formatDateForCsv(contact.created_at)),
          escapeCsvValue(formatDateForCsv(contact.modified_at))
        ]
        
        csvContent += row.join(',') + '\n'
      }
    }

    // Generate filename with timestamp and filters
    const timestamp = new Date().toISOString().split('T')[0]
    let filename = `contacts-${timestamp}`
    
    if (search) filename += `-search`
    if (status && status !== 'all') filename += `-${status.toLowerCase()}`
    if (listId) filename += `-filtered`
    
    filename += '.csv'

    // Create response with appropriate headers
    const response = new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(csvContent, 'utf8').toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })

    return response

  } catch (error) {
    console.error('Error exporting contacts:', error)
    return NextResponse.json(
      { 
        error: 'Failed to export contacts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}