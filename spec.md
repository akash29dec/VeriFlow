 

 

🚀 COMPLETE ANTIGRAVITY PROMPT - VERIFLOW MVP 

 

BUILD: VeriFlow - B2B Remote Verification Platform 

🎯 Project Overview 

Build a Next.js 14 B2B SaaS application enabling insurance/banking businesses to conduct remote customer verification via mobile-first forms with photo uploads, conditional GPS validation, and document verification. 

Key Differentiation: GPS validation applies ONLY to property-based policies (home insurance), not vehicle/banking verifications. 

 

🛠 Tech Stack 

Framework: Next.js 14.1+ (App Router), React 18, TypeScript 5.3+ 

Styling: Tailwind CSS 3.4+ + Shadcn UI components 

Backend: Next.js API Routes 

Database: PostgreSQL 15+ via Supabase 

Auth: Supabase Auth (email/password + RLS policies) 

Storage: Supabase Storage (encrypted at rest) 

Deployment: Vercel (free tier) 

SMS: Twilio (free trial, 3 test numbers) 

Email: Resend (3,000 free emails/month) 

 

📊 Database Schema (Supabase PostgreSQL) 

Table: businesses 

CREATE TABLE businesses ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  name VARCHAR(255) NOT NULL, 
  industry VARCHAR(100), -- 'insurance', 'banking' 
  country CHAR(2) DEFAULT 'IN', 
  logo_url TEXT, 
  primary_color VARCHAR(7) DEFAULT '#0066CC', 
  contact_email VARCHAR(255), 
  webhook_url TEXT, 
  webhook_secret VARCHAR(255), 
  created_at TIMESTAMPTZ DEFAULT NOW(), 
  updated_at TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_businesses_country ON businesses(country); 
 

Table: users 

CREATE TABLE users ( 
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, 
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, 
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'business_admin', 'verifier')), 
  full_name VARCHAR(255), 
  email VARCHAR(255) UNIQUE NOT NULL, 
  phone VARCHAR(20), 
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL, 
  is_active BOOLEAN DEFAULT TRUE, 
  created_at TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_users_business ON users(business_id); 
CREATE INDEX idx_users_role ON users(role); 
CREATE INDEX idx_users_email ON users(email); 
 

Table: teams 

CREATE TABLE teams ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, 
  name VARCHAR(255) NOT NULL, 
  policy_types JSONB DEFAULT '[]', -- ['home_insurance', 'auto_insurance'] 
  created_at TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_teams_business ON teams(business_id); 
 

Table: policies 

CREATE TABLE policies ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, 
  external_policy_id VARCHAR(255), -- From external Business API 
  policy_name VARCHAR(255) NOT NULL, 
  policy_type VARCHAR(100) NOT NULL, -- 'home_insurance', 'auto_insurance', 'credit_card' 
  policy_category VARCHAR(100), -- 'property', 'vehicle', 'banking' 
  policy_data JSONB, -- Full JSON from external API 
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL, 
  sla_hours INTEGER DEFAULT 24, 
  status VARCHAR(50) DEFAULT 'active', 
  created_at TIMESTAMPTZ DEFAULT NOW(), 
  updated_at TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_policies_business ON policies(business_id); 
CREATE INDEX idx_policies_type ON policies(policy_type); 
CREATE INDEX idx_policies_status ON policies(status); 
CREATE UNIQUE INDEX idx_policies_external ON policies(business_id, external_policy_id); 
 

Table: templates 

CREATE TABLE templates ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, 
  template_name VARCHAR(255) NOT NULL, 
  policy_type VARCHAR(100) NOT NULL, -- Must match policy.policy_type 
  version INTEGER DEFAULT 1, 
  categories JSONB NOT NULL, -- See structure below 
  required_documents JSONB DEFAULT '[]', 
  validation_rules JSONB DEFAULT '{}', 
  consent_text TEXT, 
  is_active BOOLEAN DEFAULT TRUE, 
  created_at TIMESTAMPTZ DEFAULT NOW(), 
  updated_at TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_templates_business ON templates(business_id); 
CREATE INDEX idx_templates_type ON templates(policy_type); 
 
-- Template categories JSONB structure: 
/* 
[ 
  { 
    "category_id": "ext_front", 
    "category_name": "Front of Dwelling", 
    "order": 1, 
    "photo_fields": [ 
      { 
        "field_id": "photo_dwelling_front", 
        "label": "Dwelling Front Side", 
        "instruction": "Stand across street, capture full facade", 
        "required": true, 
        "min_resolution": "1280x720", 
        "capture_gps": true 
      } 
    ], 
    "questions": [ 
      { 
        "question_id": "q_swimming_pool", 
        "text": "Do you have a swimming pool?", 
        "type": "single_select", 
        "options": ["Yes", "No"], 
        "required": true, 
        "conditional": { 
          "if_answer": "Yes", 
          "show_fields": [ 
            {"field_id": "photo_pool", "label": "Pool Photo", "required": true} 
          ] 
        } 
      } 
    ] 
  } 
] 
*/ 
 

Table: verifications 

CREATE TABLE verifications ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  verification_ref VARCHAR(50) UNIQUE NOT NULL, -- VER-2026-001234 
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, 
  policy_id UUID REFERENCES policies(id) ON DELETE SET NULL, 
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL, 
  template_snapshot JSONB NOT NULL, -- Immutable copy at creation time 
   
  -- Customer Info 
  customer_name VARCHAR(255) NOT NULL, 
  customer_email VARCHAR(255), 
  customer_phone VARCHAR(20) NOT NULL, 
  customer_address TEXT, 
   
  -- Pre-fill Data 
  prefill_data JSONB DEFAULT '{}', 
   
  -- Agent Assignment 
  assigned_verifier_id UUID REFERENCES users(id) ON DELETE SET NULL, 
  assigned_team_id UUID REFERENCES teams(id) ON DELETE SET NULL, 
   
  -- Link Management 
  link_token VARCHAR(100) UNIQUE NOT NULL, 
  link_expiry TIMESTAMPTZ NOT NULL, 
  link_accessed_at TIMESTAMPTZ, 
   
  -- Status Tracking 
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ( 
    'draft', 'in_progress', 'submitted', 'under_review',  
    'more_info_requested', 'resubmitted', 'approved', 'rejected',  
    'expired', 'cancelled', 'escalated' 
  )), 
   
  submitted_at TIMESTAMPTZ, 
  reviewed_at TIMESTAMPTZ, 
  decision VARCHAR(50) CHECK (decision IN ('approved', 'rejected') OR decision IS NULL), 
  decision_reason TEXT, 
  rejection_count INTEGER DEFAULT 0 CHECK (rejection_count >= 0 AND rejection_count <= 10), 
   
  -- Location (only for property policies) 
  property_coordinates JSONB, -- {"lat": 19.076, "lon": 72.877} 
   
  -- Fraud Detection 
  fraud_score INTEGER DEFAULT 0, 
  fraud_flags JSONB DEFAULT '[]', 
   
  created_at TIMESTAMPTZ DEFAULT NOW(), 
  updated_at TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_verifications_business ON verifications(business_id); 
CREATE INDEX idx_verifications_status ON verifications(status); 
CREATE INDEX idx_verifications_verifier ON verifications(assigned_verifier_id); 
CREATE INDEX idx_verifications_ref ON verifications(verification_ref); 
CREATE INDEX idx_verifications_link ON verifications(link_token); 
CREATE INDEX idx_verifications_submitted ON verifications(submitted_at); 
 

