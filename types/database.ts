/**
 * VeriFlow Database Types
 * TypeScript types mirroring Supabase PostgreSQL schema
 */

// ============================================================================
// Enums and Constants
// ============================================================================

export type UserRole = 'super_admin' | 'business_admin' | 'verifier';

export type VerificationStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'more_info_requested'
  | 'resubmitted'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'escalated';

export type VerificationDecision = 'approved' | 'rejected';

export type PolicyCategory = 'property' | 'vehicle' | 'banking';

export type PolicyType = 'home_insurance' | 'auto_insurance' | 'credit_card';

export type PolicyStatus = 'active' | 'inactive';

export type VerifierAction = 'approve' | 'reject' | 'request_more_info';

export type PredefinedRejectionReason =
  | 'blurry'
  | 'wrong_angle'
  | 'lighting'
  | 'mismatch'
  | 'other';

export type ActorType = 'customer' | 'verifier' | 'admin' | 'system';

export type WebhookStatus = 'pending' | 'sent' | 'failed';

export type IdentityMethod = 'otp_sms' | 'otp_email';

export type PhotoIdType = 'aadhaar' | 'pan' | 'passport' | 'drivers_license';

export type IdVerificationStatus = 'pending' | 'verified' | 'failed';

// ============================================================================
// Table: businesses
// ============================================================================

export interface Business {
  id: string;
  name: string;
  industry: 'insurance' | 'banking' | null;
  country: string;
  logo_url: string | null;
  primary_color: string;
  contact_email: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  created_at: string;
  updated_at: string;
}

export type BusinessInsert = Omit<Business, 'id' | 'created_at' | 'updated_at'>;
export type BusinessUpdate = Partial<BusinessInsert>;

// ============================================================================
// Table: users
// ============================================================================

export interface User {
  id: string;
  business_id: string | null;
  role: UserRole;
  full_name: string | null;
  email: string;
  phone: string | null;
  team_id: string | null;
  is_active: boolean;
  created_at: string;
}

export type UserInsert = Omit<User, 'id' | 'created_at'>;
export type UserUpdate = Partial<Omit<UserInsert, 'id'>>;

// ============================================================================
// Table: teams
// ============================================================================

export interface Team {
  id: string;
  business_id: string | null;
  name: string;
  policy_types: PolicyType[];
  created_at: string;
}

export type TeamInsert = Omit<Team, 'id' | 'created_at'>;
export type TeamUpdate = Partial<TeamInsert>;

// ============================================================================
// Table: policies
// ============================================================================

export interface Policy {
  id: string;
  business_id: string | null;
  external_policy_id: string | null;
  policy_name: string;
  policy_type: PolicyType;
  policy_category: PolicyCategory | null;
  policy_data: Record<string, unknown> | null;
  template_id: string | null;
  sla_hours: number;
  status: PolicyStatus;
  created_at: string;
  updated_at: string;
}

export type PolicyInsert = Omit<Policy, 'id' | 'created_at' | 'updated_at'>;
export type PolicyUpdate = Partial<PolicyInsert>;

// ============================================================================
// Template JSONB Structures
// ============================================================================

export interface ConditionalField {
  field_id: string;
  label: string;
  instruction?: string;
  required: boolean;
  capture_gps?: boolean;
}

export interface QuestionConditional {
  if_answer: string;
  show_fields: ConditionalField[];
}

export interface TemplateQuestion {
  question_id: string;
  text: string;
  type: 'single_select' | 'multi_select' | 'number' | 'text';
  options?: string[];
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
  };
  conditional?: QuestionConditional;
}

export interface TemplatePhotoField {
  field_id: string;
  label: string;
  instruction?: string;
  required: boolean;
  min_resolution?: string;
  capture_gps: boolean;
}

export interface TemplateCategory {
  category_id: string;
  category_name: string;
  order: number;
  photo_fields?: TemplatePhotoField[];
  questions?: TemplateQuestion[];
}

export interface RequiredDocument {
  document_id: string;
  name: string;
  required: boolean;
  ocr_enabled: boolean;
}

export interface ValidationRules {
  gps_required_for_policy_type: boolean;
  gps_tolerance_meters?: number;
}

// ============================================================================
// Table: templates
// ============================================================================

export interface Template {
  id: string;
  business_id: string | null;
  template_name: string;
  policy_type: PolicyType;
  version: number;
  categories: TemplateCategory[];
  required_documents: RequiredDocument[];
  validation_rules: ValidationRules;
  consent_text: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TemplateInsert = Omit<Template, 'id' | 'created_at' | 'updated_at'>;
export type TemplateUpdate = Partial<TemplateInsert>;

// ============================================================================
// Table: verifications
// ============================================================================

export interface PropertyCoordinates {
  lat: number;
  lon: number;
}

export interface FraudFlag {
  type: string;
  message: string;
  detected_at: string;
}

export interface Verification {
  id: string;
  verification_ref: string;
  business_id: string | null;
  policy_id: string | null;
  template_id: string | null;
  template_snapshot: TemplateCategory[];
  
  // Customer Info
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  customer_address: string | null;
  
