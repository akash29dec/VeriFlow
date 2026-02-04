'use server';

/**
 * Server Actions for Admin Verifications
 */

import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

// Service Role client for bypassing RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  }
);

export async function regenerateVerificationLink(verificationId: string) {
  try {
    // Generate new link token
    const newLinkToken = randomUUID();

    // Use admin client to bypass RLS
    const { error } = await supabaseAdmin
      .from('verifications')
      .update({
        link_token: newLinkToken,
        created_at: new Date().toISOString(),
      })
      .eq('id', verificationId);

    if (error) {
      console.error('Error regenerating link:', error);
      return { success: false, error: error.message };
    }

    // Revalidate the admin page to show updated link immediately
    revalidatePath(`/admin/verifications/${verificationId}`);

    return { success: true, newLinkToken };
  } catch (error) {
    console.error('Error regenerating link:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Type for rejection feedback map
export type RejectionFeedbackMap = {
  [categoryId: string]: {
    [fieldId: string]: string; // reason string
  };
};

export async function rejectSubmission(
  verificationId: string,
  feedbackMap: RejectionFeedbackMap
) {
  try {
    // First, fetch current rejection count (using admin client)
    const { data: verification, error: fetchError } = await supabaseAdmin
      .from('verifications')
      .select('rejection_count, id')
      .eq('id', verificationId)
      .single();

    if (fetchError || !verification) {
      console.error('Error fetching verification:', fetchError);
      return { success: false, error: 'Verification not found' };
    }

    const currentCount = verification.rejection_count || 0;

    // Check if this will be a FINAL permanent rejection (4th time)
    const isFinalRejection = currentCount >= 3;

    if (isFinalRejection) {
      // FINAL REJECTION: Status becomes 'rejected' permanently
      const { error: updateError } = await supabaseAdmin
        .from('verifications')
        .update({
          rejection_count: currentCount + 1,
          rejection_reason: feedbackMap,
          status: 'rejected', // PERMANENT REJECTION
          // No new link_token generated - verification is closed
        })
        .eq('id', verificationId);

      if (updateError) {
        console.error('Error permanently rejecting verification:', updateError);
        return { success: false, error: updateError.message };
      }

      // Revalidate the admin page
      revalidatePath(`/admin/verifications/${verificationId}`);

      return { 
        success: true, 
        newRejectionCount: currentCount + 1,
        isPermanentlyRejected: true,
        newLinkToken: null
      };
    }

    // Normal rejection (1st, 2nd, or 3rd time) - allow revision
    // Generate new link token for fresh customer entry
    const newLinkToken = randomUUID();
    
    // Calculate new expiry (7 days from now)
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 7);

    // Update verification with rejection data (using admin client to bypass RLS)
    const { error: updateError } = await supabaseAdmin
      .from('verifications')
      .update({
        rejection_count: currentCount + 1,
        rejection_reason: feedbackMap,
        status: 'needs_revision',
        link_token: newLinkToken,
        link_expiry: newExpiry.toISOString(),
        created_at: new Date().toISOString(),
      })
      .eq('id', verificationId);

    if (updateError) {
      console.error('Error updating verification:', updateError);
      return { success: false, error: updateError.message };
    }

    // Revalidate the admin page
    revalidatePath(`/admin/verifications/${verificationId}`);

    return { 
      success: true, 
      newRejectionCount: currentCount + 1,
      isPermanentlyRejected: false,
      newLinkToken 
    };
  } catch (error) {
    console.error('Error rejecting submission:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
