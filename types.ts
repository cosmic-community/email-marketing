// Base Cosmic object interface
interface CosmicObject {
  id: string;
  slug: string;
  title: string;
  content?: string;
  metadata: Record<string, any>;
  type: string;
  created_at: string;
  modified_at: string;
}

// Template type union
export type TemplateType =
  | "Welcome Email"
  | "Newsletter"
  | "Promotional"
  | "Transactional";

// Media Item interface
export interface MediaItem {
  id: string;
  name: string;
  original_name: string;
  size: number;
  type: string;
  bucket?: string;
  created_at: string;
  folder?: string;
  alt_text?: string;
  width?: number;
  height?: number;
  url: string;
  imgix_url: string;
  metadata?: Record<string, any>;
}

// Enhanced Upload Job interface for background CSV processing with chunked support
export interface UploadJob extends CosmicObject {
  type: "upload-jobs";
  metadata: {
    file_name: string;
    file_size: number;
    total_contacts: number;
    processed_contacts: number;
    successful_contacts: number;
    failed_contacts: number;
    duplicate_contacts: number;
    validation_errors: number;
    status: {
      key: string;
      value: "Pending" | "Processing" | "Completed" | "Failed" | "Cancelled";
    };
    selected_lists: string[]; // List IDs to add contacts to
    csv_data?: string; // Store CSV content for background processing
    error_message?: string;
    progress_percentage: number;
    started_at?: string;
    completed_at?: string;
    processing_rate?: string; // "150 contacts/second"
    estimated_completion?: string;
    errors?: string[]; // Detailed error messages
    duplicates?: string[]; // Duplicate email addresses
    message?: string; // Current processing status message

    // NEW FIELDS FOR CHUNKED PROCESSING:
    current_batch_index?: number; // Track which batch we're currently processing
    batch_size?: number; // Size of each processing batch
    total_batches?: number; // Total number of batches needed
    last_processed_row?: number; // Exact row number last processed
    processing_chunk_size?: number; // Number of contacts to process per cron run
    resume_from_contact?: number; // Contact index to resume from
    chunk_processing_history?: Array<{
      chunk_number: number;
      contacts_processed: number;
      processing_time_ms: number;
      timestamp: string;
      status: "completed" | "partial" | "failed";
    }>; // Track processing history for optimization
    auto_resume_enabled?: boolean; // Whether job should auto-resume after timeout
    max_processing_time_ms?: number; // Maximum time allowed per processing cycle
  };
}

// NEW: Campaign Send Record - tracks individual email sends
// UPDATED: Added "pending" status for atomic reservation
export interface CampaignSend extends CosmicObject {
  type: "campaign-sends";
  metadata: {
    campaign: string; // Reference to campaign (changed from campaign_id for consistency)
    contact: string; // Reference to contact (changed from contact_id for consistency)
    contact_email: string; // For quick lookups
    status: {
      key: string;
      value: "pending" | "sent" | "failed" | "bounced"; // Added "pending" status
    };
    sent_at?: string; // ISO timestamp (optional now since pending records won't have this yet)
    reserved_at?: string; // NEW: Timestamp when contact was reserved
    resend_message_id?: string; // Resend's message ID
    error_message?: string; // If failed
    retry_count?: number; // Number of retries
  };
}

// Email List interface
export interface EmailList extends CosmicObject {
  type: "email-lists";
  metadata: {
    name: string;
    description?: string;
    list_type: {
      key: string;
      value: "General" | "Newsletter" | "Promotional" | "Transactional" | "VIP";
    };
    active?: boolean;
    created_date?: string;
    total_contacts?: number;
  };
}

// Email Contact interface - Updated to include lists
export interface EmailContact extends CosmicObject {
  type: "email-contacts";
  metadata: {
    first_name: string;
    last_name?: string;
    email: string;
    status: {
      key: string;
      value: "Active" | "Unsubscribed" | "Bounced" | "Pending";
    };
    lists?: EmailList[] | string[]; // Can be full objects or IDs
    tags?: string[] | null;
    subscribe_date?: string;
    notes?: string | null;
    unsubscribed_date?: string; // Date when contact unsubscribed
    unsubscribe_campaign?: string | MarketingCampaign; // Campaign that triggered unsubscribe
    verification_token?: string; // Token for email verification (double opt-in)
    verification_token_expires?: string; // Expiration timestamp for verification token
    verified_at?: string; // Timestamp when email was verified
  };
}

