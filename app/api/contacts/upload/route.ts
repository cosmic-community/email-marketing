import { NextRequest, NextResponse } from 'next/server'
import { createEmailContact, getEmailContacts } from '@/lib/cosmic'
import { EmailContact } from '@/types'
import { revalidatePath, revalidateTag } from 'next/cache'

interface ContactData {
  first_name: string;
  last_name?: string;
  email: string;
  status: 'Active' | 'Unsubscribed' | 'Bounced';
  tags?: string[];
  subscribe_date?: string;
  notes?: string;
}

interface UploadResult {
  success: boolean;
  message: string;
  results: {
    total_processed: number;
    successful: number;
    duplicates: number;
    validation_errors: number;
    creation_errors: number;
  };
  contacts: EmailContact[];
  duplicates?: string[];
  validation_errors?: string[];
  creation_errors?: string[];
}

// Enhanced column mapping function for flexible CSV parsing
function createColumnMap(headers: string[]): Record<string, number> {
  const columnMap: Record<string, number> = {}
  
  // Normalize headers for comparison (lowercase, remove spaces/underscores)
  const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[_\s-]/g, ''))
  
  // Define possible column name variations for each field
  const fieldMappings = {
    first_name: ['firstname', 'fname', 'name', 'givenname', 'forename'],
    last_name: ['lastname', 'lname', 'surname', 'familyname'],
    email: ['email', 'emailaddress', 'mail', 'e-mail'],
    status: ['status', 'state', 'subscription', 'active'],
    tags: ['tags', 'categories', 'groups', 'interests', 'labels'],
    notes: ['notes', 'comments', 'description', 'memo'],
    subscribe_date: ['subscribedate', 'joindate', 'signupdate', 'createddate', 'optintime', 'confirmtime']
  }
  
  // Find matching columns for each field
  Object.entries(fieldMappings).forEach(([field, variations]) => {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const normalized = normalizedHeaders[i]
      if (normalized && variations.includes(normalized) || (normalized && normalized.includes(field.replace('_', '')))) {
        columnMap[field] = i
        break
      }
    }
  })
  
  return columnMap
}

// Enhanced CSV parsing with better quote handling
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0
  
  while (i < line.length) {
    const char = line[i]
    const nextChar = line[i + 1]
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i += 2
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
        i++
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim())
      current = ''
      i++
    } else {
      current += char
      i++
    }
  }
  
  // Add the last field
  result.push(current.trim())
  
  return result
}

