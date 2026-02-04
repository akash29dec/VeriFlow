/**
 * Validate Link API
 * GET /api/verify/[linkToken]/validate
 * * Validates a verification link and returns verification data for the customer UI
 */

// Bypass SSL certificate validation in development (corporate firewall/VPN issue)
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { NextRequest, NextResponse } from 'next/server';
// 1. Import createClient from the core SDK, not your lib helper
import { createClient } from '@supabase/supabase-js'; 
import type { VerificationStatus } from '@/types/database';

// ============================================================================
// Types
// ============================================================================

interface VerificationData {
  id: string;
  verification_ref: string;
  status: VerificationStatus;
  link_expiry: string;
  link_accessed_at: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address: string | null;
  template_snapshot: unknown;
  property_coordinates: { lat: number; lon: number } | null;
  prefill_data: Record<string, unknown>;
  rejection_reason: Record<string, Record<string, string>> | null;
  rejection_count: number | null;
  policy: {
    id: string;
    policy_name: string;
    policy_type: string;
    custom_questions: unknown[] | null; // Added to fetch edited categories
  } | null;
}

interface ValidateResponse {
  success: boolean;
  verification: {
    id: string;
    verification_ref: string;
    status: string;
    customer_name: string;
    customer_phone_masked: string;
    link_expiry: string;
    rejection_reason: Record<string, Record<string, string>> | null;
    rejection_count: number;
  };
  template: unknown;
  custom_questions: unknown[] | null; // Added - the edited categories from policy
  policy_type: string;
  requires_gps: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function maskPhoneNumber(phone: string): string {
  if (!phone) return '****';
  if (phone.length <= 4) return '****';
  const start = phone.slice(0, 3);
  const end = phone.slice(-4);
  return `${start}****${end}`;
}

function isGPSRequired(policyType: string): boolean {
  return policyType === 'home_insurance';
}

// ============================================================================
// API Handler
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkToken: string }> }
) {
  try {
    // 2. Await params (Fixes Next.js 15 error)
    const { linkToken } = await params;

    if (!linkToken) {
      return NextResponse.json({ error: 'Link token is required' }, { status: 400 });
    }

    // 3. USE ADMIN CLIENT (Bypass RLS)
    // We cannot use createServerClient() here because the user is anonymous.
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

    // Get verification with policy data
    const { data: verificationData, error: verificationError } = await supabaseAdmin
      .from('verifications')
      .select(`
        id,
        verification_ref,
        status,
        link_expiry,
        link_accessed_at,
        customer_name,
        customer_phone,
        customer_email,
        customer_address,
        template_snapshot,
        property_coordinates,
        prefill_data,
        rejection_reason,
        rejection_count,
        policy:policies (
          id,
          policy_name,
          policy_type,
          custom_questions
        )
      `)
      .eq('link_token', linkToken)
      .single();

    if (verificationError || !verificationData) {
      console.error('Validation fetch error:', verificationError);
      return NextResponse.json(
        { error: 'Verification not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const verification = verificationData as unknown as VerificationData;

    // Check if link has expired
    const now = new Date();
    const expiry = new Date(verification.link_expiry);
    
    if (now > expiry) {
      return NextResponse.json(
        { 
          error: 'Link expired', 
          code: 'EXPIRED',
          expired_at: verification.link_expiry 
        },
        { status: 410 }
      );
    }

    // Check if already completed
    const completedStatuses: VerificationStatus[] = ['approved', 'rejected', 'submitted'];
    if (completedStatuses.includes(verification.status as VerificationStatus)) {
      return NextResponse.json(
        { 
          error: 'Verification already completed', 
          code: 'ALREADY_COMPLETED',
          status: verification.status 
        },
        { status: 200 } // Return 200 so UI can show the "Completed" screen
      );
    }

    // Check if cancelled
    if (verification.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Verification has been cancelled', code: 'CANCELLED' },
        { status: 400 }
      );
    }

    // Update first access time and status
    if (!verification.link_accessed_at) {
      await supabaseAdmin
        .from('verifications')
        .update({
          link_accessed_at: now.toISOString(),
          status: 'in_progress',
        })
        .eq('id', verification.id);

      // Log the access
      await supabaseAdmin.from('audit_logs').insert({
        verification_id: verification.id,
        actor_type: 'customer',
        action: 'link_accessed',
        ip_address: request.headers.get('x-forwarded-for') || 'unknown',
        details: { first_access: true },
      });
    }

    // Build response
    const policyType = verification.policy?.policy_type || 'unknown';

    const response: ValidateResponse = {
      success: true,
      verification: {
        id: verification.id,
        verification_ref: verification.verification_ref,
        status: verification.status,
        customer_name: verification.customer_name,
        customer_phone_masked: maskPhoneNumber(verification.customer_phone),
        link_expiry: verification.link_expiry,
        rejection_reason: verification.rejection_reason || null,
        rejection_count: verification.rejection_count || 0,
      },
      template: verification.template_snapshot,
      custom_questions: verification.policy?.custom_questions || null, // Include edited categories
      policy_type: policyType,
      requires_gps: isGPSRequired(policyType),
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Validate link error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}