// Email Template interface - removed category field
export interface EmailTemplate extends CosmicObject {
  type: "email-templates";
  metadata: {
    name: string;
    subject: string;
    content: string;
    template_type: {
      key: string;
      value: TemplateType;
    };
    preview_image?: {
      url: string;
      imgix_url: string;
    };
    tags?: string[];
    is_ai_generated?: boolean;
    active: boolean;
  };
}

// Campaign statistics interface - added missing opened property
export interface CampaignStats {
  sent?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  bounced?: number;
  unsubscribed?: number;
  open_rate?: string;
  click_rate?: string;
}

// Campaign sending progress interface for batch tracking
export interface CampaignProgress {
  sent: number;
  failed: number;
  total: number;
  progress_percentage: number;
  last_batch_completed: string;
  last_updated?: string;
}

// Campaign content interface for storing decoupled template content
export interface CampaignContent {
  subject: string;
  content: string;
  template_type: {
    key: string;
    value: TemplateType;
  };
  original_template_id?: string; // Track which template was used originally
}

// Marketing Campaign interface - Updated with rate limiting fields
export interface MarketingCampaign extends CosmicObject {
  type: "marketing-campaigns";
  metadata: {
    name: string;
    campaign_content?: CampaignContent; // NEW: stores decoupled content
    template?: string | EmailTemplate; // DEPRECATED: for backward compatibility
    target_lists?: EmailList[] | string[]; // NEW: target lists for sending
    target_contacts?: EmailContact[] | string[]; // Can be populated objects (depth=1) or IDs
    target_tags?: string[];
    status: {
      key: string;
      value:
        | "Draft"
        | "Scheduled"
        | "Sending"
        | "Sent"
        | "Paused"
        | "Cancelled";
    };
    send_date?: string; // Scheduled send time (ISO 8601)
    sent_at?: string; // NEW: Actual sent timestamp (ISO 8601)
    stats?: CampaignStats;
    sending_progress?: CampaignProgress;
    public_sharing_enabled?: boolean; // NEW: controls public link sharing

    // NEW: Rate limiting fields
    rate_limit_hit_at?: string; // Timestamp when rate limit was hit
    retry_after?: number; // Seconds to wait before retrying

    // NEW: Distributed locking for serverless environments
    processing_lock?: {
      processor_id: string;
      locked_at: string;
      expires_at: string;
    };

    // Backward compatibility fields
    subject?: string; // DEPRECATED: use campaign_content.subject
    content?: string; // DEPRECATED: use campaign_content.content
  };
}

// Add EmailCampaign as an alias for MarketingCampaign for backward compatibility
export interface EmailCampaign extends CosmicObject {
  type: "marketing-campaigns";
  metadata: {
    name: string;
    campaign_content?: CampaignContent; // NEW: stores decoupled content
    template?: string | EmailTemplate; // DEPRECATED: for backward compatibility
    target_lists?: EmailList[] | string[];
    target_contacts?: EmailContact[] | string[]; // Can be populated objects (depth=1) or IDs
    target_tags?: string[];
    status: {
      key: string;
      value:
        | "Draft"
        | "Scheduled"
        | "Sending"
        | "Sent"
        | "Paused"
        | "Cancelled";
    };
    send_date?: string; // Scheduled send time (ISO 8601)
    sent_at?: string; // NEW: Actual sent timestamp (ISO 8601)
    stats?: CampaignStats;
    sending_progress?: CampaignProgress;
    public_sharing_enabled?: boolean; // NEW: controls public link sharing

    // NEW: Rate limiting fields
    rate_limit_hit_at?: string;
    retry_after?: number;

    // NEW: Distributed locking for serverless environments
    processing_lock?: {
      processor_id: string;
      locked_at: string;
      expires_at: string;
    };

    // Backward compatibility fields
    subject?: string; // DEPRECATED: use campaign_content.subject
    content?: string; // DEPRECATED: use campaign_content.content
  };
}

// Add Campaign type alias for backward compatibility
export type Campaign = MarketingCampaign;

// Settings interface - Updated to use comma-separated string for test_emails and added brand_logo
export interface Settings extends CosmicObject {
  type: "settings";
  metadata: {
    from_name: string;
    from_email: string;
    reply_to_email?: string;
    company_name: string;
    company_address?: string;
    website_url?: string;
    support_email?: string;
    brand_guidelines?: string;
    primary_brand_color?: string;
    secondary_brand_color?: string;
    brand_logo?: {
      url: string;
      imgix_url: string;
    };
    ai_tone?: {
      key: string;
      value: "Professional" | "Friendly" | "Casual" | "Formal";
    };
    privacy_policy_url?: string;
    terms_of_service_url?: string;
    google_analytics_id?: string;
    email_signature?: string;
    unsubscribe_url?: string;
    tracking_enabled?: boolean;
    resend_api_key?: string;
    test_emails?: string; // Changed from string[] to string for comma-separated format
  };
}

