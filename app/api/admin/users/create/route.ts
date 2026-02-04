/**
 * Create User API Route
 * Uses service role to create auth user and public.users profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Get request body
    const { full_name, email, password, specialization } = await request.json();

    // Validate required fields
    if (!full_name || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: full_name, email, password' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Get current user's session to verify they're an admin
    const userSupabase = await createServerClient();
    const { data: { session } } = await userSupabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get current user's role and business_id
    const { data: currentUser, error: userError } = await userSupabase
      .from('users')
      .select('role, business_id')
      .eq('id', session.user.id)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json(
        { error: 'Failed to verify user permissions' },
        { status: 403 }
      );
    }

    // Only admins can create users
    if (!['super_admin', 'business_admin'].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only admins can create users' },
        { status: 403 }
      );
    }

    // Use service client to create auth user
    const adminSupabase = await createServiceClient();

    // Create auth user
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create auth user' },
        { status: 500 }
      );
    }

    // Create public.users profile
    const { error: profileError } = await adminSupabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        role: 'verifier',
        specialization: specialization || null,
        business_id: currentUser.business_id,
        is_active: true,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Try to clean up auth user if profile creation fails
      await adminSupabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email,
        full_name,
      },
    });

  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
