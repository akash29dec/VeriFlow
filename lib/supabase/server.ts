import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

/**
 * Create a Supabase client for Server Components, Server Actions, and Route Handlers
 * 
 * Handles cookie management for session persistence with proper error handling.
 * Compatible with Next.js 16+ where cookies() is async.
 */
export async function createServerClient() {
  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  }

  try {
    // In Next.js 16+, cookies() is async and must be awaited
    const cookieStore = await cookies();

    return createSupabaseServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            try {
              return cookieStore.getAll();
            } catch (err) {
              // If cookies can't be read, return empty array
              console.warn('[createServerClient] Failed to get cookies:', err);
              return [];
            }
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch (err) {
              // The `setAll` method was called from a Server Component or Server Action
              // where cookies might be read-only. This is expected in some contexts.
              // We silently ignore this as it's handled by middleware for route handlers.
            }
          },
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Failed to initialize Supabase server client';
    console.error('[createServerClient] Initialization error:', errorMessage);
    throw new Error(`Supabase client initialization failed: ${errorMessage}`);
  }
}

/**
 * Create a Supabase client with service role for admin operations
 * 
 * Bypasses RLS - use with caution! Only use for operations that require
 * elevated privileges and cannot be done with the regular client.
 */
export async function createServiceClient() {
  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  try {
    const cookieStore = await cookies();

    return createSupabaseServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        cookies: {
          getAll() {
            try {
              return cookieStore.getAll();
            } catch (err) {
              console.warn('[createServiceClient] Failed to get cookies:', err);
              return [];
            }
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore in Server Components - service role client doesn't need cookie persistence
            }
          },
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Failed to initialize Supabase service client';
    console.error('[createServiceClient] Initialization error:', errorMessage);
    throw new Error(`Supabase service client initialization failed: ${errorMessage}`);
  }
}