// API response types
export interface CosmicResponse<T> {
  objects: T[];
  total: number;
  limit: number;
  skip: number;
}

// Form data types
export interface CreateContactData {
  first_name: string;
  last_name?: string;
  email: string;
  status: "Active" | "Unsubscribed" | "Bounced" | "Pending";
  list_ids?: string[]; // NEW: for list membership
  tags?: string[];
  subscribe_date?: string;
  notes?: string;
  verification_token?: string; // Token for email verification
  verification_token_expires?: string; // Expiration timestamp
}

export interface CreateListData {
  name: string;
  description?: string;
  list_type: "General" | "Newsletter" | "Promotional" | "Transactional" | "VIP";
  active?: boolean;
}

export interface CreateTemplateData {
  name: string;
  subject: string;
  content: string;
  template_type: TemplateType;
  active: boolean;
}

export interface CreateCampaignData {
  name: string;
  template_id: string; // Still use template_id in form data for clarity
  list_ids?: string[]; // NEW: target lists
  contact_ids?: string[];
  target_tags?: string[];
  send_date?: string;
  subject?: string; // NEW: subject for campaign content
  content?: string; // NEW: content for campaign content
  public_sharing_enabled?: boolean; // NEW: controls public sharing
}

export interface UpdateSettingsData {
  from_name: string;
  from_email: string;
  reply_to_email?: string;
  company_name: string;
  company_address?: string;
  website_url?: string;
  support_email?: string;
  brand_guidelines?: string;
  primary_brand_color?: string;
  secondary_brand_color?: string;
  ai_tone?: "Professional" | "Friendly" | "Casual" | "Formal";
  privacy_policy_url?: string;
  terms_of_service_url?: string;
  google_analytics_id?: string;
  email_signature?: string;
  test_emails?: string | string[]; // Allow both comma-separated string and array formats
}

// List management data types
export interface BulkListUpdateData {
  contact_ids: string[];
  list_ids_to_add: string[];
  list_ids_to_remove: string[];
}

// Enhanced upload job data types with chunked processing support
export interface CreateUploadJobData {
  file_name: string;
  file_size: number;
  total_contacts: number;
  csv_data: string;
  selected_lists: string[];
  processing_chunk_size?: number; // Optional chunk size override
  auto_resume_enabled?: boolean; // Optional auto-resume setting
}

// Type guards
export function isEmailList(obj: CosmicObject): obj is EmailList {
  return obj.type === "email-lists";
}

export function isEmailContact(obj: CosmicObject): obj is EmailContact {
  return obj.type === "email-contacts";
}

export function isEmailTemplate(obj: CosmicObject): obj is EmailTemplate {
  return obj.type === "email-templates";
}

export function isMarketingCampaign(
  obj: CosmicObject
): obj is MarketingCampaign {
  return obj.type === "marketing-campaigns";
}

export function isSettings(obj: CosmicObject): obj is Settings {
  return obj.type === "settings";
}

export function isUploadJob(obj: CosmicObject): obj is UploadJob {
  return obj.type === "upload-jobs";
}

export function isMediaItem(obj: any): obj is MediaItem {
  return obj && typeof obj.id === "string" && typeof obj.url === "string";
}

export function isCampaignSend(obj: CosmicObject): obj is CampaignSend {
  return obj.type === "campaign-sends";
}

// Utility types
export type OptionalMetadata<T extends CosmicObject> = Partial<T["metadata"]>;
export type CreateContactFormData = Omit<
  EmailContact,
  "id" | "created_at" | "modified_at"
>;
export type CreateListFormData = Omit<
  EmailList,
  "id" | "created_at" | "modified_at"
>;
export type CreateTemplateFormData = Omit<
  EmailTemplate,
  "id" | "created_at" | "modified_at"
>;
export type CreateCampaignFormData = Omit<
  MarketingCampaign,
  "id" | "created_at" | "modified_at"
>;
export type CreateSettingsFormData = Omit<
  Settings,
  "id" | "created_at" | "modified_at"
>;
