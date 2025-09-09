import { createBucketClient } from '@cosmicjs/sdk'
import { 
  EmailContact, 
  EmailTemplate, 
  MarketingCampaign, 
  Settings, 
  CreateContactData,
  CreateTemplateData,
  CreateCampaignData,
  UpdateSettingsData,
  CampaignStats,
  TemplateSnapshot,
  CosmicResponse
} from '@/types'

if (!process.env.COSMIC_BUCKET_SLUG || !process.env.COSMIC_READ_KEY || !process.env.COSMIC_WRITE_KEY) {
  throw new Error('Missing required Cosmic environment variables')
}

// Create the Cosmic client and export it
export const cosmic = createBucketClient({
  bucketSlug: process.env.COSMIC_BUCKET_SLUG,
  readKey: process.env.COSMIC_READ_KEY,
  writeKey: process.env.COSMIC_WRITE_KEY
})

// Pagination parameters interface
interface PaginationParams {
  page?: number
  limit?: number
  search?: string
  status?: string
}

// Paginated contacts response interface
interface PaginatedContactsResponse {
  contacts: EmailContact[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Email Contacts with pagination support
export async function getEmailContacts(params: PaginationParams = {}): Promise<PaginatedContactsResponse> {
  try {
    const { page = 1, limit = 25, search, status } = params
    const skip = (page - 1) * limit

    // Build query object
    const query: any = { type: 'email-contacts' }

    // Add status filter if specified
    if (status && status !== 'all') {
      query['metadata.status.value'] = status
    }

    // Add search filter if specified
    if (search) {
      // Note: Cosmic doesn't support OR queries directly, so we'll filter on the client side
      // For now, we'll get all contacts and filter on the server
    }

    let cosmicQuery = cosmic.objects
      .find(query)
      .props(['id', 'title', 'slug', 'metadata', 'created_at', 'modified_at'])
      .depth(1)

    // Apply pagination
    if (!search) {
      // Only apply skip/limit if not searching (since we need all results for search filtering)
      cosmicQuery = cosmicQuery.skip(skip).limit(limit)
    }

    const response = await cosmicQuery

    let contacts = response.objects as EmailContact[]
    let total = response.total

    // Apply search filtering on the server side if search term provided
    if (search) {
      const searchLower = search.toLowerCase()
      contacts = contacts.filter(contact => {
        const firstName = contact.metadata.first_name?.toLowerCase() || ''
        const lastName = contact.metadata.last_name?.toLowerCase() || ''
        const email = contact.metadata.email?.toLowerCase() || ''
        
        return firstName.includes(searchLower) ||
               lastName.includes(searchLower) ||
               email.includes(searchLower)
      })
      
      // Update total for filtered results
      total = contacts.length
      
      // Apply pagination to filtered results
      contacts = contacts.slice(skip, skip + limit)
    }

    const totalPages = Math.ceil(total / limit)

    return {
      contacts,
      total,
      page,
      limit,
      totalPages
    }
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return {
        contacts: [],
        total: 0,
        page: 1,
        limit: 25,
        totalPages: 0
      }
    }
    console.error('Error fetching email contacts:', error)
    throw new Error('Failed to fetch email contacts')
  }
}

export async function getEmailContact(id: string): Promise<EmailContact | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(['id', 'title', 'slug', 'metadata', 'created_at', 'modified_at'])
      .depth(1)
    
    return object as EmailContact
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null
    }
    console.error(`Error fetching email contact ${id}:`, error)
    throw new Error('Failed to fetch email contact')
  }
}

export async function createEmailContact(data: CreateContactData): Promise<EmailContact> {
  try {
    const { object } = await cosmic.objects.insertOne({
      title: `${data.first_name} ${data.last_name || ''}`.trim(),
      type: 'email-contacts',
      metadata: {
        first_name: data.first_name,
        last_name: data.last_name || '',
        email: data.email,
        status: {
          key: data.status.toLowerCase().replace(' ', '_'),
          value: data.status
        },
        tags: data.tags || [],
        subscribe_date: data.subscribe_date || new Date().toISOString(),
        notes: data.notes || ''
      }
    })

    return object as EmailContact
  } catch (error) {
    console.error('Error creating email contact:', error)
    throw new Error('Failed to create email contact')
  }
}

