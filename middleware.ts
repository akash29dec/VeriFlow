/**
 * VeriFlow Middleware (Next.js 16+)
 * 
 * Route Protection Rules:
 * - /admin/*  → Requires: super_admin OR business_admin
 * - /agent/*  → Requires: verifier OR business_admin OR super_admin
 * - /verify/* → Public (link token validation handled in page)
 * - /login    → Public
 */

// Disable TLS certificate verification for development
// This is needed because some corporate networks/VPNs intercept HTTPS
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { UserRole } from '@/types/database';

const ADMIN_ROLES: UserRole[] = ['super_admin', 'business_admin'];
const AGENT_ROLES: UserRole[] = ['verifier', 'business_admin', 'super_admin'];

interface UserRoleData {
  role: UserRole;
  is_active: boolean;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { pathname } = request.nextUrl;

  // Public routes - no authentication required
  if (
    pathname.startsWith('/verify') ||
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/api/verify')
  ) {
    return response;
  }

  // Protected routes require authentication
  if (pathname.startsWith('/admin') || pathname.startsWith('/agent')) {
    // In local development, Supabase Auth from the edge runtime may fail due to
    // corporate proxies / VPN. To avoid blocking development, we skip the
    // Supabase check here and let client-side guards handle it.
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Middleware] Skipping Supabase auth check in development for:', pathname);
      return response;
    }

    try {
      console.log('[Middleware] Protected route hit:', pathname);

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                request.cookies.set(name, value);
                response.cookies.set(name, value, options);
              });
            },
          },
        }
      );

      // Use getUser() instead of getSession() for security
      // getUser() validates the JWT with Supabase Auth server
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      console.log('[Middleware] getUser result:', {
        hasUser: !!user,
        authError,
      });

      // No user - redirect to login
      if (authError || !user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }

      // Get user role from database
      const { data: userData, error } = await supabase
        .from('users')
        .select('role, is_active')
        .eq('id', user.id)
        .single<UserRoleData>();

      if (error || !userData) {
        console.error('[Middleware] Failed to fetch user role:', error);
        // Redirect to login instead of showing error
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', 'user_not_found');
        return NextResponse.redirect(loginUrl);
      }

      // Check if user is active
      if (!userData.is_active) {
        return new NextResponse('Account is deactivated', { status: 403 });
      }

      // Admin routes - check for admin roles
      if (pathname.startsWith('/admin')) {
        if (!ADMIN_ROLES.includes(userData.role as UserRole)) {
          return new NextResponse('Unauthorized - Admin access required', {
            status: 403,
          });
        }
      }

      // Agent routes - check for agent/verifier roles
      if (pathname.startsWith('/agent')) {
        if (!AGENT_ROLES.includes(userData.role as UserRole)) {
          return new NextResponse('Unauthorized - Agent access required', {
            status: 403,
          });
        }
      }
    } catch (e) {
      console.error('[Middleware] Supabase auth failure:', e);
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      loginUrl.searchParams.set('error', 'auth_check_failed');
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the following:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
