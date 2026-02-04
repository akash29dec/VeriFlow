/**
 * Create Verification API
 * POST /api/verifications/create
 * * Creates a new verification request and generates a customer link
 */

// Workaround for SSL certificate verification issues (corporate networks/proxies)
if (typeof process !== 'undefined') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // Required for Admin client
import { nanoid } from 'nanoid';
import { assignVerifierRoundRobin } from '@/lib/utils/assignment';
import { geocodeAddress } from '@/lib/utils/geocoding';
import type { PolicyType, VerificationStatus } from '@/types/database';

// ============================================================================
// Types
// ============================================================================

interface CreateVerificationPayload {
  policyId: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address?: string;
  };
  policyDetails: {
    policyNumber?: string;
    sumAssured?: number;
    dateOrdered?: string;
    inspectionDueDate?: string;
    inspectionStatus?: string;
  };
  agentAssignment: {
    mode: 'auto' | 'team' | 'verifier';
    teamId?: string;
    verifierId?: string;
  };
  propertyCoordinates?: {
    lat: number;
    lon: number;
  };
  linkExpiryHours?: number;
  notifications?: {
    sendSms?: boolean;
    sendEmail?: boolean;
  };
}

interface PolicyWithTemplate {
  id: string;
  policy_name: string;
  policy_type: string;
  template_id: string;
  business_id: string;
  template: {
    id: string;
    template_name: string;
    categories: unknown[];
    required_documents: unknown[];
    validation_rules: unknown;
    consent_text: string | null;
  } | null;
}