export async function updateEmailContact(id: string, data: Partial<CreateContactData>): Promise<EmailContact> {
  try {
    const updateData: any = {}

    // Update title if name fields changed
    if (data.first_name !== undefined || data.last_name !== undefined) {
      // Get current contact to merge name fields
      const current = await getEmailContact(id)
      if (!current) throw new Error('Contact not found')
      
      const firstName = data.first_name !== undefined ? data.first_name : current.metadata.first_name
      const lastName = data.last_name !== undefined ? data.last_name : (current.metadata.last_name || '')
      
      updateData.title = `${firstName} ${lastName}`.trim()
    }

    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {}
    
    if (data.first_name !== undefined) metadataUpdates.first_name = data.first_name
    if (data.last_name !== undefined) metadataUpdates.last_name = data.last_name
    if (data.email !== undefined) metadataUpdates.email = data.email
    if (data.tags !== undefined) metadataUpdates.tags = data.tags
    if (data.notes !== undefined) metadataUpdates.notes = data.notes
    
    if (data.status !== undefined) {
      metadataUpdates.status = {
        key: data.status.toLowerCase().replace(' ', '_'),
        value: data.status
      }
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates
    }

    const { object } = await cosmic.objects.updateOne(id, updateData)
    return object as EmailContact
  } catch (error) {
    console.error(`Error updating email contact ${id}:`, error)
    throw new Error('Failed to update email contact')
  }
}

export async function deleteEmailContact(id: string): Promise<void> {
  try {
    await cosmic.objects.deleteOne(id)
  } catch (error) {
    console.error(`Error deleting email contact ${id}:`, error)
    throw new Error('Failed to delete email contact')
  }
}

// Unsubscribe function
export async function unsubscribeContact(email: string): Promise<boolean> {
  try {
    // Find contact by email
    const { objects } = await cosmic.objects
      .find({ 
        type: 'email-contacts',
        'metadata.email': email 
      })
      .props(['id', 'metadata'])
      .depth(0)
    
    if (objects.length === 0) {
      return false // Contact not found
    }

    const contact = objects[0]
    
    // Update status to unsubscribed
    await cosmic.objects.updateOne(contact.id, {
      metadata: {
        status: 'Unsubscribed'
      }
    })
    
    return true
  } catch (error) {
    console.error(`Error unsubscribing contact with email ${email}:`, error)
    return false
  }
}

// Email Templates
export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: 'email-templates' })
      .props(['id', 'title', 'slug', 'metadata', 'created_at', 'modified_at'])
      .depth(1)
    
    return objects as EmailTemplate[]
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return []
    }
    console.error('Error fetching email templates:', error)
    throw new Error('Failed to fetch email templates')
  }
}

export async function getEmailTemplate(id: string): Promise<EmailTemplate | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(['id', 'title', 'slug', 'metadata', 'created_at', 'modified_at'])
      .depth(1)
    
    return object as EmailTemplate
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null
    }
    console.error(`Error fetching email template ${id}:`, error)
    throw new Error('Failed to fetch email template')
  }
}

export async function createEmailTemplate(data: CreateTemplateData): Promise<EmailTemplate> {
  try {
    const { object } = await cosmic.objects.insertOne({
      title: data.name,
      type: 'email-templates',
      metadata: {
        name: data.name,
        subject: data.subject,
        content: data.content,
        template_type: {
          key: data.template_type.toLowerCase().replace(' ', '_'),
          value: data.template_type
        },
        active: data.active
      }
    })

    return object as EmailTemplate
  } catch (error) {
    console.error('Error creating email template:', error)
    throw new Error('Failed to create email template')
  }
}

export async function updateEmailTemplate(id: string, data: Partial<CreateTemplateData>): Promise<EmailTemplate> {
  try {
    const updateData: any = {}
    
    if (data.name !== undefined) {
      updateData.title = data.name
    }

    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {}
    
    if (data.name !== undefined) metadataUpdates.name = data.name
    if (data.subject !== undefined) metadataUpdates.subject = data.subject
    if (data.content !== undefined) metadataUpdates.content = data.content
    if (data.active !== undefined) metadataUpdates.active = data.active
    
    if (data.template_type !== undefined) {
      metadataUpdates.template_type = {
        key: data.template_type.toLowerCase().replace(' ', '_'),
        value: data.template_type
      }
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates
    }

    const { object } = await cosmic.objects.updateOne(id, updateData)
    return object as EmailTemplate
  } catch (error) {
    console.error(`Error updating email template ${id}:`, error)
    throw new Error('Failed to update email template')
  }
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  try {
    await cosmic.objects.deleteOne(id)
  } catch (error) {
    console.error(`Error deleting email template ${id}:`, error)
    throw new Error('Failed to delete email template')
  }
}