Table: submissions 

CREATE TABLE submissions ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  verification_id UUID REFERENCES verifications(id) ON DELETE CASCADE, 
  submission_number INTEGER DEFAULT 1, 
   
  -- Identity Verification 
  identity_method VARCHAR(50) DEFAULT 'otp_sms', 
  otp_verified_at TIMESTAMPTZ, 
  photo_id_type VARCHAR(50), -- 'aadhaar', 'pan', 'passport', 'drivers_license' 
  photo_id_number_encrypted TEXT, 
  photo_id_url TEXT, 
  id_verification_api_response JSONB, 
  id_verification_status VARCHAR(50) DEFAULT 'pending', 
   
  -- Consent 
  consent_given BOOLEAN DEFAULT FALSE, 
  consent_timestamp TIMESTAMPTZ, 
  consent_ip VARCHAR(45), 
   
  -- Form Data 
  categories JSONB NOT NULL DEFAULT '[]', 
  documents JSONB DEFAULT '[]', 
   
  submitted_at TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_submissions_verification ON submissions(verification_id); 
 

Table: verifier_actions 

CREATE TABLE verifier_actions ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  verification_id UUID REFERENCES verifications(id) ON DELETE CASCADE, 
  verifier_id UUID REFERENCES users(id) ON DELETE SET NULL, 
  action VARCHAR(50) NOT NULL CHECK (action IN ('approve', 'reject', 'request_more_info')), 
  reason TEXT, 
  predefined_reason VARCHAR(100), -- 'blurry', 'wrong_angle', 'lighting', 'mismatch', 'other' 
  rejected_fields JSONB DEFAULT '[]', -- Array of field_ids 
  internal_notes TEXT, 
  timestamp TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_actions_verification ON verifier_actions(verification_id); 
CREATE INDEX idx_actions_verifier ON verifier_actions(verifier_id); 
CREATE INDEX idx_actions_timestamp ON verifier_actions(timestamp); 
 

Table: audit_logs 

CREATE TABLE audit_logs ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  verification_id UUID REFERENCES verifications(id) ON DELETE SET NULL, 
  actor_id UUID, 
  actor_type VARCHAR(50), -- 'customer', 'verifier', 'admin', 'system' 
  action VARCHAR(100) NOT NULL, 
  ip_address VARCHAR(45), 
  user_agent TEXT, 
  details JSONB DEFAULT '{}', 
  timestamp TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_audit_verification ON audit_logs(verification_id); 
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp); 
CREATE INDEX idx_audit_actor ON audit_logs(actor_id); 
 

Table: webhooks_queue 

CREATE TABLE webhooks_queue ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, 
  verification_id UUID REFERENCES verifications(id) ON DELETE CASCADE, 
  event_type VARCHAR(100) NOT NULL, 
  payload JSONB NOT NULL, 
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')), 
  attempts INTEGER DEFAULT 0, 
  last_attempt_at TIMESTAMPTZ, 
  next_retry_at TIMESTAMPTZ, 
  created_at TIMESTAMPTZ DEFAULT NOW() 
); 
 
CREATE INDEX idx_webhooks_status ON webhooks_queue(status); 
CREATE INDEX idx_webhooks_retry ON webhooks_queue(next_retry_at) WHERE status = 'pending'; 
 

 

🔐 Row-Level Security (RLS) Policies 

-- Enable RLS on all tables 
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY; 
ALTER TABLE users ENABLE ROW LEVEL SECURITY; 
ALTER TABLE teams ENABLE ROW LEVEL SECURITY; 
ALTER TABLE policies ENABLE ROW LEVEL SECURITY; 
ALTER TABLE templates ENABLE ROW LEVEL SECURITY; 
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY; 
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY; 
ALTER TABLE verifier_actions ENABLE ROW LEVEL SECURITY; 
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; 
 
-- Super admins see everything 
CREATE POLICY "super_admin_all_access" ON businesses FOR ALL 
  USING ( 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') 
  ); 
 
-- Business admins see their own business 
CREATE POLICY "business_admin_own_business" ON verifications FOR ALL 
  USING ( 
    business_id IN ( 
      SELECT business_id FROM users WHERE id = auth.uid() AND role = 'business_admin' 
    ) 
  ); 
 
-- Verifiers see assigned verifications 
CREATE POLICY "verifier_assigned_only" ON verifications FOR SELECT 
  USING ( 
    assigned_verifier_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('business_admin', 'super_admin')) 
  ); 
 

 

📚 TEMPLATE LIBRARY (Pre-Built) 

Template 1: Home Insurance - Standard 

{ 
  "template_name": "Home Insurance - Standard", 
  "policy_type": "home_insurance", 
  "categories": [ 
    { 
      "category_id": "ext_front", 
      "category_name": "Front of Dwelling", 
      "order": 1, 
      "photo_fields": [ 
        { 
          "field_id": "photo_dwelling_front", 
          "label": "Dwelling Front Side", 
          "instruction": "Stand across the street and capture the full front facade including the roof line.", 
          "required": true, 
          "min_resolution": "1280x720", 
          "capture_gps": true 
        }, 
        { 
          "field_id": "photo_roof_front", 
          "label": "Roof Front Side", 
          "instruction": "Zoom in to show the roof material and condition.", 
          "required": true, 
          "capture_gps": true 
        }, 
        { 
          "field_id": "photo_yard_front", 
          "label": "Front Yard", 
          "instruction": "Show landscaping and any hazards (tree branches near roof, etc.).", 
          "required": true, 
          "capture_gps": true 
        } 
      ] 
    }, 
    { 
      "category_id": "ext_back", 
      "category_name": "Back of Dwelling", 
      "order": 2, 
      "photo_fields": [ 
        { 
          "field_id": "photo_dwelling_back", 
          "label": "Dwelling Back Side", 
          "instruction": "Full view of the back of the property.", 
          "required": true, 
          "capture_gps": true 
        }, 
        { 
          "field_id": "photo_roof_back", 
          "label": "Roof Back Side", 
          "instruction": "Show the rear roof condition.", 
          "required": true, 
          "capture_gps": true 
        } 
      ] 
    }, 
    { 
      "category_id": "ext_utilities", 
      "category_name": "Outdoor Utilities", 
      "order": 3, 
      "questions": [ 
        { 
          "question_id": "q_swimming_pool", 
          "text": "Do you have a swimming pool?", 
          "type": "single_select", 
          "options": ["Yes", "No"], 
          "required": true, 
          "conditional": { 
            "if_answer": "Yes", 
            "show_fields": [ 
              { 
                "field_id": "photo_pool", 
                "label": "Swimming Pool", 
                "instruction": "Full view of pool and surrounding area.", 
                "required": true, 
                "capture_gps": true 
              }, 
              { 
                "field_id": "photo_pool_fence", 
                "label": "Pool Safety Fence", 
                "instruction": "Show the safety fence or gate (required by code).", 
                "required": true, 
                "capture_gps": true 
              } 
            ] 
          } 
        }, 
        { 
          "question_id": "q_num_bathrooms", 
          "text": "How many bathrooms are in the home?", 
          "type": "number", 
          "required": true, 
          "validation": {"min": 1, "max": 10} 
        } 
      ] 
    }, 
    { 
      "category_id": "int_kitchen", 
      "category_name": "Kitchen", 
      "order": 4, 
      "photo_fields": [ 
        { 
          "field_id": "photo_kitchen_overview", 
          "label": "Kitchen Overview", 
          "instruction": "Wide shot showing cabinets, appliances, and flooring.", 
          "required": true, 
          "capture_gps": false 
        } 
      ] 
    }, 
    { 
      "category_id": "int_basement", 
      "category_name": "Basement", 
      "order": 5, 
      "questions": [ 
        { 
          "question_id": "q_has_basement", 
          "text": "Does the home have a basement?", 
          "type": "single_select", 
          "options": ["Yes", "No"], 
          "required": true, 
          "conditional": { 
            "if_answer": "Yes", 
            "show_fields": [ 
              { 
                "field_id": "photo_basement_overview", 
                "label": "Basement Overview", 
                "instruction": "Show the general condition of the basement.", 
                "required": true, 
                "capture_gps": false 
              } 
            ] 
          } 
        } 
      ] 
    } 
  ], 
  "required_documents": [ 
    {"document_id": "doc_aadhaar", "name": "Aadhaar Card", "required": true, "ocr_enabled": true}, 
    {"document_id": "doc_pan", "name": "PAN Card", "required": true, "ocr_enabled": true}, 
    {"document_id": "doc_property_tax", "name": "Property Tax Receipt", "required": true, "ocr_enabled": false} 
  ], 
  "validation_rules": { 
    "gps_required_for_policy_type": true, 
    "gps_tolerance_meters": 100 
  } 
} 
 

