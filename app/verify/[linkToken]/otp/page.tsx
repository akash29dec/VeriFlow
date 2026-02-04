'use client';

/**
 * OTP Verification Page
 * Handles SMS OTP verification for customer identity
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useVerification } from '@/contexts/VerificationContext';
import { Shield, ChevronRight, ChevronLeft, Loader2, RefreshCw } from 'lucide-react';

export default function OTPPage() {
  const params = useParams();
  const router = useRouter();
  const { state, dispatch } = useVerification();
  
  const linkToken = params.linkToken as string;

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ============================================================================
  // CRITICAL: RENDER-TIME BLOCK FOR REVISION MODE
  // This MUST come before any useEffect to prevent side effects
  // ============================================================================
  const isRevisionMode = state.verification?.status === 'needs_revision';
  
  // IMMEDIATE redirect for revision mode (in useEffect for proper React lifecycle)
  useEffect(() => {
    if (isRevisionMode) {
      console.log('🛡️ OTP GUARD: Forcing jump to Form (revision mode)');
      router.replace(`/verify/${linkToken}/form`);
    }
  }, [isRevisionMode, linkToken, router]);

  // Check if already verified (skip if revision mode)
  useEffect(() => {
    if (isRevisionMode) return;
    
    // If context is missing (refreshed page), redirect to landing
    if (!state.verification) {
      router.replace(`/verify/${linkToken}`);
      return;
    }

    if (state.otpVerified) {
      router.push(`/verify/${linkToken}/identity`);
    }
  }, [isRevisionMode, state.otpVerified, state.verification, linkToken, router]);

  // Send OTP on mount (but NOT in revision mode)
  useEffect(() => {
    // GUARD: Don't send OTP if revision mode or already verified
    if (isRevisionMode || state.otpVerified) return;
    
    sendOTP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevisionMode, state.otpVerified]);

  // RENDER-TIME BLOCK: Return loading if in revision mode
  // This prevents full page render while redirect is happening
  if (isRevisionMode) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Redirecting to form...</p>
        </div>
      </div>
    );
  }

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  // Send OTP (mocked)
  const sendOTP = async () => {
    setIsSending(true);
    setError(null);

    try {
      // Mock OTP sending - in production this would call the API
      console.log('📱 Sending OTP to:', state.verification?.customer_phone_masked);
      console.log('🔑 Mock OTP: 123456 (for testing)');
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      setResendTimer(30);
      setCanResend(false);
    } catch (err) {
      setError('Failed to send OTP. Please try again.');
      console.error('Send OTP error:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Handle OTP input change
  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError(null);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle keydown for backspace navigation
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  // Verify OTP
  const handleVerify = async () => {
    const otpCode = otp.join('');
    
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Mock verification - accept 123456 for testing
      if (otpCode === '123456') {
        console.log('✅ OTP verified successfully');
        
        dispatch({
          type: 'SET_OTP_VERIFIED',
          payload: {
            verified: true,
            verifiedAt: new Date().toISOString(),
          },
        });

        if (state.verification?.status === 'needs_revision') {
          dispatch({ type: 'SET_STEP', payload: 'form' });
          router.push(`/verify/${linkToken}/form`);
        } else {
          dispatch({ type: 'SET_STEP', payload: 'identity' });
          router.push(`/verify/${linkToken}/identity`);
        }
      } else {
        setError('Invalid OTP. Please try again.');
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
      console.error('Verify OTP error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push(`/verify/${linkToken}`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="font-bold text-gray-900">VeriFlow</span>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>Step 1 of 5</span>
            <span>Verify Identity</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: '20%' }} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h1 className="text-xl font-bold text-gray-900 text-center mb-2">
              Enter verification code
            </h1>
            <p className="text-gray-500 text-center mb-6">
              We sent a 6-digit code to <br />
              <span className="font-medium text-gray-700">{state.verification?.customer_phone_masked}</span>
            </p>

            {/* OTP Inputs */}
            <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-lg transition-colors
                    ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 focus:border-blue-500'}
                    focus:outline-none focus:ring-2 focus:ring-blue-200`}
                  disabled={isLoading}
                />
              ))}
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-red-500 text-sm text-center mb-4">{error}</p>
            )}

            {/* Verify Button */}
            <button
              onClick={handleVerify}
              disabled={isLoading || otp.join('').length !== 6}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify OTP
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>

            {/* Resend */}
            <div className="mt-6 text-center">
              {canResend ? (
                <button
                  onClick={sendOTP}
                  disabled={isSending}
                  className="text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-2 mx-auto"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Resend code
                </button>
              ) : (
                <p className="text-gray-500 text-sm">
                  Didn&apos;t receive code? Resend in <span className="font-medium">{resendTimer}s</span>
                </p>
              )}
            </div>

            {/* Test hint */}
            <p className="mt-6 text-xs text-gray-400 text-center">
              For testing, use code: <code className="bg-gray-100 px-1 rounded">123456</code>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
