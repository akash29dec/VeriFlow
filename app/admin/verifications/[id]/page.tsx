'use client';

/**
 * Admin Verification Detail Page
 * Read-only view with assignment management
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { calculateHaversineDistance } from '@/lib/utils/gps';
import { rejectSubmission } from '../actions';
import type { RejectionFeedbackMap } from '../actions';
import RejectionModal from '@/components/shared/RejectionModal';
import {
  ChevronLeft, Loader2, User, Phone, Mail, MapPin,
  FileText, Camera, CheckCircle, XCircle, AlertTriangle,
  Clock, ZoomIn, ExternalLink, Users, RefreshCw, X, Briefcase,
  Link, Copy
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Verification {
  id: string;
  verification_ref: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  customer_address: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  property_coordinates: { lat: number; lon: number } | null;
  assigned_verifier_id: string | null;
  link_token: string;
  link_expiry: string;
  rejection_count: number;
  rejection_reason: Record<string, Record<string, string>> | null;
  policy: {
    id: string;
    policy_name: string;
    policy_type: string;
    sla_hours: number;
    business_id: string;
    custom_questions: Array<{ id: string; title: string; [key: string]: unknown }> | null;
  } | null;
}

interface Verifier {
  id: string;
  full_name: string | null;
  email: string;
  specialization: string | null;
  active_count: number;
}

interface Submission {
  id: string;
  identity_method: string;
  photo_id_type: string;
  photo_id_number_encrypted: string;
  photo_id_url: string;
  categories: Array<{
    category_id: string;
    category_name: string;
    photos: Array<{
      field_id: string;
      url: string;
      gps: { lat: number; lon: number } | null;
      captured_at: string;
    }>;
    answers: Array<{
      question_id: string;
      value: string | number | string[];
    }>;
  }>;
  documents: Array<{ type: string; url: string }>;
  consent_timestamp: string;
  submitted_at: string;
}

// ============================================================================
// Photo Card Component
// ============================================================================

function PhotoCard({
  photo,
  label,
  policyType,
  propertyCoordinates,
  onZoom,
}: {
  photo: Submission['categories'][0]['photos'][0];
  label: string;
  policyType: string;
  propertyCoordinates: { lat: number; lon: number } | null;
  onZoom: (url: string) => void;
}) {
  const requiresGps = policyType === 'home_insurance';
  let gpsStatus: 'valid' | 'invalid' | 'missing' = 'missing';
  let distance: number | null = null;

  if (photo.gps && propertyCoordinates) {
    distance = calculateHaversineDistance(photo.gps, propertyCoordinates);
    gpsStatus = distance <= 100 ? 'valid' : 'invalid';
  } else if (photo.gps) {
    gpsStatus = 'valid';
  }

  // Cache busting: Use captured_at timestamp or fallback to current time
  const cacheBuster = `?t=${photo.captured_at ? new Date(photo.captured_at).getTime() : Date.now()}`;
  const photoUrlWithCache = photo.url.includes('?') ? photo.url : `${photo.url}${cacheBuster}`;

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="relative aspect-video bg-gray-100">
        <img
          src={photoUrlWithCache}
          alt={label}
          className="w-full h-full object-cover"
        />
        <button
          onClick={() => onZoom(photoUrlWithCache)}
          className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        
        {requiresGps && (
          <div className={`absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            gpsStatus === 'valid' ? 'bg-green-100 text-green-700' :
            gpsStatus === 'invalid' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {gpsStatus === 'valid' ? (
              <>
                <CheckCircle className="w-3 h-3" />
                {distance !== null ? `${Math.round(distance)}m` : 'GPS ✓'}
              </>
            ) : gpsStatus === 'invalid' ? (
              <>
                <XCircle className="w-3 h-3" />
                {distance !== null ? `${Math.round(distance)}m away` : 'Invalid'}
              </>
            ) : (
              <>
                <AlertTriangle className="w-3 h-3" />
                No GPS
              </>
            )}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {photo.gps && (
          <a
            href={`https://www.google.com/maps?q=${photo.gps.lat},${photo.gps.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
          >
            <MapPin className="w-3 h-3" />
            {photo.gps.lat.toFixed(4)}, {photo.gps.lon.toFixed(4)}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Reassign Modal Component
// ============================================================================

function ReassignModal({
  isOpen,
  onClose,
  verifiers,
  currentVerifierId,
  onReassign,
  isReassigning,
}: {
  isOpen: boolean;
  onClose: () => void;
  verifiers: Verifier[];
  currentVerifierId: string | null;
  onReassign: (verifierId: string) => void;
  isReassigning: boolean;
}) {
  const [selectedVerifier, setSelectedVerifier] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!isOpen) return null;

  const handleConfirmReassign = () => {
    if (selectedVerifier) {
      onReassign(selectedVerifier);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Reassign Verification</h3>
              <p className="text-sm text-gray-500">Select a new verifier</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isReassigning}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Verifier List */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {verifiers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No verifiers available for this policy type
            </div>
          ) : (
            <div className="space-y-2">
              {verifiers.map((verifier) => {
                const isCurrentVerifier = verifier.id === currentVerifierId;
                const isSelected = verifier.id === selectedVerifier;
                const isFree = verifier.active_count === 0;

                return (
                  <button
                    key={verifier.id}
                    onClick={() => !isCurrentVerifier && setSelectedVerifier(verifier.id)}
                    disabled={isCurrentVerifier || isReassigning}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : isCurrentVerifier
                        ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">
                              {verifier.full_name || 'Unnamed Verifier'}
                            </p>
                            {verifier.specialization && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full capitalize">
                                {verifier.specialization.replace(/_/g, ' ')}
                              </span>
                            )}
                            {isCurrentVerifier && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{verifier.email}</p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                        isFree
                          ? 'bg-green-100 text-green-700'
                          : verifier.active_count <= 2
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          isFree ? 'bg-green-500' : verifier.active_count <= 2 ? 'bg-yellow-500' : 'bg-red-500'
                        }`} />
                        {isFree ? 'Free' : `${verifier.active_count} Active`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isReassigning}
            className="flex-1 py-2.5 px-4 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 font-semibold rounded-xl transition-colors"
          >
            Cancel
          </button>
          {!showConfirm ? (
            <button
              onClick={() => selectedVerifier && setShowConfirm(true)}
              disabled={!selectedVerifier || isReassigning}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reassign
            </button>
          ) : (
            <button
              onClick={handleConfirmReassign}
              disabled={isReassigning}
              className="flex-1 py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isReassigning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Confirm Reassign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
    in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
    submitted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Submitted' },
    approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
    needs_revision: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Needs Revision' },
  };
  const c = config[status] || config.draft;
  return (
    <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AdminVerificationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createBrowserClient();

  const verificationId = params.id as string;

  const [verification, setVerification] = useState<Verification | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [assignedVerifier, setAssignedVerifier] = useState<Verifier | null>(null);
  const [verifiers, setVerifiers] = useState<Verifier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReassigning, setIsReassigning] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isRegeneratingLink, setIsRegeneratingLink] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Force remount on new data

  // Fetch verification data
  const fetchData = useCallback(async () => {
    setIsLoading(true);

    // Fetch verification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: verificationData, error: verificationError } = await (supabase as any)
      .from('verifications')
      .select(`
        id,
        verification_ref,
        customer_name,
        customer_email,
        customer_phone,
        customer_address,
        status,
        submitted_at,
        created_at,
        property_coordinates,
        assigned_verifier_id,
        link_token,
        link_expiry,
        rejection_count,
        rejection_reason,
        policy:policies (
          id,
          policy_name,
          policy_type,
          sla_hours,
          business_id,
          custom_questions
        )
      `)
      .eq('id', verificationId)
      .single();

    if (verificationError || !verificationData) {
      console.error('Error fetching verification:', verificationError);
      setIsLoading(false);
      return;
    }

    const typedVerification = verificationData as unknown as Verification;
    setVerification(typedVerification);

    // Fetch assigned verifier info
    if (typedVerification.assigned_verifier_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: verifierData } = await (supabase as any)
        .from('users')
        .select('id, full_name, email, specialization')
        .eq('id', typedVerification.assigned_verifier_id)
        .single();

      if (verifierData) {
        setAssignedVerifier({ ...verifierData, active_count: 0 });
      }
    }

    // Fetch submission (always get the LATEST one by submitted_at)
    console.log('📥 Fetching latest submission for verification:', verificationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: submissionData, error: submissionError } = await (supabase as any)
      .from('submissions')
      .select('*')
      .eq('verification_id', verificationId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    console.log('📋 Submission fetch result:', { 
      id: submissionData?.id, 
      submitted_at: submissionData?.submitted_at,
      photoCount: submissionData?.categories?.reduce((sum: number, c: { photos: unknown[] }) => sum + c.photos?.length, 0),
      error: submissionError
    });

    if (submissionData) {
      const typedSubmission = submissionData as unknown as Submission;
      
      // Build category name lookup from policy.custom_questions
      const categoryNameMap = new Map<string, string>();
      const customQuestions = typedVerification.policy?.custom_questions;
      if (customQuestions && Array.isArray(customQuestions)) {
        for (const cat of customQuestions) {
          if (cat && typeof cat === 'object' && 'id' in cat && 'title' in cat) {
            categoryNameMap.set(cat.id as string, cat.title as string);
          }
        }
      }
      
      // Enrich submission categories with proper names from custom_questions
      if (typedSubmission.categories?.length > 0) {
        const enrichedCategories = typedSubmission.categories.map(cat => ({
          ...cat,
          category_name: categoryNameMap.get(cat.category_id) || cat.category_name || cat.category_id,
        }));
        typedSubmission.categories = enrichedCategories;
      }
      
      setSubmission(typedSubmission);
      setRefreshKey(prev => prev + 1); // Force UI remount
      if (typedSubmission.categories?.length > 0) {
        setActiveCategory(typedSubmission.categories[0].category_id);
      }
    }

    setIsLoading(false);
  }, [supabase, verificationId]);

  // Fetch available verifiers for reassignment
  const fetchVerifiers = useCallback(async () => {
    if (!verification?.policy?.business_id) return;

    const policyType = verification.policy.policy_type;
    const businessId = verification.policy.business_id;

    // Fetch verifiers with matching specialization or NULL (can handle any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: verifierData } = await (supabase as any)
      .from('users')
      .select('id, full_name, email, specialization')
      .eq('business_id', businessId)
      .eq('role', 'verifier')
      .eq('is_active', true);

    if (!verifierData) return;

    // Filter by specialization (match policy type or NULL)
    const filtered = (verifierData as Verifier[]).filter(
      (v) => v.specialization === policyType || v.specialization === null
    );

    // Get active counts for each verifier
    const verifierIds = filtered.map((v) => v.id);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: countData } = await (supabase as any)
      .from('verifications')
      .select('assigned_verifier_id')
      .in('assigned_verifier_id', verifierIds)
      .in('status', ['pending', 'in_progress', 'submitted']);

    // Count active verifications per verifier
    const countMap = new Map<string, number>();
    (countData || []).forEach((v: { assigned_verifier_id: string }) => {
      const current = countMap.get(v.assigned_verifier_id) || 0;
      countMap.set(v.assigned_verifier_id, current + 1);
    });

    // Add counts to verifiers and sort by workload
    const withCounts = filtered.map((v) => ({
      ...v,
      active_count: countMap.get(v.id) || 0,
    })).sort((a, b) => a.active_count - b.active_count);

    setVerifiers(withCounts);
  }, [supabase, verification?.policy?.business_id, verification?.policy?.policy_type]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (verification) {
      fetchVerifiers();
    }
  }, [verification, fetchVerifiers]);

  // Realtime subscription for this specific verification
  // Realtime subscription for this specific verification
  useEffect(() => {
    if (!verificationId) return;

    const channel = supabase
      .channel(`verification-${verificationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'verifications',
          filter: `id=eq.${verificationId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: { new: any }) => {
          const updated = payload.new;
          
          console.log("🔔 STATUS UPDATE RECEIVED:", updated.status);

          // 1. Update local verification state immediately
          setVerification((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              status: updated.status,
              submitted_at: updated.submitted_at,
              assigned_verifier_id: updated.assigned_verifier_id,
              rejection_count: updated.rejection_count, // Ensure these update too
              rejection_reason: updated.rejection_reason,
            };
          });

          // 2. CRITICAL FIX: If status changes to 'submitted', FORCE FETCH the submission data
          // This ensures that even if the 'submissions' INSERT event is missed, we still get the data.
          if (updated.status === 'submitted') {
             console.log("⚡ Verification became SUBMITTED. Forcing data refresh...");
             setTimeout(() => {
                 fetchData(); 
             }, 500); // Small buffer to ensure DB write is complete
          }

          // Show toast notification
          const statusLabels: Record<string, string> = {
            draft: 'Draft',
            pending: 'Pending',
            in_progress: 'In Progress',
            submitted: 'Submitted',
            approved: 'Approved',
            rejected: 'Rejected',
            needs_revision: 'Needs Revision',
          };
          const label = statusLabels[updated.status] || updated.status;
          
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-pulse';
          toast.textContent = `Status updated to ${label}`;
          document.body.appendChild(toast);
          
          setTimeout(() => toast.remove(), 3000);
        }
      )
      .subscribe();

    // Realtime subscription for submissions - triggers re-fetch when customer submits
    const submissionChannel = supabase
      .channel(`submissions-${verificationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Listen for NEW submissions
          schema: 'public',
          table: 'submissions',
          filter: `verification_id=eq.${verificationId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: { new: any }) => {
          console.log('🚀 REALTIME: New Submission INSERT detected!');
          console.log('🚀 New Submission Data:', payload.new);
          
          // Show toast notification immediately
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-pulse';
          toast.textContent = '📄 New submission received! Updating view...';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 4000);
          
          // DIRECTLY update submission state from realtime payload (no refetch needed!)
          const newSubmission = payload.new as Submission;
          
          // Enrich category names from policy.custom_questions if available
          if (newSubmission.categories && verification?.policy?.custom_questions) {
            const categoryNameMap = new Map<string, string>();
            for (const cat of verification.policy.custom_questions) {
              if (cat && 'id' in cat && 'title' in cat) {
                categoryNameMap.set(cat.id as string, cat.title as string);
              }
            }
            newSubmission.categories = newSubmission.categories.map(cat => ({
              ...cat,
              category_name: categoryNameMap.get(cat.category_id) || cat.category_name || cat.category_id,
            }));
          }
          
          console.log('✅ Setting submission state directly from payload');
          setSubmission(newSubmission);
          setRefreshKey(prev => prev + 1); // Force UI re-render
          
          // Set active category if not already set
          if (newSubmission.categories?.length > 0 && !activeCategory) {
            setActiveCategory(newSubmission.categories[0].category_id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Listen for updates to existing submissions
          schema: 'public',
          table: 'submissions',
          filter: `verification_id=eq.${verificationId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: { new: any }) => {
          console.log('🔄 REALTIME: Submission UPDATE detected!', payload.new);
          
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-4 right-4 bg-amber-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-pulse';
          toast.textContent = '📝 Submission updated! Refreshing view...';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 4000);
          
          // DIRECTLY update submission state from realtime payload
          const updatedSubmission = payload.new as Submission;
          
          // Enrich category names if available
          if (updatedSubmission.categories && verification?.policy?.custom_questions) {
            const categoryNameMap = new Map<string, string>();
            for (const cat of verification.policy.custom_questions) {
              if (cat && 'id' in cat && 'title' in cat) {
                categoryNameMap.set(cat.id as string, cat.title as string);
              }
            }
            updatedSubmission.categories = updatedSubmission.categories.map(cat => ({
              ...cat,
              category_name: categoryNameMap.get(cat.category_id) || cat.category_name || cat.category_id,
            }));
          }
          
          console.log('✅ Setting submission state directly from UPDATE payload');
          setSubmission(updatedSubmission);
          setRefreshKey(prev => prev + 1);
        }
      )
      .subscribe();

    // Cleanup on unmount
    return () => {
      channel.unsubscribe();
      submissionChannel.unsubscribe();
    };
  }, [supabase, verificationId, fetchData]);

  // Handle reassignment
  const handleReassign = async (newVerifierId: string) => {
    if (!verification) return;

    setIsReassigning(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('verifications')
        .update({ assigned_verifier_id: newVerifierId })
        .eq('id', verification.id);

      if (error) throw error;

      // Log the action
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('audit_logs').insert({
        verification_id: verification.id,
        actor_type: 'admin',
        action: 'verifier_reassigned',
        details: {
          old_verifier_id: verification.assigned_verifier_id,
          new_verifier_id: newVerifierId,
        },
      });

      // Update local state
      const newVerifier = verifiers.find((v) => v.id === newVerifierId);
      if (newVerifier) {
        setAssignedVerifier(newVerifier);
        setVerification({ ...verification, assigned_verifier_id: newVerifierId });
      }

      setShowReassignModal(false);
      alert('Verification reassigned successfully!');
    } catch (error) {
      console.error('Reassign error:', error);
      alert('Failed to reassign. Please try again.');
    } finally {
      setIsReassigning(false);
    }
  };

  // Handle link regeneration
  const handleRegenerateLink = async () => {
    if (!verification) return;

    setIsRegeneratingLink(true);

    try {
      // Generate new link token using crypto
      const newLinkToken = crypto.randomUUID();
      
      // Calculate new expiry (7 days from now)
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 7);

      // Update verification with new link_token and link_expiry using browser client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('verifications')
        .update({
          link_token: newLinkToken,
          link_expiry: newExpiry.toISOString(),
        })
        .eq('id', verification.id);

      if (error) throw error;

      // Update local state with new link token and expiry
      setVerification({
        ...verification,
        link_token: newLinkToken,
        link_expiry: newExpiry.toISOString(),
      });

      alert('New Link Generated!');
    } catch (error) {
      console.error('Regenerate link error:', error);
      alert('Failed to regenerate link. Please try again.');
    } finally {
      setIsRegeneratingLink(false);
    }
  };

  // Handle rejection with feedback
  const handleReject = async (feedbackMap: RejectionFeedbackMap) => {
    if (!verification) return;

    setIsRejecting(true);

    try {
      const result = await rejectSubmission(verification.id, feedbackMap);

      if (!result.success) {
        throw new Error(result.error || 'Failed to reject submission');
      }

      // Update local state
      setVerification({
        ...verification,
        status: 'needs_revision',
        rejection_count: result.newRejectionCount || (verification.rejection_count || 0) + 1,
        rejection_reason: feedbackMap,
        link_token: result.newLinkToken || verification.link_token,
      });

      setShowRejectionModal(false);
    } catch (error) {
      console.error('Rejection error:', error);
      alert(error instanceof Error ? error.message : 'Failed to reject submission. Please try again.');
    } finally {
      setIsRejecting(false);
    }
  };

  // Get SLA info
  const getSlaInfo = () => {
    if (!verification?.created_at || !verification?.policy?.sla_hours) return null;
    
    const created = new Date(verification.created_at);
    const deadline = new Date(created.getTime() + verification.policy.sla_hours * 60 * 60 * 1000);
    const now = new Date();
    const remaining = deadline.getTime() - now.getTime();
    const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
    const isOverdue = remaining < 0;

    return { deadline, hoursRemaining, isOverdue };
  };

  const slaInfo = getSlaInfo();
  const currentCategoryData = submission?.categories.find((c) => c.category_id === activeCategory);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!verification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Verification Not Found</h1>
          <button
            onClick={() => router.push('/admin/verifications')}
            className="text-blue-600 hover:underline"
          >
            Back to Verifications
          </button>
        </div>
      </div>
    );
  }

  const policyType = verification.policy?.policy_type || 'unknown';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/verifications')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Briefcase className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-lg text-gray-900">
                {verification.verification_ref}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {verification.policy?.policy_name || 'Verification Details'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <StatusBadge status={verification.status} />
            
            {/* Action buttons for submitted verifications */}
            {verification.status === 'submitted' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    // Approve handler - update status to 'approved'
                    (async () => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const { error } = await (supabase as any)
                        .from('verifications')
                        .update({ status: 'approved' })
                        .eq('id', verification.id);
                      if (!error) {
                        setVerification({ ...verification, status: 'approved' });
                        alert('Verification approved!');
                      }
                    })();
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => setShowRejectionModal(true)}
                    className={`px-4 py-2 text-white rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      (verification.rejection_count || 0) >= 3 
                        ? 'bg-red-800 hover:bg-red-900' 
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    {(verification.rejection_count || 0) >= 3 ? 'Final Reject' : 'Reject'}
                  </button>
                  {(verification.rejection_count || 0) >= 3 && (
                    <div className="absolute top-full left-1/3 -translate-x-1/2 mt-1 px-3 py-1.5 bg-red-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      ⚠️ This will permanently reject
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Verification Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Info Card */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-gray-700" />
                Customer Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 text-gray-600">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900 font-medium">{verification.customer_name}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900">{verification.customer_phone}</span>
                </div>
                {verification.customer_email && (
                  <div className="flex items-center gap-3 text-gray-600">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-900">{verification.customer_email}</span>
                  </div>
                )}
                {verification.customer_address && (
                  <div className="flex items-start gap-3 text-gray-600 md:col-span-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-gray-900">{verification.customer_address}</span>
                  </div>
                )}
              </div>
            </div>



            {/* Policy Details Card */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-700" />
                Policy Details
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Policy Name</p>
                  <p className="text-gray-900 font-medium">{verification.policy?.policy_name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Type</p>
                  <p className="text-gray-900 font-medium capitalize">{policyType.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="text-gray-900">{new Date(verification.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">SLA</p>
                  {slaInfo && (
                    <p className={`font-medium ${slaInfo.isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                      {slaInfo.isOverdue 
                        ? 'Overdue' 
                        : `${slaInfo.hoursRemaining}h remaining`}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Submission Data */}
            {submission && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-gray-700" />
                  Submitted Data
                </h3>

                {/* Category Tabs */}
                {submission.categories.length > 0 && (
                  <div className="flex gap-2 mb-6 flex-wrap">
                    {submission.categories.map((category) => (
                      <button
                        key={category.category_id}
                        onClick={() => setActiveCategory(category.category_id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          activeCategory === category.category_id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {category.category_name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Photo Grid */}
                {currentCategoryData && currentCategoryData.photos.length > 0 && (
                  <div key={`photos-${refreshKey}`} className="mb-6 animate-in fade-in duration-300">
                    <h4 className="font-medium text-gray-900 mb-3">Photos ({currentCategoryData.photos.length})</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {currentCategoryData.photos.map((photo, idx) => (
                        <PhotoCard
                          key={photo.field_id || idx}
                          photo={photo}
                          label={`Photo ${idx + 1}`}
                          policyType={policyType}
                          propertyCoordinates={verification.property_coordinates}
                          onZoom={setZoomedImage}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Answers */}
                {currentCategoryData && currentCategoryData.answers.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Form Answers</h4>
                    <div className="space-y-3">
                      {currentCategoryData.answers.map((answer, idx) => (
                        <div key={answer.question_id || idx} className="flex justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-gray-600 text-sm">{answer.question_id}</span>
                          <span className="text-gray-900 font-medium text-sm">
                            {Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ID Document */}
                {submission.photo_id_url && (
                  <div className="mt-6 pt-6 border-t">
                    <h4 className="font-medium text-gray-900 mb-3">ID Document</h4>
                    <div className="flex items-start gap-4">
                      <img
                        src={submission.photo_id_url}
                        alt="ID Document"
                        className="w-32 h-20 object-cover rounded-lg border cursor-pointer"
                        onClick={() => setZoomedImage(submission.photo_id_url)}
                      />
                      <div className="text-sm">
                        <p className="text-gray-500">Type: <span className="text-gray-900 font-medium">{submission.photo_id_type?.toUpperCase()}</span></p>
                        <p className="text-gray-500">ID: <span className="text-gray-900 font-mono">{submission.photo_id_number_encrypted?.slice(-4).padStart(12, '•')}</span></p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Assignment & Actions */}
          <div className="space-y-6">
            {/* Assignment Card */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-700" />
                Assignment
              </h3>
              
              {assignedVerifier ? (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-blue-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {assignedVerifier.full_name || 'Unnamed Verifier'}
                      </p>
                      <p className="text-sm text-gray-600">{assignedVerifier.email}</p>
                      {assignedVerifier.specialization && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full capitalize">
                          {assignedVerifier.specialization.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-amber-200 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-amber-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Unassigned</p>
                      <p className="text-sm text-gray-600">No verifier assigned yet</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowReassignModal(true)}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {assignedVerifier ? 'Reassign Verifier' : 'Assign Verifier'}
              </button>
            </div>

            {/* Customer Access Link Card */}
            {['pending', 'in_progress','draft', 'needs_revision'].includes(verification.status) && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Link className="w-5 h-5 text-gray-700" />
                  Customer Access Link
                </h3>
                
                {(() => {
                  const linkUrl = typeof window !== 'undefined' 
                    ? `${window.location.origin}/verify/${verification.link_token}`
                    : `/verify/${verification.link_token}`;
                  
                  const handleCopyLink = async () => {
                    try {
                      if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(linkUrl);
                      } else {
                        const textArea = document.createElement('textarea');
                        textArea.value = linkUrl;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-9999px';
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                      }
                      // In a real app we'd use a toast, but alert is fine for now as requested
                      alert('Copied!');
                    } catch {
                      alert('Failed to copy');
                    }
                  };
                  
                  return (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Verification URL</label>
                        <input 
                          type="text" 
                          readOnly
                          value={linkUrl}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          onClick={(e) => e.currentTarget.select()}
                        />
                      </div>
                      
                      {/* Regenerate Link Button */}
                      <button
                        type="button"
                        onClick={handleRegenerateLink}
                        disabled={isRegeneratingLink}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-4 h-4 ${isRegeneratingLink ? 'animate-spin' : ''}`} />
                        {isRegeneratingLink ? 'Generating...' : 'Regenerate Link'}
                      </button>
                      
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                          <Copy className="w-4 h-4" />
                          Copy
                        </button>
                        <a
                          href={linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open
                        </a>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Timeline Card */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-700" />
                Timeline
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-900">{new Date(verification.created_at).toLocaleString()}</span>
                </div>
                {verification.submitted_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Submitted</span>
                    <span className="text-gray-900">{new Date(verification.submitted_at).toLocaleString()}</span>
                  </div>
                )}
                {slaInfo && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">SLA Deadline</span>
                    <span className={slaInfo.isOverdue ? 'text-red-600 font-medium' : 'text-gray-900'}>
                      {slaInfo.deadline.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Reassign Modal */}
      <ReassignModal
        isOpen={showReassignModal}
        onClose={() => setShowReassignModal(false)}
        verifiers={verifiers}
        currentVerifierId={verification.assigned_verifier_id}
        onReassign={handleReassign}
        isReassigning={isReassigning}
      />

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={zoomedImage}
            alt="Zoomed"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      {/* Rejection Modal */}
      {submission && (
        <RejectionModal
          isOpen={showRejectionModal}
          onClose={() => setShowRejectionModal(false)}
          categories={submission.categories}
          rejectionCount={verification?.rejection_count || 0}
          onSubmit={handleReject}
          isSubmitting={isRejecting}
        />
      )}
    </div>
  );
}