Template 2: Auto Insurance - Comprehensive 

{ 
  "template_name": "Auto Insurance - Comprehensive", 
  "policy_type": "auto_insurance", 
  "categories": [ 
    { 
      "category_id": "ext_vehicle", 
      "category_name": "Exterior - Vehicle", 
      "order": 1, 
      "photo_fields": [ 
        { 
          "field_id": "photo_vehicle_front", 
          "label": "Front View", 
          "instruction": "Stand 10 feet away, capture full front of vehicle including license plate.", 
          "required": true, 
          "capture_gps": false 
        }, 
        { 
          "field_id": "photo_vehicle_rear", 
          "label": "Rear View", 
          "instruction": "Full rear view including license plate.", 
          "required": true, 
          "capture_gps": false 
        }, 
        { 
          "field_id": "photo_vehicle_left", 
          "label": "Left Side View", 
          "instruction": "Full side view showing doors and wheels.", 
          "required": true, 
          "capture_gps": false 
        }, 
        { 
          "field_id": "photo_vehicle_right", 
          "label": "Right Side View", 
          "instruction": "Full side view showing doors and wheels.", 
          "required": true, 
          "capture_gps": false 
        } 
      ] 
    }, 
    { 
      "category_id": "ext_details", 
      "category_name": "Exterior - Details", 
      "order": 2, 
      "photo_fields": [ 
        { 
          "field_id": "photo_windshield", 
          "label": "Windshield", 
          "instruction": "Show any cracks or chips clearly.", 
          "required": true, 
          "capture_gps": false 
        }, 
        { 
          "field_id": "photo_all_tires", 
          "label": "All Four Tires", 
          "instruction": "Close-up of each tire showing tread depth.", 
          "required": true, 
          "capture_gps": false 
        } 
      ] 
    }, 
    { 
      "category_id": "int_vehicle", 
      "category_name": "Interior", 
      "order": 3, 
      "photo_fields": [ 
        { 
          "field_id": "photo_dashboard", 
          "label": "Dashboard & Odometer", 
          "instruction": "Clear photo showing odometer reading.", 
          "required": true, 
          "capture_gps": false 
        }, 
        { 
          "field_id": "photo_seats", 
          "label": "Seats Condition", 
          "instruction": "Show front and rear seats.", 
          "required": true, 
          "capture_gps": false 
        } 
      ] 
    }, 
    { 
      "category_id": "vehicle_docs", 
      "category_name": "Vehicle Documents", 
      "order": 4, 
      "photo_fields": [ 
        { 
          "field_id": "photo_rc_book", 
          "label": "RC Book (Registration Certificate)", 
          "instruction": "Clear photo of RC book front page.", 
          "required": true, 
          "capture_gps": false 
        }, 
        { 
          "field_id": "photo_vin", 
          "label": "VIN/Chassis Number", 
          "instruction": "Photo of VIN plate (usually on dashboard or door frame).", 
          "required": true, 
          "capture_gps": false 
        } 
      ] 
    }, 
    { 
      "category_id": "damage_check", 
      "category_name": "Damage Assessment", 
      "order": 5, 
      "questions": [ 
        { 
          "question_id": "q_existing_damage", 
          "text": "Does the vehicle have any existing damage?", 
          "type": "single_select", 
          "options": ["Yes", "No"], 
          "required": true, 
          "conditional": { 
            "if_answer": "Yes", 
            "show_fields": [ 
              { 
                "field_id": "photo_damage_1", 
                "label": "Damage Photo 1", 
                "instruction": "Close-up of damaged area.", 
                "required": true, 
                "capture_gps": false 
              }, 
              { 
                "field_id": "photo_damage_2", 
                "label": "Damage Photo 2 (if applicable)", 
                "instruction": "Additional damage photos if needed.", 
                "required": false, 
                "capture_gps": false 
              } 
            ] 
          } 
        } 
      ] 
    } 
  ], 
  "required_documents": [ 
    {"document_id": "doc_aadhaar", "name": "Aadhaar Card", "required": true, "ocr_enabled": true}, 
    {"document_id": "doc_pan", "name": "PAN Card", "required": true, "ocr_enabled": true}, 
    {"document_id": "doc_driving_license", "name": "Driving License", "required": true, "ocr_enabled": true} 
  ], 
  "validation_rules": { 
    "gps_required_for_policy_type": false 
  } 
} 
 

Template 3: Credit Card - Premium KYC 

{ 
  "template_name": "Credit Card - Premium KYC", 
  "policy_type": "credit_card", 
  "categories": [ 
    { 
      "category_id": "identity_proof", 
      "category_name": "Identity Verification", 
      "order": 1, 
      "photo_fields": [ 
        { 
          "field_id": "photo_selfie", 
          "label": "Selfie Photo", 
          "instruction": "Take a clear selfie holding your ID document next to your face.", 
          "required": true, 
          "capture_gps": false 
        } 
      ] 
    }, 
    { 
      "category_id": "address_proof", 
      "category_name": "Address Verification", 
      "order": 2, 
      "questions": [ 
        { 
          "question_id": "q_residence_type", 
          "text": "Do you own or rent your residence?", 
          "type": "single_select", 
          "options": ["Own", "Rent"], 
          "required": true 
        } 
      ], 
      "photo_fields": [ 
        { 
          "field_id": "photo_address_proof", 
          "label": "Address Proof Document", 
          "instruction": "Upload utility bill, bank statement, or rental agreement (not older than 3 months).", 
          "required": true, 
          "capture_gps": false 
        } 
      ] 
    }, 
    { 
      "category_id": "income_proof", 
      "category_name": "Income Verification", 
      "order": 3, 
      "questions": [ 
        { 
          "question_id": "q_employment_type", 
          "text": "What is your employment type?", 
          "type": "single_select", 
          "options": ["Salaried", "Self-Employed", "Business Owner"], 
          "required": true 
        }, 
        { 
          "question_id": "q_monthly_income", 
          "text": "What is your approximate monthly income (₹)?", 
          "type": "number", 
          "required": true, 
          "validation": {"min": 25000} 
        } 
      ], 
      "photo_fields": [ 
        { 
          "field_id": "photo_salary_slip", 
          "label": "Latest Salary Slip / ITR", 
          "instruction": "Upload your latest 3 months salary slips or last year's ITR.", 
          "required": true, 
          "capture_gps": false 
        } 
      ] 
    } 
  ], 
  "required_documents": [ 
    {"document_id": "doc_aadhaar", "name": "Aadhaar Card", "required": true, "ocr_enabled": true}, 
    {"document_id": "doc_pan", "name": "PAN Card", "required": true, "ocr_enabled": true} 
  ], 
  "validation_rules": { 
    "gps_required_for_policy_type": false 
  } 
} 
 

 

