/**
 * Create Policy API
 * POST /api/policies/create
 * 
 * Creates a new policy with proper authorization.
 * Uses service role to bypass RLS after validating business ownership.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

// ============================================================================
// Types
// ============================================================================

interface CreatePolicyRequest {
  policy_name: string;
  external_policy_id?: string;
  policy_type: string;
  template_id: string;
  sla_hours: number;
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Get the body
    const body: CreatePolicyRequest = await request.json();
    
    // 2. Validate required fields
    if (!body.policy_name || !body.policy_type || !body.template_id) {
      return NextResponse.json(
        { error: 'Missing required fields: policy_name, policy_type, template_id' },
        { status: 400 }
      );
    }

    // 3. Use server client to get authenticated user
    const supabaseServer = await createServerClient();
    const { data: { session }, error: sessionError } = await supabaseServer.auth.getSession();
    
    if (sessionError || !session) {
      console.error('Session error:', sessionError);
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // 4. Get user's business_id
    const { data: userData, error: userError } = await supabaseServer
      .from('users')
      .select('business_id, role')
      .eq('id', session.user.id)
      .single() as { data: { business_id: string; role: string } | null; error: unknown };

    if (userError || !userData?.business_id) {
      console.error('User fetch error:', userError);
      return NextResponse.json(
        { error: 'Could not find your business. Please contact support.' },
        { status: 400 }
      );
    }

    const businessId = userData.business_id;

    // 5. Use Admin client (service role) to bypass RLS for insert
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

    // 6. Insert the policy
    const { data: policy, error: insertError } = await supabaseAdmin
      .from('policies')
      .insert({
        business_id: businessId,
        policy_name: body.policy_name.trim(),
        external_policy_id: body.external_policy_id?.trim() || null,
        policy_type: body.policy_type,
        template_id: body.template_id,
        sla_hours: body.sla_hours || 24,
        status: 'active',
        custom_questions: [], // Initialize as empty array
      })
      .select('id, policy_name')
      .single();

    if (insertError) {
      console.error('Policy insert error:', insertError);
      return NextResponse.json(
        { error: insertError.message || 'Failed to create policy' },
        { status: 500 }
      );
    }

    console.log('Policy created successfully:', policy);

    return NextResponse.json({
      success: true,
      policy: policy,
    });

  } catch (error) {
    console.error('Create policy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
