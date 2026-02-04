'use client';

/**
 * Login Page
 * Handles authentication with role-based redirect
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      console.log('[Login] Starting sign-in for email:', email);

      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('[Login] signInWithPassword result:', {
        hasUser: !!authData?.user,
        hasSession: !!authData?.session,
        authError,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password');
        } else {
          setError(authError.message);
        }
        setIsLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Login failed. Please try again.');
        setIsLoading(false);
        return;
      }

      console.log('[Login] Auth successful, user ID:', authData.user.id);
      console.log('[Login] Session:', authData.session ? 'Present' : 'Missing');

      // Small delay to ensure session is established
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get user role from users table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: userData, error: userError } = await (supabase as any)
        .from('users')
        .select('role, is_active, business_id')
        .eq('id', authData.user.id)
        .single();

      console.log('[Login] User query result:', { userData, userError });

      if (userError || !userData) {
        console.error('[Login] Profile error:', userError);
        setError('User profile not found. Please contact support.');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      const user = userData as { role: string; is_active: boolean; business_id: string };

      // Check if user is active
      if (!user.is_active) {
        setError('Your account has been deactivated. Please contact support.');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      // Redirect based on role
      switch (user.role) {
        case 'super_admin':
        case 'business_admin':
          router.push('/admin/dashboard');
          break;
        case 'verifier':
          router.push('/agent/dashboard');
          break;
        default:
          setError('Unknown user role. Please contact support.');
          await supabase.auth.signOut();
          setIsLoading(false);
          return;
      }

    } catch (err) {
      console.error('[Login] Unexpected error during sign-in:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      // Always reset loading state so the button doesn't stay stuck
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">VeriFlow</h1>
          <p className="text-blue-200 mt-1">Remote Verification Platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">
            Welcome back
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <p className="text-xs font-medium text-gray-500 mb-2">Demo Credentials</p>
            <p className="text-xs text-gray-600">
              Create users in Supabase Auth dashboard and add them to the <code className="bg-gray-200 px-1 rounded">users</code> table.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-blue-200 text-sm mt-6">
          © 2026 VeriFlow. All rights reserved.
        </p>
      </div>
    </div>
  );
}
