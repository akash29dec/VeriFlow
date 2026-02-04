/**
 * VeriFlow Seed Script
 * Creates sample data for development and testing
 * 
 * Run: npx tsx scripts/seed.ts
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Make sure .env.local is loaded.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// Sample Data
// ============================================================================

const SAMPLE_BUSINESS = {
  name: 'VeriFlow Insurance Co.',
  industry: 'insurance',
  country: 'IN',
  primary_color: '#0066CC',
  contact_email: 'admin@veriflow-demo.com',
};

const SAMPLE_TEAMS = [
  { name: 'Home Insurance Team', policy_types: ['home_insurance'] },
  { name: 'Auto Insurance Team', policy_types: ['auto_insurance'] },
  { name: 'Banking KYC Team', policy_types: ['credit_card'] },
];

// Template: Home Insurance - Standard (from spec)
const HOME_INSURANCE_TEMPLATE = {
  template_name: 'Home Insurance - Standard',
  policy_type: 'home_insurance',
  version: 1,
  categories: [
    {
      category_id: 'ext_front',
      category_name: 'Front of Dwelling',
      order: 1,
      photo_fields: [
        {
          field_id: 'photo_dwelling_front',
          label: 'Dwelling Front Side',
          instruction: 'Stand across the street and capture the full front facade including the roof line.',
          required: true,
          min_resolution: '1280x720',
          capture_gps: true,
        },
        {
          field_id: 'photo_roof_front',
          label: 'Roof Front Side',
          instruction: 'Zoom in to show the roof material and condition.',
          required: true,
          capture_gps: true,
        },
        {
          field_id: 'photo_yard_front',
          label: 'Front Yard',
          instruction: 'Show landscaping and any hazards (tree branches near roof, etc.).',
          required: true,
          capture_gps: true,
        },
      ],
    },
    {
      category_id: 'ext_back',
      category_name: 'Back of Dwelling',
      order: 2,
      photo_fields: [
        {
          field_id: 'photo_dwelling_back',
          label: 'Dwelling Back Side',
          instruction: 'Full view of the back of the property.',
          required: true,
          capture_gps: true,
        },
        {
          field_id: 'photo_roof_back',
          label: 'Roof Back Side',
          instruction: 'Show the rear roof condition.',
          required: true,
          capture_gps: true,
        },
      ],
    },
    {
      category_id: 'ext_utilities',
      category_name: 'Outdoor Utilities',
      order: 3,
      questions: [
        {
          question_id: 'q_swimming_pool',
          text: 'Do you have a swimming pool?',
          type: 'single_select',
          options: ['Yes', 'No'],
          required: true,
          conditional: {
            if_answer: 'Yes',
            show_fields: [
              {
                field_id: 'photo_pool',
                label: 'Swimming Pool',
                instruction: 'Full view of pool and surrounding area.',
                required: true,
                capture_gps: true,
              },
              {
                field_id: 'photo_pool_fence',
                label: 'Pool Safety Fence',
                instruction: 'Show the safety fence or gate (required by code).',
                required: true,
                capture_gps: true,
              },
            ],
          },
        },
        {
          question_id: 'q_num_bathrooms',
          text: 'How many bathrooms are in the home?',
          type: 'number',
          required: true,
          validation: { min: 1, max: 10 },
        },
      ],
    },
    {
      category_id: 'int_kitchen',
      category_name: 'Kitchen',
      order: 4,
      photo_fields: [
        {
          field_id: 'photo_kitchen_overview',
          label: 'Kitchen Overview',
          instruction: 'Wide shot showing cabinets, appliances, and flooring.',
          required: true,
          capture_gps: false,
        },
      ],
    },
  ],
  required_documents: [
    { document_id: 'doc_aadhaar', name: 'Aadhaar Card', required: true, ocr_enabled: true },
    { document_id: 'doc_pan', name: 'PAN Card', required: true, ocr_enabled: true },
    { document_id: 'doc_property_tax', name: 'Property Tax Receipt', required: true, ocr_enabled: false },
  ],
  validation_rules: {
    gps_required_for_policy_type: true,
    gps_tolerance_meters: 100,
  },
  consent_text: 'I consent to the collection and processing of my personal data for verification purposes.',
  is_active: true,
};

// Template: Auto Insurance - Comprehensive (from spec)
const AUTO_INSURANCE_TEMPLATE = {
  template_name: 'Auto Insurance - Comprehensive',
  policy_type: 'auto_insurance',
  version: 1,
  categories: [
    {
      category_id: 'ext_vehicle',
      category_name: 'Exterior - Vehicle',
      order: 1,
      photo_fields: [
        {
          field_id: 'photo_vehicle_front',
          label: 'Front View',
          instruction: 'Stand 10 feet away, capture full front of vehicle including license plate.',
          required: true,
          capture_gps: false,
        },
        {
          field_id: 'photo_vehicle_rear',
          label: 'Rear View',
          instruction: 'Full rear view including license plate.',
          required: true,
          capture_gps: false,
        },
        {
          field_id: 'photo_vehicle_left',
          label: 'Left Side View',
          instruction: 'Full side view showing doors and wheels.',
          required: true,
          capture_gps: false,
        },
        {
          field_id: 'photo_vehicle_right',
          label: 'Right Side View',
          instruction: 'Full side view showing doors and wheels.',
          required: true,
          capture_gps: false,
        },
      ],
    },
    {
      category_id: 'int_vehicle',
      category_name: 'Interior',
      order: 2,
      photo_fields: [
        {
          field_id: 'photo_dashboard',
          label: 'Dashboard & Odometer',
          instruction: 'Clear photo showing odometer reading.',
          required: true,
          capture_gps: false,
        },
        {
          field_id: 'photo_seats',
          label: 'Seats Condition',
          instruction: 'Show front and rear seats.',
          required: true,
          capture_gps: false,
        },
      ],
    },
    {
      category_id: 'damage_check',
      category_name: 'Damage Assessment',
      order: 3,
      questions: [
        {
          question_id: 'q_existing_damage',
          text: 'Does the vehicle have any existing damage?',
          type: 'single_select',
          options: ['Yes', 'No'],
          required: true,
          conditional: {
            if_answer: 'Yes',
            show_fields: [
              {
                field_id: 'photo_damage_1',
                label: 'Damage Photo 1',
                instruction: 'Close-up of damaged area.',
                required: true,
                capture_gps: false,
              },
            ],
          },
        },
      ],
    },
  ],
  required_documents: [
    { document_id: 'doc_aadhaar', name: 'Aadhaar Card', required: true, ocr_enabled: true },
    { document_id: 'doc_pan', name: 'PAN Card', required: true, ocr_enabled: true },
    { document_id: 'doc_driving_license', name: 'Driving License', required: true, ocr_enabled: true },
  ],
  validation_rules: {
    gps_required_for_policy_type: false,
  },
  consent_text: 'I consent to the collection and processing of my personal data for verification purposes.',
  is_active: true,
};

// Template: Credit Card - Premium KYC (from spec)
const CREDIT_CARD_TEMPLATE = {
  template_name: 'Credit Card - Premium KYC',
  policy_type: 'credit_card',
  version: 1,
  categories: [
    {
      category_id: 'identity_proof',
      category_name: 'Identity Verification',
      order: 1,
      photo_fields: [
        {
          field_id: 'photo_selfie',
          label: 'Selfie Photo',
          instruction: 'Take a clear selfie holding your ID document next to your face.',
          required: true,
          capture_gps: false,
        },
      ],
    },
    {
      category_id: 'address_proof',
      category_name: 'Address Verification',
      order: 2,
      questions: [
        {
          question_id: 'q_residence_type',
          text: 'Do you own or rent your residence?',
          type: 'single_select',
          options: ['Own', 'Rent'],
          required: true,
        },
      ],
      photo_fields: [
        {
          field_id: 'photo_address_proof',
          label: 'Address Proof Document',
          instruction: 'Upload utility bill, bank statement, or rental agreement (not older than 3 months).',
          required: true,
          capture_gps: false,
        },
      ],
    },
    {
      category_id: 'income_proof',
      category_name: 'Income Verification',
      order: 3,
      questions: [
        {
          question_id: 'q_employment_type',
          text: 'What is your employment type?',
          type: 'single_select',
          options: ['Salaried', 'Self-Employed', 'Business Owner'],
          required: true,
        },
        {
          question_id: 'q_monthly_income',
          text: 'What is your approximate monthly income (₹)?',
          type: 'number',
          required: true,
          validation: { min: 25000 },
        },
      ],
      photo_fields: [
        {
          field_id: 'photo_salary_slip',
          label: 'Latest Salary Slip / ITR',
          instruction: 'Upload your latest 3 months salary slips or last year\'s ITR.',
          required: true,
          capture_gps: false,
        },
      ],
    },
  ],
  required_documents: [
    { document_id: 'doc_aadhaar', name: 'Aadhaar Card', required: true, ocr_enabled: true },
    { document_id: 'doc_pan', name: 'PAN Card', required: true, ocr_enabled: true },
  ],
  validation_rules: {
    gps_required_for_policy_type: false,
  },
  consent_text: 'I consent to the collection and processing of my personal data for KYC verification.',
  is_active: true,
};

// ============================================================================
// Seed Functions
// ============================================================================

async function seedBusiness() {
  console.log('🏢 Creating business...');
  
  const { data, error } = await supabase
    .from('businesses')
    .insert(SAMPLE_BUSINESS)
    .select()
    .single();

  if (error) {
    console.error('Error creating business:', error);
    throw error;
  }

  console.log('✅ Business created:', data.id);
  return data;
}

async function seedTeams(businessId: string) {
  console.log('👥 Creating teams...');
  
  const teamsWithBusiness = SAMPLE_TEAMS.map((team) => ({
    ...team,
    business_id: businessId,
  }));

  const { data, error } = await supabase
    .from('teams')
    .insert(teamsWithBusiness)
    .select();

  if (error) {
    console.error('Error creating teams:', error);
    throw error;
  }

  console.log('✅ Teams created:', data.length);
  return data;
}

async function seedTemplates(businessId: string) {
  console.log('📋 Creating templates...');
  
  const templates = [
    { ...HOME_INSURANCE_TEMPLATE, business_id: businessId },
    { ...AUTO_INSURANCE_TEMPLATE, business_id: businessId },
    { ...CREDIT_CARD_TEMPLATE, business_id: businessId },
  ];

  const { data, error } = await supabase
    .from('templates')
    .insert(templates)
    .select();

  if (error) {
    console.error('Error creating templates:', error);
    throw error;
  }

  console.log('✅ Templates created:', data.length);
  return data;
}

async function seedSamplePolicies(businessId: string, templates: { id: string; policy_type: string }[]) {
  console.log('📄 Creating sample policies...');
  
  const templateMap = new Map(templates.map((t) => [t.policy_type, t.id]));

  const policies = [
    {
      business_id: businessId,
      external_policy_id: 'HI-2026-001',
      policy_name: 'Home Shield Premium',
      policy_type: 'home_insurance',
      policy_category: 'property',
      template_id: templateMap.get('home_insurance'),
      sla_hours: 24,
      status: 'active',
    },
    {
      business_id: businessId,
      external_policy_id: 'AI-2026-001',
      policy_name: 'Auto Secure Plus',
      policy_type: 'auto_insurance',
      policy_category: 'vehicle',
      template_id: templateMap.get('auto_insurance'),
      sla_hours: 24,
      status: 'active',
    },
    {
      business_id: businessId,
      external_policy_id: 'CC-2026-001',
      policy_name: 'Platinum Credit Card',
      policy_type: 'credit_card',
      policy_category: 'banking',
      template_id: templateMap.get('credit_card'),
      sla_hours: 48,
      status: 'active',
    },
  ];

  const { data, error } = await supabase
    .from('policies')
    .insert(policies)
    .select();

  if (error) {
    console.error('Error creating policies:', error);
    throw error;
  }

  console.log('✅ Policies created:', data.length);
  return data;
}

async function createTestUser(businessId: string, teamId: string) {
  console.log('👤 Creating test users...');
  
  // Note: In production, users would be created through Supabase Auth
  // For demo purposes, we'll create entries in the users table
  // You'll need to manually create accounts in Supabase Auth dashboard
  
  const testUsers = [
    {
      id: '00000000-0000-0000-0000-000000000001', // Placeholder - replace with real auth id
      business_id: businessId,
      role: 'business_admin',
      full_name: 'Demo Admin',
      email: 'admin@demo.com',
      phone: '+919876543210',
      is_active: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000002', // Placeholder - replace with real auth id
      business_id: businessId,
      role: 'verifier',
      full_name: 'Demo Verifier',
      email: 'verifier@demo.com',
      phone: '+919876543211',
      team_id: teamId,
      is_active: true,
    },
  ];

  console.log('⚠️  Note: Test users created with placeholder IDs.');
  console.log('    Create actual users in Supabase Auth and update these records.');
  
  // Skip actual insertion to avoid foreign key errors with auth.users
  // const { data, error } = await supabase.from('users').insert(testUsers).select();
  
  return testUsers;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('🌱 Starting VeriFlow seed script...\n');

  try {
    // Create business
    const business = await seedBusiness();
    
    // Create teams
    const teams = await seedTeams(business.id);
    
    // Create templates
    const templates = await seedTemplates(business.id);
    
    // Create sample policies
    await seedSamplePolicies(business.id, templates);
    
    // Create test users (informational only)
    await createTestUser(business.id, teams[0].id);

    console.log('\n✨ Seed completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Create admin user in Supabase Auth dashboard');
    console.log('2. Create verifier user in Supabase Auth dashboard');
    console.log('3. Update users table with correct auth UUIDs');
    console.log(`4. Business ID: ${business.id}`);
    
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  }
}

main();