export async function duplicateEmailTemplate(id: string): Promise<EmailTemplate> {
  try {
    const original = await getEmailTemplate(id)
    if (!original) {
      throw new Error('Original template not found')
    }

    const duplicatedData: CreateTemplateData = {
      name: `${original.metadata.name} (Copy)`,
      subject: original.metadata.subject,
      content: original.metadata.content,
      template_type: original.metadata.template_type.value,
      active: original.metadata.active
    }

    return await createEmailTemplate(duplicatedData)
  } catch (error) {
    console.error(`Error duplicating email template ${id}:`, error)
    throw new Error('Failed to duplicate email template')
  }
}

// Marketing Campaigns
export async function getMarketingCampaigns(): Promise<MarketingCampaign[]> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: 'marketing-campaigns' })
      .props(['id', 'title', 'slug', 'metadata', 'created_at', 'modified_at'])
      .depth(1)
    
    return objects as MarketingCampaign[]
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return []
    }
    console.error('Error fetching marketing campaigns:', error)
    throw new Error('Failed to fetch marketing campaigns')
  }
}

export async function getEmailCampaigns(): Promise<MarketingCampaign[]> {
  // Alias for backward compatibility
  return getMarketingCampaigns()
}

export async function getMarketingCampaign(id: string): Promise<MarketingCampaign | null> {
  try {
    const { object } = await cosmic.objects
      .findOne({ id })
      .props(['id', 'title', 'slug', 'metadata', 'created_at', 'modified_at'])
      .depth(1)
    
    return object as MarketingCampaign
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null
    }
    console.error(`Error fetching marketing campaign ${id}:`, error)
    throw new Error('Failed to fetch marketing campaign')
  }
}

// Add alias function for getEmailCampaign
export async function getEmailCampaign(id: string): Promise<MarketingCampaign | null> {
  return getMarketingCampaign(id)
}

export async function createMarketingCampaign(data: CreateCampaignData): Promise<MarketingCampaign> {
  try {
    console.log('Creating marketing campaign with data:', data)
    
    // Validate template exists
    if (data.template_id) {
      const template = await getEmailTemplate(data.template_id)
      if (!template) {
        throw new Error('Selected email template not found')
      }
    }

    // Validate contact IDs if provided - but don't store full contact objects
    let validContactIds: string[] = []
    if (data.contact_ids && data.contact_ids.length > 0) {
      console.log('Validating contacts for IDs:', data.contact_ids)
      
      // Validate each contact ID exists
      const contactPromises = data.contact_ids.map(async (id) => {
        try {
          const contact = await getEmailContact(id)
          return contact ? id : null
        } catch (error) {
          console.error(`Error validating contact ${id}:`, error)
          return null
        }
      })
      
      const validatedIds = await Promise.all(contactPromises)
      validContactIds = validatedIds.filter((id): id is string => id !== null)
      
      console.log(`Found ${validContactIds.length} valid contacts out of ${data.contact_ids.length} requested`)
      
      // Only validate if we specifically requested contacts but found none
      if (validContactIds.length === 0 && data.contact_ids.length > 0) {
        throw new Error('None of the selected contacts could be found or are accessible')
      }
    }

    // Validate that we have targets (either contacts or tags)
    const hasContacts = validContactIds.length > 0
    const hasTags = data.target_tags && data.target_tags.length > 0
    
    if (!hasContacts && !hasTags) {
      throw new Error('No valid targets found - please select contacts or tags')
    }

    console.log(`Creating campaign with ${validContactIds.length} contacts and ${data.target_tags?.length || 0} tags`)

    const { object } = await cosmic.objects.insertOne({
      title: data.name,
      type: 'marketing-campaigns',
      metadata: {
        name: data.name,
        template: data.template_id, // Changed: store template ID in 'template' field
        target_contacts: validContactIds, // Store only IDs in target_contacts field
        target_tags: data.target_tags || [],
        status: {
          key: 'draft',
          value: 'Draft'
        },
        send_date: data.send_date || '',
        stats: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
          open_rate: '0%',
          click_rate: '0%'
        }
      }
    })

    console.log('Marketing campaign created successfully:', object.id)
    return object as MarketingCampaign
  } catch (error) {
    console.error('Error creating marketing campaign:', error)
    throw error // Re-throw to preserve the original error
  }
}