🎯 CORE FEATURES TO BUILD 

1. Authentication System 

Pages: 

/login - Email + password login (Supabase Auth) 

Redirect after login based on role: 

super_admin → /admin/dashboard 

business_admin → /admin/dashboard 

verifier → /agent/dashboard 

Middleware (middleware.ts): 

// Protect routes by role 
export async function middleware(req: NextRequest) { 
  const supabase = createMiddlewareClient({ req, res }); 
  const { data: { session } } = await supabase.auth.getSession(); 
   
  if (req.nextUrl.pathname.startsWith('/admin')) { 
    if (!session) return redirectToLogin(); 
     
    const { data: user } = await supabase 
      .from('users') 
      .select('role') 
      .eq('id', session.user.id) 
      .single(); 
     
    if (!['super_admin', 'business_admin'].includes(user?.role)) { 
      return new NextResponse('Unauthorized', { status: 403 }); 
    } 
  } 
   
  if (req.nextUrl.pathname.startsWith('/agent')) { 
    if (!session) return redirectToLogin(); 
     
    const { data: user } = await supabase 
      .from('users') 
      .select('role') 
      .eq('id', session.user.id) 
      .single(); 
     
    if (!['verifier', 'business_admin', 'super_admin'].includes(user?.role)) { 
      return new NextResponse('Unauthorized', { status: 403 }); 
    } 
  } 
   
  return NextResponse.next(); 
} 
 

 

2. Admin Dashboard (/admin/dashboard) 

Features: 

KPI Cards (4 cards in grid): 

Total Verifications (count all) 

Pending Review (status IN ['submitted', 'under_review']) 

Approved Today (decision = 'approved', reviewed_at = today) 

Avg TAT (average hours between submitted_at and reviewed_at) 

Recent Verifications Table: 

Columns: Ref ID, Customer Name, Policy Type, Status Badge, Assigned To, Created Date, Actions 

Status badges with color coding (use VerificationStatusBadge component) 

Click row → Navigate to /admin/verifications/[id] 

Filters: Status dropdown, Date range, Search by name/ref 

Layout: 

┌─────────────────────────────────────────────┐ 
│ VeriFlow Logo    Dashboard          Logout  │ 
├──────────┬──────────────────────────────────┤ 
│ Sidebar  │  KPI Cards (Grid 4 cols)        │ 
│          │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐│ 
│Dashboard │  │ 145 │ │ 23  │ │ 12  │ │18.5h││ 
│Policies  │  │Total│ │Pend.│ │Appr.│ │ TAT ││ 
│Verif.    │  └─────┘ └─────┘ └─────┘ └─────┘│ 
│Teams     │                                  │ 
│Settings  │  Recent Verifications            │ 
│          │  [Table with filters]            │ 
└──────────┴──────────────────────────────────┘ 
 

 

3. Policy Management (/admin/policies) 

CRITICAL: Automatic Filtering by Policy Type 

Page Flow: 

Step 1: Select Policy Type (/admin/policies) 

┌─────────────────────────────────────────┐ 
│ Select Policy Type                      │ 
├─────────────────────────────────────────┤ 
│ Which type of policies do you want to   │ 
│ import and manage?                      │ 
│                                          │ 
│ Policy Type: *                          │ 
│ ( ) Home Insurance                      │ 
│ (•) Auto Insurance                      │ 
│ ( ) Credit Card / Banking               │ 
│                                          │ 
│ [Fetch Policies from Your System] ────►│ 
└─────────────────────────────────────────┘ 
 

Step 2: Auto-Fetch Policies (/admin/policies/import?type=auto_insurance) 

User selects "Auto Insurance" 

System calls /api/policies/fetch with ?policy_type=auto_insurance query param 

Backend calls external API: GET ${BUSINESS_POLICY_API_URL}?type=auto_insurance 

Returns ONLY auto insurance policies 

Display filtered list with checkboxes 

User selects policies to import → Click "Import Selected" 

Backend Logic (/api/policies/fetch/route.ts): 

export async function GET(request: Request) { 
  const { searchParams } = new URL(request.url); 
  const policyType = searchParams.get('policy_type'); // e.g., 'auto_insurance' 
   
  // Fetch from external API with filter 
  const response = await fetch( 
    `${process.env.BUSINESS_POLICY_API_URL}?type=${policyType}`, 
    { 
      headers: { 
        'Authorization': `Bearer ${process.env.BUSINESS_POLICY_API_KEY}` 
      } 
    } 
  ); 
   
  const policies = await response.json(); 
   
  // Sync to database 
  for (const policy of policies.data) { 
    await supabase.from('policies').upsert({ 
      business_id: currentUser.business_id, 
      external_policy_id: policy.id, 
      policy_name: policy.name, 
      policy_type: policy.type, // IMPORTANT: Store type 
      policy_category: getCategoryFromType(policy.type), // 'property', 'vehicle', 'banking' 
      policy_data: policy, 
      status: 'active' 
    }, { 
      onConflict: 'business_id,external_policy_id' 
    }); 
  } 
   
  return Response.json({ success: true, imported: policies.data.length }); 
} 
 
function getCategoryFromType(type: string): string { 
  if (type.includes('home') || type.includes('property')) return 'property'; 
  if (type.includes('auto') || type.includes('vehicle')) return 'vehicle'; 
  if (type.includes('credit') || type.includes('banking')) return 'banking'; 
  return 'other'; 
} 
 

Step 3: Map Policy to Template (/admin/policies/[id]/template) 

After importing policies, user clicks a policy row 

System shows template selection: 

If policy.policy_type === 'home_insurance' → Show "Home Insurance - Standard" template 

If policy.policy_type === 'auto_insurance' → Show "Auto Insurance - Comprehensive" template 

If policy.policy_type === 'credit_card' → Show "Credit Card - Premium KYC" template 

User clicks "Use This Template" → Template gets pre-loaded with default structure 

 

4. Template Builder (/admin/policies/[id]/template/edit) 

Features: 

Left Panel: Category list (drag-to-reorder) 

Right Panel: Selected category editor 

Add/edit/delete photo fields 

Add/edit/delete questions 

Configure conditional logic (if question answer = X, show fields Y) 

Toggle "GPS Required" per photo field (only visible for home_insurance) 

GPS Toggle Logic: 

// In template builder UI 
{policy.policy_type === 'home_insurance' && ( 
  <label> 
    <input type="checkbox" name="capture_gps" /> 
    GPS Required (validates location within 100m) 
  </label> 
)} 
 
{policy.policy_type === 'auto_insurance' && ( 
  <div className="text-gray-500 text-sm"> 
    GPS validation disabled for vehicle inspections 
  </div> 
)} 
 

Question Types: 

Single Select (Yes/No): Radio buttons, supports conditional logic 

Number: Number input with min/max validation 

Text: Text input 

Conditional Logic Builder: 

Question: Do you have a swimming pool? 
Type: Yes/No 
Required: [✓] 
 
