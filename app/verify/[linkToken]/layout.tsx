'use client';

/**
 * Verification Flow Layout
 * Wraps all verification pages with the context provider
 */

import { VerificationProvider } from '@/contexts/VerificationContext';

export default function VerificationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <VerificationProvider>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        {children}
      </div>
    </VerificationProvider>
  );
}