export async function updateCampaignStatus(
  id: string, 
  status: 'Draft' | 'Scheduled' | 'Sending' | 'Sent' | 'Cancelled', 
  stats?: CampaignStats,
  templateSnapshot?: TemplateSnapshot
): Promise<void> {
  try {
    const metadataUpdates: any = {
      status: {
        key: status.toLowerCase(),
        value: status
      }
    }

    if (stats) {
      metadataUpdates.stats = stats
    }

    if (templateSnapshot) {
      metadataUpdates.template_snapshot = templateSnapshot
    }

    await cosmic.objects.updateOne(id, {
      metadata: metadataUpdates
    })
  } catch (error) {
    console.error(`Error updating campaign status for ${id}:`, error)
    throw new Error('Failed to update campaign status')
  }
}

// New function to update campaign progress during batch sending
export async function updateCampaignProgress(
  id: string,
  progress: {
    sent: number
    failed: number
    total: number
    progress_percentage: number
    last_batch_completed: string
  }
): Promise<void> {
  try {
    const metadataUpdates: any = {
      sending_progress: {
        sent: progress.sent,
        failed: progress.failed,
        total: progress.total,
        progress_percentage: progress.progress_percentage,
        last_batch_completed: progress.last_batch_completed,
        last_updated: new Date().toISOString()
      }
    }

    await cosmic.objects.updateOne(id, {
      metadata: metadataUpdates
    })
  } catch (error) {
    console.error(`Error updating campaign progress for ${id}:`, error)
    throw new Error('Failed to update campaign progress')
  }
}

export async function updateMarketingCampaign(id: string, data: Partial<CreateCampaignData & { status?: string; stats?: CampaignStats }>): Promise<MarketingCampaign> {
  try {
    const updateData: any = {}
    
    if (data.name !== undefined) {
      updateData.title = data.name
    }

    // Build metadata updates - ONLY include changed fields
    const metadataUpdates: any = {}
    
    if (data.name !== undefined) metadataUpdates.name = data.name
    if (data.template_id !== undefined) metadataUpdates.template = data.template_id // Changed: use 'template' field
    if (data.target_tags !== undefined) metadataUpdates.target_tags = data.target_tags
    if (data.send_date !== undefined) metadataUpdates.send_date = data.send_date
    if (data.stats !== undefined) metadataUpdates.stats = data.stats
    
    if (data.status !== undefined) {
      metadataUpdates.status = {
        key: data.status.toLowerCase(),
        value: data.status
      }
    }

    // Handle contact_ids if provided - store only IDs in target_contacts
    if (data.contact_ids !== undefined) {
      let validContactIds: string[] = []
      if (data.contact_ids.length > 0) {
        // Validate each contact ID exists
        const contactPromises = data.contact_ids.map(async (id) => {
          try {
            const contact = await getEmailContact(id)
            return contact ? id : null
          } catch (error) {
            console.error(`Error validating contact ${id}:`, error)
            return null
          }
        })
        const validatedIds = await Promise.all(contactPromises)
        validContactIds = validatedIds.filter((id): id is string => id !== null)
      }
      metadataUpdates.target_contacts = validContactIds
    }

    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates
    }

    const { object } = await cosmic.objects.updateOne(id, updateData)
    return object as MarketingCampaign
  } catch (error) {
    console.error(`Error updating marketing campaign ${id}:`, error)
    throw new Error('Failed to update marketing campaign')
  }
}

// Add alias function for updateEmailCampaign
export async function updateEmailCampaign(id: string, data: Partial<CreateCampaignData & { status?: string; stats?: CampaignStats }>): Promise<MarketingCampaign> {
  return updateMarketingCampaign(id, data)
}