If answer is "Yes", show these additional fields: 
┌────────────────────────────────────────┐ 
│ [+] Photo: Swimming Pool               │ 
│     Label: Swimming Pool               │ 
│     Instruction: Full view of pool...  │ 
│     Required: [✓]                      │ 
│     GPS Required: [✓] (home only)      │ 
│ [Remove]                               │ 
├────────────────────────────────────────┤ 
│ [+] Photo: Pool Safety Fence           │ 
│     Required: [✓]                      │ 
│ [Remove]                               │ 
└────────────────────────────────────────┘ 
[+ Add Conditional Field] 
 

Save Template: 

Stores full template as JSONB in templates table 

Links template to policy: UPDATE policies SET template_id = ? WHERE id = ? 

 

5. Generate Verification Link (/admin/verifications/create) 

Form Fields: 

Select Policy: * [Dropdown showing only active policies] 
  ↓ Auto-loads template when policy selected 
 
Customer Information: * 
  Name: [Text input] 
  Email: [Email input] 
  Phone: [Phone input with country code selector] 
  Address: [Textarea] 
 
Policy Details: * 
  Policy Number: [Text] 
  Sum Assured: [Number with currency symbol] 
  Date Ordered: [Date picker, default: today] 
  Inspection Due Date: [Date picker] 
  Inspection Status: [Dropdown: Pending/Scheduled/Completed] 
 
{policy.policy_type === 'home_insurance' && ( 
  Property Coordinates: * 
    Latitude: [Number input, step=0.000001] 
    Longitude: [Number input, step=0.000001] 
    [Auto-fill from Address] button 
)} 
 
Agent Assignment: 
  (•) Auto-assign (Round Robin) 
  ( ) Assign to specific team: [Dropdown] 
  ( ) Assign to specific verifier: [Dropdown] 
 
Link Expiry: [72 hours ▼] 
 
Notifications: 
  [✓] Send SMS 
  [✓] Send Email 
 
[Generate Verification Link] ──────► 
 

Backend (/api/verifications/create/route.ts): 

import { nanoid } from 'nanoid'; 
 
export async function POST(request: Request) { 
  const body = await request.json(); 
  const { policyId, customer, policyDetails, agentAssignment } = body; 
   
  // Get policy and template 
  const { data: policy } = await supabase 
    .from('policies') 
    .select('*, template:templates(*)') 
    .eq('id', policyId) 
    .single(); 
   
  // Generate unique token and ref 
  const linkToken = nanoid(16); 
  const refNumber = await generateRefNumber(); // VER-2026-XXXXXX 
   
  // Round-robin assignment if auto-assign 
  let assignedVerifierId = null; 
  if (agentAssignment.mode === 'auto') { 
    assignedVerifierId = await assignVerifierRoundRobin( 
      currentUser.business_id, 
      policy.policy_type 
    ); 
  } 
   
  // Geocode address if coordinates not provided (home insurance only) 
  let propertyCoords = body.propertyCoordinates; 
  if (policy.policy_type === 'home_insurance' && !propertyCoords && customer.address) { 
    const geocoded = await geocodeAddress(customer.address); 
    if (geocoded.success) { 
      propertyCoords = geocoded.coordinates; 
    } 
  } 
   
  // Create verification 
  const { data: verification } = await supabase 
    .from('verifications') 
    .insert({ 
      verification_ref: refNumber, 
      business_id: currentUser.business_id, 
      policy_id: policyId, 
      template_id: policy.template.id, 
      template_snapshot: policy.template, // Immutable copy 
      customer_name: customer.name, 
      customer_email: customer.email, 
      customer_phone: customer.phone, 
      customer_address: customer.address, 
      prefill_data: { 
        ...policyDetails, 
        agent_info: await getAgentInfo(assignedVerifierId) 
      }, 
      property_coordinates: propertyCoords, 
      assigned_verifier_id: assignedVerifierId, 
      link_token: linkToken, 
      link_expiry: new Date(Date.now() + 72 * 60 * 60 * 1000), 
      status: 'draft' 
    }) 
    .select() 
    .single(); 
   
  // Generate link 
  const customerLink = `${process.env.NEXT_PUBLIC_APP_URL}/verify/${linkToken}`; 
   
  // Send SMS 
  await sendSMS(customer.phone,  
    `Hi ${customer.name}, complete your ${policy.policy_name} verification: ${customerLink}. Valid for 72 hours. -VeriFlow` 
  ); 
   
  // Send Email 
  await sendEmail(customer.email,  
    `Complete Your ${policy.policy_name} Verification`, 
    EmailTemplates.linkGenerated(customer.name, customerLink, refNumber) 
  ); 
   
  // Audit log 
  await logAction({ 
    verification_id: verification.id, 
    actor_id: currentUser.id, 
    actor_type: 'admin', 
    action: 'link_generated', 
    details: { link_token: linkToken } 
  }); 
   
  return Response.json({  
    success: true,  
    verification: verification, 
    customer_link: customerLink  
  }); 
} 
 

 

6. Customer Verification Flow 

Page 1: Landing (/verify/[linkToken]/page.tsx) 

┌─────────────────────────────────────────┐ 
│         [VeriFlow Logo]                 │ 
│                                          │ 
│    {policy.policy_name} Verification    │ 
│                                          │ 
│ Hi {customer.name},                     │ 
│                                          │ 
│ Complete your verification to proceed   │ 
│ with your application.                  │ 
│                                          │ 
│ This will take approximately 10-15 min. │ 
│                                          │ 
│ You'll need:                            │ 
│ • Clear photos {policyType specific}    │ 
│ • ID proof (Aadhaar/PAN)                │ 
│ • Supporting documents                  │ 
│                                          │ 
│ [Start Verification] ──────────────────►│ 
│                                          │ 
│ Reference: {verification_ref}           │ 
│ Valid until: {expiry_time}              │ 
└─────────────────────────────────────────┘ 
 

Backend Validation (/api/verify/[linkToken]/validate/route.ts): 

export async function GET(request: Request, { params }) { 
  const { linkToken } = params; 
   
  const { data: verification } = await supabase 
    .from('verifications') 
    .select('*, policy:policies(*)') 
    .eq('link_token', linkToken) 
    .single(); 
   
  // Check expiry 
  if (new Date() > new Date(verification.link_expiry)) { 
    return Response.json({ error: 'Link expired' }, { status: 410 }); 
  } 
   
  // Check if already completed 
  if (['approved', 'rejected'].includes(verification.status)) { 
    return Response.json({  
      error: 'Verification already completed', 
      status: verification.status  
    }, { status: 400 }); 
  } 
   
  // Update first access 
  if (!verification.link_accessed_at) { 
    await supabase 
      .from('verifications') 
      .update({  
        link_accessed_at: new Date(), 
        status: 'in_progress' 
      }) 
      .eq('id', verification.id); 
  } 
   
  return Response.json({ 
    success: true, 
    verification: verification, 
    template: verification.template_snapshot, 
    policy_type: verification.policy.policy_type // IMPORTANT for GPS logic 
  }); 
} 
 

Page 2: OTP (/verify/[linkToken]/otp/page.tsx) 

┌─────────────────────────────────────────┐ 
│ Step 1 of 5: Verify Identity            │ 
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ 
│                                          │ 
│ Enter the 6-digit code sent to:         │ 
│ {masked_phone}                          │ 
│                                          │ 
│ [_] [_] [_] [_] [_] [_]                 │ 
│                                          │ 
│ Didn't receive? Resend in 30s           │ 
│                                          │ 
│ [Verify OTP] ──────────────────────────►│ 
└─────────────────────────────────────────┘ 
 

