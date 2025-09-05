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
export type TemplateType = 'Welcome Email' | 'Newsletter' | 'Promotional' | 'Transactional';

// Email Contact interface
export interface EmailContact extends CosmicObject {
  type: 'email-contacts';
  metadata: {
    first_name: string;
    last_name?: string;
    email: string;
    status: {
      key: string;
      value: 'Active' | 'Unsubscribed' | 'Bounced';
    };
    tags?: string[] | null;
    subscribe_date?: string;
    notes?: string | null;
  };
}

// Email Template interface - removed category field
export interface EmailTemplate extends CosmicObject {
  type: 'email-templates';
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

// Template snapshot interface for preserving sent content
export interface TemplateSnapshot {
  name: string;
  subject: string;
  content: string;
  template_type: {
    key: string;
    value: TemplateType;
  };
  snapshot_date: string;
  original_template_id: string;
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

// Batch processing error log entry
export interface BatchErrorLog {
  timestamp: string;
  batch: number;
  error: string;
  retry_count: number;
}

// Marketing Campaign interface - Updated with batch processing fields
export interface MarketingCampaign extends CosmicObject {
  type: 'marketing-campaigns';
  metadata: {
    name: string;
    template_id: string;
    template?: EmailTemplate;
    template_snapshot?: TemplateSnapshot;
    target_contacts?: EmailContact[];
    target_tags?: string[];
    status: {
      key: string;
      value: 'Draft' | 'Scheduled' | 'Sending' | 'Paused' | 'Sent' | 'Cancelled';
    };
    send_date?: string;
    stats?: CampaignStats;
    // Batch processing fields
    batch_size?: number;
    batch_delay_minutes?: number;
    total_recipients?: number;
    current_batch?: number;
    last_batch_sent_at?: string;
    priority?: {
      key: string;
      value: 'Low' | 'Normal' | 'High';
    };
    max_retry_attempts?: number;
    retry_count?: number;
    error_log?: BatchErrorLog[];
  };
}

// Add EmailCampaign as an alias for MarketingCampaign for backward compatibility
export interface EmailCampaign extends CosmicObject {
  type: 'marketing-campaigns';
  metadata: {
    name: string;
    template_id: string;
    template?: EmailTemplate;
    template_snapshot?: TemplateSnapshot;
    target_contacts?: EmailContact[];
    target_tags?: string[];
    status: {
      key: string;
      value: 'Draft' | 'Scheduled' | 'Sending' | 'Paused' | 'Sent' | 'Cancelled';
    };
    send_date?: string;
    stats?: CampaignStats;
    // Batch processing fields
    batch_size?: number;
    batch_delay_minutes?: number;
    total_recipients?: number;
    current_batch?: number;
    last_batch_sent_at?: string;
    priority?: {
      key: string;
      value: 'Low' | 'Normal' | 'High';
    };
    max_retry_attempts?: number;
    retry_count?: number;
    error_log?: BatchErrorLog[];
  };
}

// Add Campaign type alias for backward compatibility
export type Campaign = MarketingCampaign;

// Settings interface - Updated to use comma-separated string for test_emails
export interface Settings extends CosmicObject {
  type: 'settings';
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
      value: 'Professional' | 'Friendly' | 'Casual' | 'Formal';
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
  status: 'Active' | 'Unsubscribed' | 'Bounced';
  tags?: string[];
  subscribe_date?: string;
  notes?: string;
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
  template_id: string;
  contact_ids?: string[];
  target_tags?: string[];
  send_date?: string;
  batch_size?: number;
  batch_delay_minutes?: number;
  priority?: 'Low' | 'Normal' | 'High';
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
  ai_tone?: 'Professional' | 'Friendly' | 'Casual' | 'Formal';
  privacy_policy_url?: string;
  terms_of_service_url?: string;
  google_analytics_id?: string;
  email_signature?: string;
  test_emails?: string; // Changed from string[] to string for comma-separated format
}

// Type guards
export function isEmailContact(obj: CosmicObject): obj is EmailContact {
  return obj.type === 'email-contacts';
}

export function isEmailTemplate(obj: CosmicObject): obj is EmailTemplate {
  return obj.type === 'email-templates';
}

export function isMarketingCampaign(obj: CosmicObject): obj is MarketingCampaign {
  return obj.type === 'marketing-campaigns';
}

export function isSettings(obj: CosmicObject): obj is Settings {
  return obj.type === 'settings';
}

// Utility types
export type OptionalMetadata<T extends CosmicObject> = Partial<T['metadata']>;
export type CreateContactFormData = Omit<EmailContact, 'id' | 'created_at' | 'modified_at'>;
export type CreateTemplateFormData = Omit<EmailTemplate, 'id' | 'created_at' | 'modified_at'>;
export type CreateCampaignFormData = Omit<MarketingCampaign, 'id' | 'created_at' | 'modified_at'>;
export type CreateSettingsFormData = Omit<Settings, 'id' | 'created_at' | 'modified_at'>;