export async function deleteMarketingCampaign(id: string): Promise<void> {
  try {
    await cosmic.objects.deleteOne(id)
  } catch (error) {
    console.error(`Error deleting marketing campaign ${id}:`, error)
    throw new Error('Failed to delete marketing campaign')
  }
}

// Add alias function for deleteEmailCampaign
export async function deleteEmailCampaign(id: string): Promise<void> {
  return deleteMarketingCampaign(id)
}

// Settings
export async function getSettings(): Promise<Settings | null> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: 'settings' })
      .props(['id', 'title', 'slug', 'metadata', 'created_at', 'modified_at'])
      .depth(1)
    
    if (objects.length === 0) {
      return null
    }
    
    return objects[0] as Settings
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null
    }
    console.error('Error fetching settings:', error)
    throw new Error('Failed to fetch settings')
  }
}

export async function updateSettings(data: UpdateSettingsData): Promise<Settings> {
  try {
    // First try to get existing settings
    const existingSettings = await getSettings()
    
    if (existingSettings) {
      // Update existing settings - ONLY include changed fields
      const metadataUpdates: any = {}
      
      if (data.from_name !== undefined) metadataUpdates.from_name = data.from_name
      if (data.from_email !== undefined) metadataUpdates.from_email = data.from_email
      if (data.reply_to_email !== undefined) metadataUpdates.reply_to_email = data.reply_to_email
      if (data.company_name !== undefined) metadataUpdates.company_name = data.company_name
      if (data.company_address !== undefined) metadataUpdates.company_address = data.company_address
      if (data.website_url !== undefined) metadataUpdates.website_url = data.website_url
      if (data.support_email !== undefined) metadataUpdates.support_email = data.support_email
      if (data.brand_guidelines !== undefined) metadataUpdates.brand_guidelines = data.brand_guidelines
      if (data.primary_brand_color !== undefined) metadataUpdates.primary_brand_color = data.primary_brand_color
      if (data.secondary_brand_color !== undefined) metadataUpdates.secondary_brand_color = data.secondary_brand_color
      if (data.privacy_policy_url !== undefined) metadataUpdates.privacy_policy_url = data.privacy_policy_url
      if (data.terms_of_service_url !== undefined) metadataUpdates.terms_of_service_url = data.terms_of_service_url
      if (data.google_analytics_id !== undefined) metadataUpdates.google_analytics_id = data.google_analytics_id
      if (data.email_signature !== undefined) metadataUpdates.email_signature = data.email_signature
      if (data.test_emails !== undefined) metadataUpdates.test_emails = data.test_emails
      
      if (data.ai_tone !== undefined) {
        metadataUpdates.ai_tone = {
          key: data.ai_tone.toLowerCase(),
          value: data.ai_tone
        }
      }

      const { object } = await cosmic.objects.updateOne(existingSettings.id, {
        metadata: metadataUpdates
      })
      
      return object as Settings
    } else {
      // Create new settings
      const { object } = await cosmic.objects.insertOne({
        title: 'Email Marketing Settings',
        type: 'settings',
        metadata: {
          from_name: data.from_name,
          from_email: data.from_email,
          reply_to_email: data.reply_to_email || data.from_email,
          company_name: data.company_name,
          company_address: data.company_address || '',
          website_url: data.website_url || '',
          support_email: data.support_email || '',
          brand_guidelines: data.brand_guidelines || '',
          primary_brand_color: data.primary_brand_color || '#007bff',
          secondary_brand_color: data.secondary_brand_color || '#6c757d',
          ai_tone: {
            key: (data.ai_tone || 'professional').toLowerCase(),
            value: data.ai_tone || 'Professional'
          },
          privacy_policy_url: data.privacy_policy_url || '',
          terms_of_service_url: data.terms_of_service_url || '',
          google_analytics_id: data.google_analytics_id || '',
          email_signature: data.email_signature || '',
          test_emails: data.test_emails || ''
        }
      })

      return object as Settings
    }
  } catch (error) {
    console.error('Error updating settings:', error)
    throw new Error('Failed to update settings')
  }
}

// Add alias function for createOrUpdateSettings
export async function createOrUpdateSettings(data: UpdateSettingsData): Promise<Settings> {
  return updateSettings(data)
}

// Helper function to check if an error has a status property
function hasStatus(error: any): error is { status: number } {
  return typeof error === 'object' && error !== null && 'status' in error
}