OTP Logic (/api/verify/[linkToken]/send-otp/route.ts): 

export async function POST(request: Request, { params }) { 
  const { linkToken } = params; 
   
  const { data: verification } = await supabase 
    .from('verifications') 
    .select('customer_phone') 
    .eq('link_token', linkToken) 
    .single(); 
   
  // Generate OTP 
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); 
   
  // Store OTP in database with 5 min expiry 
  await supabase 
    .from('otp_sessions') 
    .insert({ 
      verification_id: verification.id, 
      otp_hash: await hashOTP(otp), 
      expires_at: new Date(Date.now() + 5 * 60 * 1000) 
    }); 
   
  // Send SMS 
  await sendSMS(verification.customer_phone,  
    `Your VeriFlow OTP is ${otp}. Valid for 5 minutes. Do not share.` 
  ); 
   
  return Response.json({ success: true }); 
} 
 

Page 3: Consent (/verify/[linkToken]/consent/page.tsx) 

Display template.consent_text 

Checkbox: "I have read and agree to the above" 

Log consent with timestamp + IP address 

Page 4: ID Upload (/verify/[linkToken]/identity/page.tsx) 

Radio buttons: Select ID type (Aadhaar/PAN/Passport/Driver's License) 

File upload: Front side (required) 

File upload: Back side (if applicable) 

Upload to Supabase Storage 

Store path in submissions table 

Page 5: Form (/verify/[linkToken]/form/page.tsx) 

CRITICAL: GPS Validation Logic 

// PhotoUploader component 
async function handlePhotoUpload(file: File, fieldConfig: any) { 
  let gps = null; 
   
  // Get GPS coordinates 
  if (fieldConfig.capture_gps) { 
    gps = await new Promise((resolve) => { 
      navigator.geolocation.getCurrentPosition( 
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }), 
        () => resolve(null) 
      ); 
    }); 
  } 
   
  // Validate GPS ONLY for property-based policies 
  if (policyType === 'home_insurance' && fieldConfig.capture_gps && gps) { 
    const validation = validatePhotoLocation( 
      gps, 
      verification.property_coordinates, 
      policyType // PASS POLICY TYPE 
    ); 
     
    if (!validation.valid) { 
      // BLOCK UPLOAD 
      alert(validation.error); 
      return; // Don't proceed 
    } 
  } 
   
  // Proceed with upload 
  await uploadPhoto(file, gps); 
} 
 
// Validation function 
function validatePhotoLocation(photoGPS, propertyGPS, policyType) { 
  // Skip GPS validation for non-property policies 
  if (policyType !== 'home_insurance') { 
    return { valid: true, distance: 0 }; 
  } 
   
  const distance = calculateHaversineDistance(photoGPS, propertyGPS); 
  const GPS_TOLERANCE = 100; // meters 
   
  if (distance > GPS_TOLERANCE) { 
    return { 
      valid: false, 
      distance, 
      error: `Photo is ${Math.round(distance)}m away from property address (max ${GPS_TOLERANCE}m). Please take photo at the property location.` 
    }; 
  } 
   
  return { valid: true, distance }; 
} 
 

Category Navigation: 

Progress bar: "X of Y categories complete" 

Show one category at a time 

For each photo field: PhotoUploader component 

For each question: Render appropriate input type 

Conditional fields: Show/hide dynamically based on question answers 

"Save Draft" button (localStorage) 

"Next Category" / "Previous Category" buttons 

"Review & Submit" button (last category) 

Page 6: Review (/verify/[linkToken]/review/page.tsx) 

┌─────────────────────────────────────────┐ 
│ Review Your Submission                  │ 
├─────────────────────────────────────────┤ 
│                                          │ 
│ ✓ Identity Verified ({id_type})        │ 
│ ✓ {X} photos uploaded                   │ 
│ ✓ {Y} documents uploaded                │ 
│ ✓ All required fields completed         │ 
│                                          │ 
│ Summary by Category:                    │ 
│ • {Category 1}: {count} photos          │ 
│ • {Category 2}: {count} photos + answers│ 
│ ...                                     │ 
│                                          │ 
│ [View All Photos] (gallery modal)       │ 
│ [Edit Form] (go back)                   │ 
│                                          │ 
│ ☑ I confirm all information is accurate │ 
│                                          │ 
│ [Submit Verification] ─────────────────►│ 
└─────────────────────────────────────────┘ 
 

Submit Backend (/api/verify/[linkToken]/submit/route.ts): 

export async function POST(request: Request, { params }) { 
  const { linkToken } = params; 
  const body = await request.json(); 
   
  const { data: verification } = await supabase 
    .from('verifications') 
    .select('*, policy:policies(*)') 
    .eq('link_token', linkToken) 
    .single(); 
   
  // Validate all required fields 
  const validation = validateSubmission(body.formData, verification.template_snapshot); 
  if (!validation.isValid) { 
    return Response.json({ error: validation.errors }, { status: 400 }); 
  } 
   
  // Call Document Verification API (auto-verify Aadhaar/PAN) 
  const docVerifyResult = await verifyDocument( 
    body.idDocumentType, 
    body.idDocumentNumber, 
    verification.customer_name 
  ); 
   
  // Create submission record 
  const { data: submission } = await supabase 
    .from('submissions') 
    .insert({ 
      verification_id: verification.id, 
      submission_number: verification.rejection_count + 1, 
      identity_method: 'otp_sms', 
      otp_verified_at: body.otpVerifiedAt, 
      photo_id_type: body.idDocumentType, 
      photo_id_number_encrypted: encrypt(body.idDocumentNumber), 
      photo_id_url: body.idDocumentUrl, 
      id_verification_api_response: docVerifyResult, 
      id_verification_status: docVerifyResult.success ? 'verified' : 'failed', 
      consent_given: true, 
      consent_timestamp: body.consentTimestamp, 
      consent_ip: request.headers.get('x-forwarded-for'), 
      categories: body.formData, 
      documents: body.documents 
    }) 
    .select() 
    .single(); 
   
  // Update verification status 
  await supabase 
    .from('verifications') 
    .update({ 
      status: 'submitted', 
      submitted_at: new Date() 
    }) 
    .eq('id', verification.id); 
   
  // Queue webhook 
  await queueWebhook({ 
    business_id: verification.business_id, 
    verification_id: verification.id, 
    event_type: 'verification.submitted', 
    payload: { 
      verification_ref: verification.verification_ref, 
      customer: { name: verification.customer_name }, 
      status: 'submitted', 
      id_verification_status: docVerifyResult.status 
    } 
  }); 
   
  // Send notifications 
  await sendEmail(verification.customer_email,  
    'Verification Submitted Successfully', 
    EmailTemplates.submitted(verification.customer_name, verification.verification_ref) 
  ); 
   
  await sendEmail(assignedVerifier.email, 
    'New Verification Assigned', 
    `Verification ${verification.verification_ref} assigned to you. Login to review.` 
  ); 
   
  // Audit log 
  await logAction({ 
    verification_id: verification.id, 
    actor_type: 'customer', 
    action: 'submission_created', 
    details: { submission_id: submission.id } 
  }); 
   
  return Response.json({  
    success: true,  
    verification_ref: verification.verification_ref  
  }); 
} 
 

 

7. Verifier Dashboard (/agent/dashboard/page.tsx) 

Features: 

Table showing assigned verifications 

Columns: Ref ID, Customer Name, Policy Type, Status Badge, SLA Indicator, Actions 