export async function POST(request: NextRequest): Promise<NextResponse<UploadResult | { error: string; errors?: string[]; total_errors?: number }>> {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      )
    }

    // Validate file type
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Please upload a CSV file' },
        { status: 400 }
      )
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }

    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV must contain at least a header row and one data row' },
        { status: 400 }
      )
    }

    // Parse CSV header with better quote handling
    const headerLine = lines[0]
    if (!headerLine) {
      return NextResponse.json(
        { error: 'CSV header row is missing or empty' },
        { status: 400 }
      )
    }

    const headers = parseCSVLine(headerLine).map(h => h.replace(/^["']|["']$/g, '').trim())
    
    // Create flexible column mapping
    const columnMap = createColumnMap(headers)
    
    // Check if we found the required columns
    if (columnMap.email === undefined) {
      return NextResponse.json(
        { error: 'Email column not found. Please ensure your CSV has an email column (variations: email, emailaddress, mail, e-mail)' },
        { status: 400 }
      )
    }
    
    if (columnMap.first_name === undefined) {
      return NextResponse.json(
        { error: 'First name column not found. Please ensure your CSV has a first name column (variations: first_name, firstname, fname, name)' },
        { status: 400 }
      )
    }

    // Get existing contacts to check for duplicates - FIX: Extract contacts array from paginated response
    let existingContacts: EmailContact[] = []
    try {
      const contactsResponse = await getEmailContacts()
      existingContacts = contactsResponse.contacts // Extract the contacts array from the paginated response
    } catch (error) {
      console.error('Error fetching existing contacts:', error)
      // Continue without duplicate checking if we can't fetch existing contacts
    }

    const existingEmails = new Set(
      existingContacts
        .map(c => c.metadata?.email)
        .filter((email): email is string => typeof email === 'string' && email.length > 0)
        .map(email => email.toLowerCase())
    )

    const contacts: ContactData[] = []
    const errors: string[] = []
    const duplicates: string[] = []
    
    // Process each data row
    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i]
      if (!currentLine || currentLine.trim() === '') {
        continue // Skip empty lines
      }

      let row: string[]
      try {
        row = parseCSVLine(currentLine)
      } catch (parseError) {
        errors.push(`Row ${i + 1}: Failed to parse CSV line`)
        continue
      }
      
      const contact: Partial<ContactData> = {}
      
      // Extract data using column mapping
      try {
        // Required fields - Add null checks for undefined values
        const emailValue = row[columnMap.email]?.replace(/^["']|["']$/g, '').trim() || ''
        const firstNameValue = row[columnMap.first_name]?.replace(/^["']|["']$/g, '').trim() || ''
        
        contact.email = emailValue.toLowerCase()
        contact.first_name = firstNameValue
        
        // Optional fields - Add null checks for potentially undefined column indices
        if (columnMap.last_name !== undefined && row[columnMap.last_name] !== undefined) {
          const lastNameValue = row[columnMap.last_name]?.replace(/^["']|["']$/g, '').trim() || ''
          contact.last_name = lastNameValue
        }
        
        if (columnMap.status !== undefined && row[columnMap.status] !== undefined) {
          const statusValue = row[columnMap.status]?.replace(/^["']|["']$/g, '').trim() || ''
          const normalizedStatus = statusValue.toLowerCase()
          if (['active', 'unsubscribed', 'bounced'].includes(normalizedStatus)) {
            contact.status = (normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)) as 'Active' | 'Unsubscribed' | 'Bounced'
          } else {
            contact.status = 'Active'
          }
        } else {
          contact.status = 'Active'
        }
        
        if (columnMap.tags !== undefined && row[columnMap.tags] !== undefined) {
          const tagsValue = row[columnMap.tags]?.replace(/^["']|["']$/g, '').trim() || ''
          if (tagsValue) {
            // Handle various tag separators (comma, semicolon, pipe)
            contact.tags = tagsValue.split(/[;,|]/).map(tag => tag.trim()).filter(tag => tag.length > 0)
          } else {
            contact.tags = []
          }
        } else {
          contact.tags = []
        }
        
        if (columnMap.notes !== undefined && row[columnMap.notes] !== undefined) {
          const notesValue = row[columnMap.notes]?.replace(/^["']|["']$/g, '').trim() || ''
          contact.notes = notesValue
        }
        
        if (columnMap.subscribe_date !== undefined && row[columnMap.subscribe_date] !== undefined) {
          const dateValue = row[columnMap.subscribe_date]?.replace(/^["']|["']$/g, '').trim() || ''
          // Try to parse various date formats
          if (dateValue) {
            const parsedDate = new Date(dateValue)
            if (!isNaN(parsedDate.getTime())) {
              contact.subscribe_date = parsedDate.toISOString().split('T')[0]
            } else {
              contact.subscribe_date = new Date().toISOString().split('T')[0]
            }
          } else {
            contact.subscribe_date = new Date().toISOString().split('T')[0]
          }
        } else {
          contact.subscribe_date = new Date().toISOString().split('T')[0]
        }

      } catch (extractError) {
        errors.push(`Row ${i + 1}: Error extracting data from CSV row`)
        continue
      }

      // Validate required fields
      if (!contact.first_name || contact.first_name.trim() === '') {
        errors.push(`Row ${i + 1}: First name is required`)
        continue
      }

      if (!contact.email || contact.email.trim() === '') {
        errors.push(`Row ${i + 1}: Email is required`)
        continue
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(contact.email)) {
        errors.push(`Row ${i + 1}: Invalid email format: ${contact.email}`)
        continue
      }

      // Check for duplicates
      if (contact.email && typeof contact.email === 'string' && existingEmails.has(contact.email)) {
        duplicates.push(contact.email)
        continue
      }

      // Create valid contact with all required fields
      const validContact: ContactData = {
        first_name: contact.first_name,
        last_name: contact.last_name || '',
        email: contact.email,
        status: contact.status || 'Active',
        tags: contact.tags || [],
        subscribe_date: contact.subscribe_date || new Date().toISOString().split('T')[0],
        notes: contact.notes || ''
      }

      contacts.push(validContact)
      
      // Add to existing emails set to prevent duplicates within the same file
      if (validContact.email) {
        existingEmails.add(validContact.email)
      }
    }

    // If there are too many errors, abort
    if (errors.length > 50) {
      return NextResponse.json(
        { 
          error: 'Too many validation errors in the CSV file. Please check your data format.',
          errors: errors.slice(0, 10),
          total_errors: errors.length
        },
        { status: 400 }
      )
    }

    // Create contacts in Cosmic
    const created: EmailContact[] = []
    const creationErrors: string[] = []

    for (const contactData of contacts) {
      try {
        const newContact = await createEmailContact(contactData)
        if (newContact) {
          created.push(newContact)
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        creationErrors.push(`Failed to create contact ${contactData.email}: ${errorMessage}`)
      }
    }

    // Enhanced cache invalidation after successful upload
    if (created.length > 0) {
      revalidatePath('/contacts')
      revalidatePath('/contacts/page')
      revalidatePath('/(dashboard)/contacts')
      revalidateTag('contacts')
      revalidateTag('email-contacts')
      revalidatePath('/')
    }

    // Return results
    const result: UploadResult = {
      success: true,
      message: `Successfully imported ${created.length} contacts`,
      results: {
        total_processed: lines.length - 1,
        successful: created.length,
        duplicates: duplicates.length,
        validation_errors: errors.length,
        creation_errors: creationErrors.length,
      },
      contacts: created,
      duplicates: duplicates.length > 0 ? duplicates : undefined,
      validation_errors: errors.length > 0 ? errors : undefined,
      creation_errors: creationErrors.length > 0 ? creationErrors : undefined,
    }

    return NextResponse.json(result)

  } catch (error: unknown) {
    console.error('CSV upload error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json(
      { error: `Failed to process CSV file: ${errorMessage}` },
      { status: 500 }
    )
  }
}