  // Pre-fill Data
  prefill_data: Record<string, unknown>;
  
  // Agent Assignment
  assigned_verifier_id: string | null;
  assigned_team_id: string | null;
  
  // Link Management
  link_token: string;
  link_expiry: string;
  link_accessed_at: string | null;
  
  // Status Tracking
  status: VerificationStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  decision: VerificationDecision | null;
  decision_reason: string | null;
  rejection_count: number;
  
  // Location (only for property policies)
  property_coordinates: PropertyCoordinates | null;
  
  // Fraud Detection
  fraud_score: number;
  fraud_flags: FraudFlag[];
  
  created_at: string;
  updated_at: string;
}

export type VerificationInsert = Omit<Verification, 'id' | 'created_at' | 'updated_at'>;
export type VerificationUpdate = Partial<VerificationInsert>;

// ============================================================================
// Submission JSONB Structures
// ============================================================================

export interface SubmissionCategoryData {
  category_id: string;
  photos: {
    field_id: string;
    url: string;
    gps?: PropertyCoordinates;
    captured_at: string;
  }[];
  answers: {
    question_id: string;
    value: string | number | string[];
  }[];
}

export interface SubmissionDocument {
  document_id: string;
  url: string;
  uploaded_at: string;
}

// ============================================================================
// Table: submissions
// ============================================================================

export interface Submission {
  id: string;
  verification_id: string | null;
  submission_number: number;
  
  // Identity Verification
  identity_method: IdentityMethod;
  otp_verified_at: string | null;
  photo_id_type: PhotoIdType | null;
  photo_id_number_encrypted: string | null;
  photo_id_url: string | null;
  id_verification_api_response: Record<string, unknown> | null;
  id_verification_status: IdVerificationStatus;
  
  // Consent
  consent_given: boolean;
  consent_timestamp: string | null;
  consent_ip: string | null;
  
  // Form Data
  categories: SubmissionCategoryData[];
  documents: SubmissionDocument[];
  
  submitted_at: string;
}

export type SubmissionInsert = Omit<Submission, 'id'>;
export type SubmissionUpdate = Partial<SubmissionInsert>;

// ============================================================================
// Table: otp_sessions
// ============================================================================

export interface OTPSession {
  id: string;
  verification_id: string;
  phone: string;
  otp_hash: string;
  attempts: number;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

export type OTPSessionInsert = Omit<OTPSession, 'id' | 'created_at'>;
export type OTPSessionUpdate = Partial<OTPSessionInsert>;

// ============================================================================
// Table: verifier_actions
// ============================================================================

export interface VerifierActionRecord {
  id: string;
  verification_id: string | null;
  verifier_id: string | null;
  action: VerifierAction;
  reason: string | null;
  predefined_reason: PredefinedRejectionReason | null;
  rejected_fields: string[];
  internal_notes: string | null;
  timestamp: string;
}

export type VerifierActionInsert = Omit<VerifierActionRecord, 'id' | 'timestamp'>;
export type VerifierActionUpdate = Partial<VerifierActionInsert>;

// ============================================================================
// Table: audit_logs
// ============================================================================

export interface AuditLog {
  id: string;
  verification_id: string | null;
  actor_id: string | null;
  actor_type: ActorType | null;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  timestamp: string;
}

export type AuditLogInsert = Omit<AuditLog, 'id' | 'timestamp'>;

// ============================================================================
// Table: webhooks_queue
// ============================================================================

export interface WebhookQueueItem {
  id: string;
  business_id: string | null;
  verification_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  status: WebhookStatus;
  attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export type WebhookQueueInsert = Omit<WebhookQueueItem, 'id' | 'created_at'>;
export type WebhookQueueUpdate = Partial<WebhookQueueInsert>;

// ============================================================================
// Database Schema Type (for Supabase client typing)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: Business;
        Insert: BusinessInsert;
        Update: BusinessUpdate;
      };
      users: {
        Row: User;
        Insert: UserInsert;
        Update: UserUpdate;
      };
      teams: {
        Row: Team;
        Insert: TeamInsert;
        Update: TeamUpdate;
      };
      policies: {
        Row: Policy;
        Insert: PolicyInsert;
        Update: PolicyUpdate;
      };
      templates: {
        Row: Template;
        Insert: TemplateInsert;
        Update: TemplateUpdate;
      };
      verifications: {
        Row: Verification;
        Insert: VerificationInsert;
        Update: VerificationUpdate;
      };
      submissions: {
        Row: Submission;
        Insert: SubmissionInsert;
        Update: SubmissionUpdate;
      };
      otp_sessions: {
        Row: OTPSession;
        Insert: OTPSessionInsert;
        Update: OTPSessionUpdate;
      };
      verifier_actions: {
        Row: VerifierActionRecord;
        Insert: VerifierActionInsert;
        Update: VerifierActionUpdate;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: AuditLogInsert;
        Update: never;
      };
      webhooks_queue: {
        Row: WebhookQueueItem;
        Insert: WebhookQueueInsert;
        Update: WebhookQueueUpdate;
      };
    };
  };
}