Sort by: SLA urgency (default), Date submitted, Customer name 

Filters: Status, Policy type, Date range 

Click row → Navigate to /agent/verifications/[id] 

SLA Indicator Component: 

function SLAIndicator({ submittedAt, slaHours }) { 
  const deadline = new Date(new Date(submittedAt).getTime() + slaHours * 60 * 60 * 1000); 
  const now = new Date(); 
  const hoursRemaining = (deadline - now) / (1000 * 60 * 60); 
   
  if (hoursRemaining < 2) { 
    ``` 
    return <Badge className="bg-red-500">⚠️ {Math.round(hoursRemaining)}h</Badge>; 
    ``` 
  } else if (hoursRemaining < 6) { 
    ``` 
    return <Badge className="bg-yellow-500">🟡 {Math.round(hoursRemaining)}h</Badge>; 
    ``` 
  } else { 
    ``` 
    return <Badge className="bg-green-500">✅ {Math.round(hoursRemaining)}h</Badge>; 
    ``` 
  } 
} 
 

 

8. Verification Review Page (/agent/verifications/[id]/page.tsx) 

Split Layout: 

Left Panel (30%): 

Customer Info (name, email, phone, address) 

Policy Details (policy number, sum assured, dates) 

Agent Info (if prefilled) 

Checklist: 

✓ Identity Verified (show API result) 

✓ X photos uploaded 

✓ Y documents uploaded 

✓ All required fields filled 

ID Verification Status: 

API Status: ✅ Verified / ❌ Failed 

Document Type: Aadhaar 

Document Number: XXXX-XXXX-3456 

Name Match: ✅ / ❌ 

Internal Notes (textarea + "Add Note" button) 

Right Panel (70%): 

Category tabs/navigation 

For each photo: 

Thumbnail with zoom modal 

Label + instruction 

File size, resolution 

GPS coords + distance (if applicable, only for home_insurance) 

"✅ Within 100m" / "⚠️ No GPS data" 

Document viewer (inline PDF/image) 

Questions & Answers display 

Action Buttons (Bottom): 

Approve (green) → Confirmation modal → Call /api/agent/verifications/[id]/approve 

Reject (red) → Full rejection form (not implemented in MVP, just escalate) 

Request More Info (yellow) → Selective field picker modal 

 

9. Request More Info Modal 

┌──────────────────────────────────────────────────────────┐ 
│ Request More Information                                  │ 
├──────────────────────────────────────────────────────────┤ 
│ Select specific photos/fields to re-upload:              │ 
│                                                           │ 
│ Front of Dwelling:                                       │ 
│ ☐ Dwelling Front Side                                    │ 
│ ☑ Roof Front Side                                        │ 
│ ☐ Front Yard                                             │ 
│                                                           │ 
│ Interior:                                                │ 
│ ☑ Kitchen Overview                                       │ 
│                                                           │ 
│ Rejection Reason: *                                      │ 
│ (•) Blurry photo                                         │ 
│ ( ) Wrong angle                                          │ 
│ ( ) Lighting too dark                                    │ 
│ ( ) Photo doesn't match label                            │ 
│ ( ) Other                                                │ 
│                                                           │ 
│ Additional Instructions:                                 │ 
│ [Roof photo is unclear. Please retake in better         │ 
│  lighting showing shingle condition. Kitchen photo       │ 
│  needs wider angle to show full room.]                   │ 
│                                                           │ 
│ [Cancel] [Send Request] ────────────────────────────────►│ 
└──────────────────────────────────────────────────────────┘ 
 

Backend (/api/agent/verifications/[id]/request-more-info/route.ts): 

export async function POST(request: Request, { params }) { 
  const { id } = params; 
  const body = await request.json(); 
   
  const { data: verification } = await supabase 
    .from('verifications') 
    .select('*') 
    .eq('id', id) 
    .single(); 
   
  // Check re-upload limit 
  if (verification.rejection_count >= 3) { 
    // Auto-escalate to admin 
    await supabase 
      .from('verifications') 
      .update({ 
        status: 'escalated', 
        assigned_verifier_id: null 
      }) 
      .eq('id', id); 
     
    // Notify admin 
    await sendAdminEmail( 
      verification.business_id, 
      `Verification ${verification.verification_ref} escalated`, 
      `Max re-upload attempts (3) reached. Manual review required.` 
    ); 
     
    return Response.json({  
      escalated: true, 
      message: 'Max attempts reached. Escalated to admin.'  
    }); 
  } 
   
  // Store verifier action 
  await supabase.from('verifier_actions').insert({ 
    verification_id: id, 
    verifier_id: currentUser.id, 
    action: 'request_more_info', 
    predefined_reason: body.predefinedReason, 
    reason: body.additionalInstructions, 
    rejected_fields: body.selectedFieldIds 
  }); 
   
  // Update verification 
  await supabase 
    .from('verifications') 
    .update({ 
      status: 'more_info_requested', 
      rejection_count: verification.rejection_count + 1, 
      link_expiry: new Date(Date.now() + 72 * 60 * 60 * 1000) // Extend 72 hrs 
    }) 
    .eq('id', id); 
   
  // Send notification 
  const reopenLink = `${process.env.NEXT_PUBLIC_APP_URL}/verify/${verification.link_token}?mode=reupload`; 
  await sendSMS(verification.customer_phone, 
    `Action needed on ${verification.verification_ref}. Re-upload requested: ${reopenLink}` 
  ); 
   
  await sendEmail(verification.customer_email, 
    'Action Required: Re-upload Photos', 
    EmailTemplates.moreInfoRequested( 
      verification.customer_name, 
      reopenLink, 
      body.selectedFieldIds.map(id => getLabelFromFieldId(id)), 
      body.additionalInstructions 
    ) 
  ); 
   
  return Response.json({ success: true }); 
} 
 

 

10. Customer Re-Upload Flow 

When customer clicks link with ?mode=reupload: 

Landing Page: Show "Action Required" message with rejection reason 

Navigate to Form: Same form page, but: 

Previously uploaded photos shown as locked (gray background, not editable) 

Only rejected fields are unlocked (highlighted in yellow) 

Customer can only upload to unlocked fields 

Submit: Creates new submission with submission_number = 2 (or 3) 

Status Change: more_info_requested → resubmitted 

Back to Queue: Verification appears in verifier's dashboard again 

 

🛠 HELPER FUNCTIONS & UTILITIES 

GPS Distance Calculation (/lib/utils/gps.ts) 

export function calculateHaversineDistance( 
  coords1: { lat: number; lon: number }, 
  coords2: { lat: number; lon: number } 
): number { 
  const R = 6371000; // Earth radius in meters 
  const dLat = ((coords2.lat - coords1.lat) * Math.PI) / 180; 
  const dLon = ((coords2.lon - coords1.lon) * Math.PI) / 180; 
   
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
    Math.cos((coords1.lat * Math.PI) / 180) * 
      Math.cos((coords2.lat * Math.PI) / 180) * 
      Math.sin(dLon / 2) * 
      Math.sin(dLon / 2); 
   
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; // Distance in meters 
} 
 

Round-Robin Assignment (/lib/utils/assignment.ts) 

