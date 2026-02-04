'use client';

/**
 * Verification Landing Page
 * Validates link and shows welcome screen
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useVerification } from '@/contexts/VerificationContext';
import { Shield, Clock, FileText, Camera, AlertCircle, Loader2, ChevronRight } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ValidationResponse {
  success: boolean;
  verification: {
    id: string;
    verification_ref: string;
    status: string;
    customer_name: string;
    customer_phone_masked: string;
    link_expiry: string;
  };
  // ⚠️ FIX: The API returns the full object, not just an array
  template: {
    categories: unknown[];
    [key: string]: unknown;
  };
  custom_questions: unknown[] | null; // ADDED: Edited categories from policy
  policy_type: string;
  requires_gps: boolean;
}

interface ErrorResponse {
  error: string;
  code?: string;
  expired_at?: string;
  status?: string;
}

// ============================================================================
// Component
// ============================================================================

export default function VerificationLandingPage() {
  const params = useParams();
  const router = useRouter();
  const { state, dispatch } = useVerification();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  // Handle Promise-based params for Next.js 15 compatibility (optional safety)
  const linkToken = params?.linkToken as string;

  useEffect(() => {
    if (!linkToken) return;

    // Set link token in context
    dispatch({ type: 'SET_LINK_TOKEN', payload: linkToken });

    // Validate link
    async function validateLink() {
      try {
        const response = await fetch(`/api/verify/${linkToken}/validate`);
        const data = await response.json();

        if (!response.ok) {
          const errorData = data as ErrorResponse;
          setError({ 
            message: errorData.error, 
            code: errorData.code 
          });
          setIsLoading(false);
          return;
        }

        const validData = data as ValidationResponse;
        
        // ⚠️ CRITICAL FIX: Extract categories from the template object
        // The API returns { template_name: "...", categories: [...] }
        // The Context expects just [...]
        const templateCategories = validData.template?.categories || [];

        // Set verification data in context
        dispatch({
          type: 'SET_VERIFICATION_DATA',
          payload: {
            verification: validData.verification,
            template: templateCategories as import('@/types/database').TemplateCategory[],
            customQuestions: validData.custom_questions, // ADDED
            policyType: validData.policy_type,
            requiresGPS: validData.requires_gps,
            propertyCoordinates: null, 
          },
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Validation error:', err);
        setError({ message: 'Failed to validate link. Please try again.' });
        setIsLoading(false);
      }
    }

    validateLink();
  }, [linkToken, dispatch]);

  // ============================================================================
  // TASK 1 FIX: Guard clause for revision mode
  // If verification is in needs_revision status, skip intro/otp/identity
  // ============================================================================
  useEffect(() => {
    if (!state.verification) return;
    
    // BLOCKER: If we are in revision mode, NEVER allow intro/otp/identity steps
    if (state.verification.status === 'needs_revision') {
      const currentStep = state.currentStep;
      if (currentStep === 'landing' || currentStep === 'otp' || currentStep === 'identity') {
        console.log('🛡️ GUARD: Forcing jump to Form (revision mode)');
        dispatch({ type: 'SET_STEP', payload: 'form' });
        router.push(`/verify/${linkToken}/form`);
      }
    }
  }, [state.verification, state.currentStep, dispatch, linkToken, router]);

  // Handle start verification
  const handleStart = () => {
    // TASK 1 FIX: If in revision mode, go directly to form
    if (state.verification?.status === 'needs_revision') {
      console.log('🛡️ GUARD: Skipping OTP/Identity for revision mode');
      dispatch({ type: 'SET_STEP', payload: 'form' });
      router.push(`/verify/${linkToken}/form`);
      return;
    }
    
    dispatch({ type: 'SET_STEP', payload: 'otp' });
    router.push(`/verify/${linkToken}/otp`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Validating your link...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {error.code === 'EXPIRED' ? 'Link Expired' : 
             error.code === 'ALREADY_COMPLETED' ? 'Already Completed' :
             error.code === 'CANCELLED' ? 'Verification Cancelled' :
             'Invalid Link'}
          </h1>
          
          <p className="text-gray-600 mb-6">{error.message}</p>
          
          <p className="text-sm text-gray-500">
            Please contact your insurance provider for a new verification link.
          </p>
        </div>
      </div>
    );
  }

  // Success state - show welcome screen
  const verification = state.verification;
  // Fallback to data from API if context update hasn't propagated yet
  const displayExpiry = verification?.link_expiry;
  const expiry = displayExpiry ? new Date(displayExpiry) : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-center gap-2">
          <Shield className="w-6 h-6 text-blue-600" />
          <span className="font-bold text-lg text-gray-900">VeriFlow</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Welcome Card */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8 text-center text-white">
              <h1 className="text-2xl font-bold mb-2">Verification Required</h1>
              <p className="text-blue-100">Complete your verification to proceed</p>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Greeting */}
              <p className="text-lg text-gray-900 mb-6">
                Hi <span className="font-semibold">{verification?.customer_name}</span>,
              </p>

              {/* Info Text */}
              <p className="text-gray-600 mb-6">
                Complete your verification to proceed with your application. 
                This will take approximately 10-15 minutes.
              </p>

              {/* What You'll Need */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <h3 className="font-medium text-gray-900 mb-3">You&apos;ll need:</h3>
                <ul className="space-y-2">
                  <li className="flex items-center gap-3 text-sm text-gray-600">
                    <Camera className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <span>Clear photos of the property/vehicle</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-600">
                    <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <span>ID proof (Aadhaar/PAN)</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-600">
                    <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <span>10-15 minutes of your time</span>
                  </li>
                </ul>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStart}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                Start Verification
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Reference & Expiry */}
              <div className="mt-6 pt-4 border-t border-gray-100 text-center text-sm text-gray-500">
                <p className="mb-1">
                  Reference: <span className="font-medium text-gray-700">{verification?.verification_ref}</span>
                </p>
                {expiry && (
                  <p>
                    Valid until: <span className="font-medium text-gray-700">
                      {expiry.toLocaleDateString()} {expiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Security Note */}
          <p className="text-center text-xs text-gray-400 mt-4 flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" />
            Secured by VeriFlow
          </p>
        </div>
      </main>
    </div>
  );
}