interface UserData {
  id: string;
  business_id: string;
  role: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a unique verification reference number
 * Format: VER-YYYY-XXXXXX
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateRefNumber(supabase: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `VER-${year}-`;
  
  const { data } = await supabase
    .from('verifications')
    .select('verification_ref')
    .like('verification_ref', `${prefix}%`)
    .order('verification_ref', { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (data && data.length > 0) {
    const lastRef = data[0].verification_ref as string;
    const lastNumber = parseInt(lastRef.split('-')[2], 10);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(6, '0')}`;
}

/**
 * Get verifier info for prefill data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAgentInfo(supabase: any, verifierId: string | null): Promise<{ name: string; email: string; phone: string } | null> {
  if (!verifierId) return null;

  const { data } = await supabase
    .from('users')
    .select('full_name, email, phone')
    .eq('id', verifierId)
    .single();

  if (!data) return null;

  return {
    name: data.full_name || '',
    email: data.email || '',
    phone: data.phone || '',
  };
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // ==================================================================
    // ⚠️ ADMIN CLIENT SETUP (Bypasses RLS)
    // ==================================================================
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, 
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    // ==================================================================

    // HARDCODED USER FOR TESTING
    const user: UserData = {
      id: '00000000-0000-0000-0000-000000000001', 
      business_id: '14450eef-a49f-4338-921a-f377e9292340', // Seed Business ID
      role: 'business_admin'
    };

    // Parse request body
    const body: Partial<CreateVerificationPayload> = await request.json();
    
    // Extract with defaults for optional fields
    const policyId = body.policyId;
    const customer = body.customer;
    const policyDetails = body.policyDetails || {};
    const agentAssignment = body.agentAssignment || { mode: 'auto' };

    // Validate required fields
    if (!policyId || !customer?.name || !customer?.phone) {
      return NextResponse.json(
        { error: 'Missing required fields: policyId, customer.name, customer.phone' },
        { status: 400 }
      );
    }

    // Get policy using ADMIN client (Bypasses RLS)
    console.log('🔍 Looking for policy:', policyId);
    console.log('🏢 User business_id:', user.business_id);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: policyData, error: policyError } = await (supabaseAdmin as any)
      .from('policies')
      .select(`
        id,
        policy_name,
        policy_type,
        template_id,
        business_id,
        template:templates (
          id,
          template_name,
          categories,
          required_documents,
          validation_rules,
          consent_text
        )
      `)
      .eq('id', policyId)
      .single();

    console.log('📋 Policy fetch result:', { policyData, policyError });

    if (policyError || !policyData) {
      console.error("❌ Policy Error:", policyError);
      console.error("❌ Policy ID attempted:", policyId);
      return NextResponse.json(
        { error: `Policy not found: ${policyError?.message || 'No policy with this ID'}` },
        { status: 404 }
      );
    }

    const policy = policyData as PolicyWithTemplate;
    console.log('✅ Policy found:', policy.policy_name, 'Business:', policy.business_id);

    // Verify policy belongs to user's business
    if (policy.business_id !== user.business_id) {
      console.error("❌ Business mismatch:", { policy_business: policy.business_id, user_business: user.business_id });
      return NextResponse.json(
        { error: `Policy belongs to different business (${policy.business_id})` },
        { status: 403 }
      );
    }

    // Generate unique token and ref using ADMIN client
    const linkToken = nanoid(16);
    const refNumber = await generateRefNumber(supabaseAdmin);

    // Handle agent assignment
    let assignedVerifierId: string | null = null;
    let assignedTeamId: string | null = null;

    if (agentAssignment.mode === 'auto') {
      const assignment = await assignVerifierRoundRobin(
        user.business_id,
        policy.policy_type as PolicyType
      );
      if (assignment.success) {
        assignedVerifierId = assignment.verifierId;
      }
    } else if (agentAssignment.mode === 'team' && agentAssignment.teamId) {
      assignedTeamId = agentAssignment.teamId;
    } else if (agentAssignment.mode === 'verifier' && agentAssignment.verifierId) {
      assignedVerifierId = agentAssignment.verifierId;
    }

    // Geocode address
    let propertyCoords = body.propertyCoordinates;
    if (policy.policy_type === 'home_insurance' && !propertyCoords && customer.address) {
      const geocoded = await geocodeAddress(customer.address);
      if (geocoded.success && geocoded.coordinates) {
        propertyCoords = geocoded.coordinates;
      }
    }

    // Calculate link expiry
    const expiryHours = body.linkExpiryHours || 72;
    const linkExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // Get agent info
    const agentInfo = await getAgentInfo(supabaseAdmin, assignedVerifierId);

    // Create verification record using ADMIN client
    const verificationData = {
      verification_ref: refNumber,
      business_id: user.business_id,
      policy_id: policyId,
      template_id: policy.template?.id || null,
      template_snapshot: policy.template || {},
      customer_name: customer.name,
      customer_email: customer.email || null,
      customer_phone: customer.phone,
      customer_address: customer.address || null,
      prefill_data: {
        ...policyDetails,
        agent_info: agentInfo,
      },
      property_coordinates: propertyCoords || null,
      assigned_verifier_id: assignedVerifierId,
      assigned_team_id: assignedTeamId,
      link_token: linkToken,
      link_expiry: linkExpiry.toISOString(),
      status: 'draft' as VerificationStatus,
      fraud_score: 0,
      fraud_flags: [],
      rejection_count: 0,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: verification, error: insertError } = await (supabaseAdmin as any)
      .from('verifications')
      .insert(verificationData)
      .select()
      .single();

    if (insertError || !verification) {
      console.error('Error creating verification:', insertError);
      return NextResponse.json(
        { error: 'Failed to create verification' },
        { status: 500 }
      );
    }

    // Generate customer link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const customerLink = `${baseUrl}/verify/${linkToken}`;

    // Log action using ADMIN client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from('audit_logs').insert({
      verification_id: verification.id,
      actor_id: user.id,
      actor_type: 'admin',
      action: 'link_generated',
      details: { link_token: linkToken },
    });

    return NextResponse.json({
      success: true,
      verification: {
        id: verification.id,
        verification_ref: refNumber,
        status: verification.status,
        link_expiry: linkExpiry.toISOString(),
      },
      customer_link: customerLink,
    });

  } catch (error) {
    console.error('Create verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}