export async function assignVerifierRoundRobin( 
  businessId: string, 
  policyType: string 
): Promise<string | null> { 
  // Get teams handling this policy type 
  const { data: teams } = await supabase 
    .from('teams') 
    .select('id') 
    .eq('business_id', businessId) 
    .contains('policy_types', [policyType]); 
   
  if (!teams || teams.length === 0) return null; 
   
  const teamIds = teams.map(t => t.id); 
   
  // Get all active verifiers in these teams 
  const { data: verifiers } = await supabase 
    .from('users') 
    .select('id') 
    .in('team_id', teamIds) 
    .eq('role', 'verifier') 
    .eq('is_active', true); 
   
  if (!verifiers || verifiers.length === 0) return null; 
   
  // Count pending verifications per verifier 
  const loads = await Promise.all( 
    verifiers.map(async (v) => { 
      const { count } = await supabase 
        .from('verifications') 
        .select('*', { count: 'exact', head: true }) 
        .eq('assigned_verifier_id', v.id) 
        .in('status', ['submitted', 'under_review', 'resubmitted']); 
       
      return { verifierId: v.id, load: count || 0 }; 
    }) 
  ); 
   
  // Sort by load (ascending) and return verifier with least load 
  loads.sort((a, b) => a.load - b.load); 
  return loads[0].verifierId; 
} 
 

 

🌱 SEED DATA SCRIPT 

Create /scripts/seed.ts: 

import { createClient } from '@supabase/supabase-js'; 
 
const supabase = createClient( 
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
); 
 
async function seed() { 
  console.log('🌱 Seeding database...'); 
   
  // 1. Create demo business 
  const { data: business } = await supabase 
    .from('businesses') 
    .insert({ 
      name: 'InsureCo Demo Ltd', 
      industry: 'insurance', 
      country: 'IN', 
      contact_email: 'demo@insureco.com' 
    }) 
    .select() 
    .single(); 
   
  // 2. Create users 
  const { data: { user: admin } } = await supabase.auth.admin.createUser({ 
    email: 'ops@insureco.com', 
    password: 'Demo@123', 
    email_confirm: true 
  }); 
   
  await supabase.from('users').insert({ 
    id: admin.id, 
    business_id: business.id, 
    role: 'business_admin', 
    full_name: 'Operations Manager', 
    email: 'ops@insureco.com' 
  }); 
   
  // 3. Create teams 
  const { data: team1 } = await supabase.from('teams').insert({ 
    business_id: business.id, 
    name: 'Home Insurance Team', 
    policy_types: ['home_insurance'] 
  }).select().single(); 
   
  const { data: team2 } = await supabase.from('teams').insert({ 
    business_id: business.id, 
    name: 'Auto Insurance Team', 
    policy_types: ['auto_insurance'] 
  }).select().single(); 
   
  // 4. Create verifiers 
  const verifiers = [ 
    { email: 'amit@insureco.com', name: 'Amit Sharma', team: team1.id }, 
    { email: 'priya@insureco.com', name: 'Priya Desai', team: team2.id } 
  ]; 
   
  for (const v of verifiers) { 
    const { data: { user } } = await supabase.auth.admin.createUser({ 
      email: v.email, 
      password: 'Verifier@123', 
      email_confirm: true 
    }); 
     
    await supabase.from('users').insert({ 
      id: user.id, 
      business_id: business.id, 
      role: 'verifier', 
      full_name: v.name, 
      email: v.email, 
      team_id: v.team 
    }); 
  } 
   
  // 5. Create templates (Home, Auto, Credit Card) 
  const homeTemplate = { /* Use Template 1 JSON from above */ }; 
  const autoTemplate = { /* Use Template 2 JSON from above */ }; 
  const creditTemplate = { /* Use Template 3 JSON from above */ }; 
   
  await supabase.from('templates').insert([ 
    { business_id: business.id, ...homeTemplate }, 
    { business_id: business.id, ...autoTemplate }, 
    { business_id: business.id, ...creditTemplate } 
  ]); 
   
  console.log('✅ Seed complete!'); 
  console.log('Login: ops@insureco.com / Demo@123'); 
} 
 
seed(); 
 

Run: npx tsx scripts/seed.ts 

 

🚀 DEPLOYMENT 

Environment Variables (.env.local): 

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url 
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key 
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key 
 
BUSINESS_POLICY_API_URL=https://demo-api.example.com/policies 
BUSINESS_POLICY_API_KEY=demo_key 
 
DOCUMENT_VERIFY_API_URL=https://sandbox.surepass.io/api/v1 
DOCUMENT_VERIFY_API_KEY=sandbox_key 
 
TWILIO_ACCOUNT_SID=your_sid 
TWILIO_AUTH_TOKEN=your_token 
TWILIO_PHONE_NUMBER=+1234567890 
 
RESEND_API_KEY=re_xxx 
 
GOOGLE_MAPS_API_KEY=your_key 
 
NEXT_PUBLIC_APP_URL=http://localhost:3000 
GPS_TOLERANCE_METERS=100 
MAX_REUPLOAD_ATTEMPTS=3 
 

Deploy to Vercel: 

npm i -g vercel 
vercel login 
vercel link 
vercel env add (add all env vars) 
vercel --prod 
 

 

✅ SUCCESS CRITERIA 

[ ] Admin can login and see dashboard with KPIs 

[ ] Admin can select policy type and fetch only matching policies 

[ ] Admin can edit template with conditional questions 

[ ] Admin can generate verification link with auto-assign 

[ ] Customer receives SMS/email with link 

[ ] Customer completes OTP, consent, ID upload, form submission 

[ ] GPS validation blocks upload if >100m away (home insurance only) 

[ ] GPS validation skipped for auto insurance 

[ ] Document verification API called on submission 

[ ] Verifier sees verification in queue with SLA indicator 

[ ] Verifier can approve or request more info (selective fields) 

[ ] Customer receives re-upload link with only rejected fields unlocked 

[ ] After 3 rejections, auto-escalates to admin 

[ ] Webhook queued on status change 

[ ] All actions logged in audit_logs 

 

📝 TESTING SCENARIOS 

Test 1: Home Insurance (with GPS) 

Admin creates home insurance verification 

Customer fills form, uploads exterior photos 

EXPECTED: GPS checked, upload blocked if >100m away 

Customer submits 

Verifier reviews, requests more info on 1 photo 

Customer re-uploads 

Verifier approves 

Test 2: Auto Insurance (no GPS) 

Admin creates auto insurance verification 

Customer fills form, uploads vehicle photos 

EXPECTED: No GPS validation, uploads allowed from any location 

Customer submits 

Verifier approves 

Test 3: Re-Upload Limit 

Verifier requests more info (attempt 1) 

Customer re-uploads 

Verifier requests more info again (attempt 2) 

Customer re-uploads 

Verifier requests more info again (attempt 3) 

Customer re-uploads 

EXPECTED: Next rejection auto-escalates to admin 

 

🎯 BUILD THIS NOW 

Use: 

Next.js 14 App Router 

TypeScript 

Tailwind CSS + Shadcn UI 

Supabase (PostgreSQL + Auth + Storage) 

Vercel deployment 

Focus on: 

Automatic policy type filtering (no manual category selector) 

Conditional GPS validation (only home insurance) 

Three distinct templates (Home, Auto, Credit Card) 

Selective field re-upload 

Max 3 re-upload attempts with auto-escalation 

Round-robin agent assignment 

Complete audit trail 

MVP Timeline: 1 Week 

 

This revised specification now correctly implements: 
✅ Automatic policy filtering by type (no category selector UI) 
✅ Conditional GPS validation (only for home_insurance, skipped for auto_insurance and credit_card) 
✅ Three pre-built templates with realistic fields for each vertical 
✅ All other requirements from original spec 

Ready for Antigravity to build! 🚀 