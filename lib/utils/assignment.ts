/**
 * Verifier Assignment Utilities
 * Round-robin assignment logic for distributing verifications
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { PolicyType } from '@/types/database';

/**
 * Result of verifier assignment
 */
export interface AssignmentResult {
  success: boolean;
  verifierId: string | null;
  verifierName: string | null;
  message: string;
}

/**
 * Verifier data from query
 */
interface VerifierData {
  id: string;
  full_name: string | null;
  team_id: string | null;
}

/**
 * Team data from query
 */
interface TeamData {
  id: string;
  policy_types: string[];
}

/**
 * Verification assignment data
 */
interface VerificationAssignment {
  assigned_verifier_id: string | null;
}

/**
 * Assign a verifier using round-robin algorithm
 * 
 * Algorithm:
 * 1. Get all active verifiers for the business
 * 2. Filter by team policy type if applicable
 * 3. Find verifier with least active assignments
 * 4. Return the selected verifier ID
 * 
 * @param businessId - Business ID to find verifiers for
 * @param policyType - Policy type to match team assignments
 * @returns Assignment result with verifier ID
 */
export async function assignVerifierRoundRobin(
  businessId: string,
  policyType: PolicyType
): Promise<AssignmentResult> {
  const supabase = await createServiceClient();

  // Get all active verifiers for this business
  const { data, error: verifiersError } = await supabase
    .from('users')
    .select('id, full_name, team_id')
    .eq('business_id', businessId)
    .eq('role', 'verifier')
    .eq('is_active', true);

  const verifiers = data as VerifierData[] | null;

  if (verifiersError || !verifiers || verifiers.length === 0) {
    return {
      success: false,
      verifierId: null,
      verifierName: null,
      message: 'No active verifiers found for this business',
    };
  }

  // Get teams to filter by policy type
  const teamIds = verifiers
    .map((v) => v.team_id)
    .filter((id): id is string => id !== null);

  let eligibleVerifiers = verifiers;

  if (teamIds.length > 0) {
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, policy_types')
      .in('id', teamIds);

    const teams = teamsData as TeamData[] | null;

    if (teams) {
      const teamPolicyMap = new Map<string, string[]>();
      teams.forEach((t) => {
        teamPolicyMap.set(t.id, t.policy_types || []);
      });

      // Filter verifiers by team policy type
      eligibleVerifiers = verifiers.filter((v) => {
        // If no team, verifier can handle any type
        if (!v.team_id) return true;
        
        // Check if team handles this policy type
        const teamPolicyTypes = teamPolicyMap.get(v.team_id) || [];
        return teamPolicyTypes.length === 0 || teamPolicyTypes.includes(policyType);
      });
    }
  }

  if (eligibleVerifiers.length === 0) {
    return {
      success: false,
      verifierId: null,
      verifierName: null,
      message: `No verifiers available for policy type: ${policyType}`,
    };
  }

  // Get active verification counts for each eligible verifier
  const verifierIds = eligibleVerifiers.map((v) => v.id);
  
  const { data: countsData, error: countsError } = await supabase
    .from('verifications')
    .select('assigned_verifier_id')
    .in('assigned_verifier_id', verifierIds)
    .in('status', ['draft', 'in_progress', 'submitted', 'under_review', 'more_info_requested']);

  const assignmentCounts = countsData as VerificationAssignment[] | null;

  if (countsError) {
    console.error('Error fetching assignment counts:', countsError);
    // Fall back to first verifier if count fails
    const fallback = eligibleVerifiers[0];
    return {
      success: true,
      verifierId: fallback.id,
      verifierName: fallback.full_name,
      message: 'Assigned (fallback due to count error)',
    };
  }

  // Count assignments per verifier
  const countMap = new Map<string, number>();
  verifierIds.forEach((id) => countMap.set(id, 0));
  
  assignmentCounts?.forEach((v) => {
    if (v.assigned_verifier_id) {
      const current = countMap.get(v.assigned_verifier_id) || 0;
      countMap.set(v.assigned_verifier_id, current + 1);
    }
  });

  // Find verifier with minimum assignments
  let minCount = Infinity;
  let selectedVerifier: VerifierData | null = null;

  eligibleVerifiers.forEach((verifier) => {
    const count = countMap.get(verifier.id) || 0;
    if (count < minCount) {
      minCount = count;
      selectedVerifier = verifier;
    }
  });

  if (!selectedVerifier) {
    return {
      success: false,
      verifierId: null,
      verifierName: null,
      message: 'Could not determine least-loaded verifier',
    };
  }

  // Extract values to avoid TypeScript narrowing issues
  const finalVerifier: VerifierData = selectedVerifier;

  return {
    success: true,
    verifierId: finalVerifier.id,
    verifierName: finalVerifier.full_name,
    message: `Assigned to verifier with ${minCount} active assignments`,
  };
}

/**
 * Verifier info for dropdown
 */
export interface VerifierInfo {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * Get available verifiers for manual assignment dropdown
 */
export async function getAvailableVerifiers(
  businessId: string,
  _policyType?: PolicyType
): Promise<VerifierInfo[]> {
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('business_id', businessId)
    .eq('role', 'verifier')
    .eq('is_active', true)
    .order('full_name');

  const verifiers = data as VerifierInfo[] | null;

  if (error || !verifiers) {
    console.error('Error fetching verifiers:', error);
    return [];
  }

  return verifiers;
}

/**
 * Reassign a verification to a different verifier
 */
export async function reassignVerification(
  verificationId: string,
  newVerifierId: string,
  reassignedBy: string
): Promise<{ success: boolean; message: string }> {
  const supabase = await createServiceClient();

  // Use type assertion to bypass strict typing for dynamic updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('verifications')
    .update({ 
      assigned_verifier_id: newVerifierId,
      updated_at: new Date().toISOString()
    })
    .eq('id', verificationId);

  if (error) {
    return {
      success: false,
      message: `Failed to reassign: ${error.message}`,
    };
  }

  // Log the reassignment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('audit_logs').insert({
    verification_id: verificationId,
    actor_id: reassignedBy,
    actor_type: 'admin',
    action: 'verification_reassigned',
    details: { new_verifier_id: newVerifierId },
  });

  return {
    success: true,
    message: 'Verification reassigned successfully',
  };
}
