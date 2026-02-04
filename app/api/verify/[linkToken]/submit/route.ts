/**
 * Submit Verification API
 * POST /api/verify/[linkToken]/submit
 * * Handles final submission of customer verification
 */

import { NextRequest, NextResponse } from 'next/server';
// 1. IMPORT RAW SUPABASE CLIENT
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

interface SubmissionPayload {
  identity: {
    type: string;
    number: string;
    front_url: string;
    back_url: string | null;
    verified: boolean;
  };
  categories: Array<{
    category_id: string;
    category_name: string;
    photos: Array<{
      field_id: string;
      url: string;
      file_path: string;
      gps: { lat: number; lon: number } | null;
      captured_at: string;
    }>;
    answers: Array<{
      question_id: string;
      value: string | number | string[];
    }>;
  }>;
  consent: {
    given: boolean;
    timestamp: string;
  };
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ linkToken: string }> }
) {
  try {
    const { linkToken } = await params;

    if (!linkToken) {
      return NextResponse.json(
        { error: 'Link token is required' },
        { status: 400 }
      );
    }

    // 2. USE ADMIN CLIENT (Bypass RLS)
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

    // Get verification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: verificationData, error: verificationError } = await (supabaseAdmin as any)
      .from('verifications')
      .select('id, status, link_expiry, business_id, assigned_verifier_id, customer_name, verification_ref')
      .eq('link_token', linkToken)
      .single();

    if (verificationError || !verificationData) {
      console.error('Verification fetch error:', verificationError);
      return NextResponse.json(
        { error: 'Verification not found' },
        { status: 404 }
      );
    }

    // Check if link has expired
    if (new Date() > new Date(verificationData.link_expiry)) {
      return NextResponse.json(
        { error: 'Link expired' },
        { status: 410 }
      );
    }

    // Check if already submitted
    if (['submitted', 'approved', 'rejected'].includes(verificationData.status)) {
      return NextResponse.json(
        { error: 'Verification already submitted' },
        { status: 400 }
      );
    }

    // Parse submission data
    const body: SubmissionPayload = await request.json();

    if (!body.consent?.given) {
      return NextResponse.json(
        { error: 'Consent is required' },
        { status: 400 }
      );
    }

    // Build submission record
    // Note: We need to match the columns in your 'submissions' table
    const submissionRecord = {
      verification_id: verificationData.id,
      submission_number: 1, // Default to 1 for MVP
      identity_method: 'otp_sms',
      photo_id_type: body.identity.type,
      photo_id_number_encrypted: body.identity.number, // In real app, encrypt this!
      photo_id_url: body.identity.front_url,
      // Mapping the complex JSON structure to the 'categories' JSONB column
      categories: body.categories, 
      documents: [
        { type: 'id_front', url: body.identity.front_url },
        { type: 'id_back', url: body.identity.back_url }
      ],
      consent_given: true,
      consent_timestamp: body.consent.timestamp,
      consent_ip: request.headers.get('x-forwarded-for') || 'unknown',
      submitted_at: new Date().toISOString()
    };

    // Insert submission
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: submission, error: insertError } = await (supabaseAdmin as any)
      .from('submissions')
      .insert(submissionRecord)
      .select()
      .single();

    if (insertError) {
      console.error('Submission insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create submission', details: insertError.message },
        { status: 500 }
      );
    }

    // Update verification status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabaseAdmin as any)
      .from('verifications')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', verificationData.id);

    if (updateError) {
      console.error('Verification update error:', updateError);
      // We don't fail here because the submission was already created
    }

    // Log action
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from('audit_logs').insert({
      verification_id: verificationData.id,
      actor_type: 'customer',
      action: 'verification_submitted',
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      user_agent: request.headers.get('user-agent'),
      details: {
        submission_id: submission.id,
      },
    });

    return NextResponse.json({
      success: true,
      submission_id: submission.id,
      verification_id: verificationData.id,
      status: 'submitted',
    });

  } catch (error) {
    console.error('Submit verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}