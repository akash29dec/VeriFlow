/**
 * API Route: Get Previous Submission for Correction Mode
 * Uses service role to bypass RLS and fetch submission data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkToken: string }> }
) {
  try {
    // Next.js 15: params is now a Promise that needs to be awaited
    const { linkToken } = await params;

    if (!linkToken) {
      return NextResponse.json(
        { error: 'Missing link token' },
        { status: 400 }
      );
    }

    // First verify this is a valid link token and get verification details
    const { data: verification, error: verificationError } = await supabaseAdmin
      .from('verifications')
      .select('id, status')
      .eq('link_token', linkToken)
      .single();

    if (verificationError || !verification) {
      console.error('Verification lookup failed:', verificationError);
      return NextResponse.json(
        { error: 'Verification not found' },
        { status: 404 }
      );
    }

    // Only allow fetching submission for needs_revision status
    if (verification.status !== 'needs_revision') {
      return NextResponse.json(
        { error: 'Submission fetch not allowed for this status' },
        { status: 403 }
      );
    }

    // Fetch the latest submission for this verification
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('submissions')
      .select('*')
      .eq('verification_id', verification.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (submissionError) {
      console.error('Submission fetch error:', submissionError);
      return NextResponse.json(
        { error: 'Failed to fetch submission' },
        { status: 500 }
      );
    }

    if (!submission) {
      return NextResponse.json(
        { error: 'No previous submission found' },
        { status: 404 }
      );
    }

    // Return the submission data
    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        categories: submission.categories,
        identity_type: submission.identity_type,
        identity_number: submission.identity_number,
        identity_front_url: submission.identity_front_url,
        identity_back_url: submission.identity_back_url,
        consent_given: submission.consent_given,
        consent_timestamp: submission.consent_timestamp,
        submitted_at: submission.submitted_at,
      }
    });

  } catch (error) {
    console.error('Get submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
