'use client';

/**
 * Verification Review Page
 * Split layout: Customer details on left, Photo gallery on right
 * With approve/reject actions
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { calculateHaversineDistance } from '@/lib/utils/gps';
import { rejectSubmission } from '@/app/admin/verifications/actions';
import type { RejectionFeedbackMap } from '@/app/admin/verifications/actions';
import RejectionModal from '@/components/shared/RejectionModal';
import {
  Shield, ChevronLeft, Loader2, User, Phone, Mail, MapPin,
  FileText, Camera, CheckCircle, XCircle, AlertTriangle,
  Clock, Check, X, ZoomIn, ExternalLink
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
  prefill_data: Record<string, unknown>;
  rejection_count: number;
  rejection_reason: Record<string, Record<string, string>> | null;
  link_token: string;
  link_expiry: string;
  policy: {
    id: string;
    policy_name: string;
    policy_type: string;
    sla_hours: number;
    custom_questions: Array<{ id: string; title: string; [key: string]: unknown }> | null;
  } | null;
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
    gpsStatus = 'valid'; // Has GPS but no property to compare
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
        
        {/* GPS Badge */}
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
// Main Component
// ============================================================================

export default function VerificationReviewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createBrowserClient();

  const verificationId = params.id as string;

  const [verification, setVerification] = useState<Verification | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Force remount on new data

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true);

    // Fetch verification
    const { data: verificationData, error: verificationError } = await supabase
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
        prefill_data,
        rejection_count,
        policy:policies (
          id,
          policy_name,
          policy_type,
          sla_hours,
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

    setVerification(verificationData as unknown as Verification);

    // Fetch submission
    const { data: submissionData } = await supabase
      .from('submissions')
      .select('*')
      .eq('verification_id', verificationId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (submissionData) {
      const typedSubmission = submissionData as unknown as Submission;
      
      // Build lookup map from custom_questions
      const customQuestions = (verificationData as unknown as Verification).policy?.custom_questions;
      const categoryNameMap = new Map<string, string>();
      
      if (customQuestions && Array.isArray(customQuestions)) {
        for (const cat of customQuestions) {
          if (cat && 'id' in cat && 'title' in cat) {
            categoryNameMap.set(cat.id as string, cat.title as string);
          }
        }
      }

      // Enrich submission categories with proper names
      if (typedSubmission.categories) {
        const enrichedCategories = typedSubmission.categories.map(cat => ({
          ...cat,
          category_name: categoryNameMap.get(cat.category_id) 
            || cat.category_name 
            || cat.category_id,  // Fallback
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscriptions for automatic updates
  useEffect(() => {
    if (!verificationId) return;

    // Realtime subscription for verifications (status changes)
    const verificationChannel = supabase
      .channel(`verification-agent-${verificationId}`)
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
          console.log('🔄 Verification Updated!', payload.new);
          fetchData();
          
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-pulse';
          toast.textContent = `Status: ${payload.new.status}`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
        }
      )
      .subscribe();

    // Realtime subscription for submissions (customer submits/updates)
    const submissionChannel = supabase
      .channel(`submissions-agent-${verificationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'submissions',
          filter: `verification_id=eq.${verificationId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: { new: any }) => {
          console.log('🚀 REALTIME: New Submission INSERT detected!', payload.new);
          
          // Show toast immediately
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-pulse';
          toast.textContent = '📄 New submission received! Updating view...';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 4000);
          
          // DIRECTLY update submission state from realtime payload
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
          setRefreshKey(prev => prev + 1);
          
          if (newSubmission.categories?.length > 0 && !activeCategory) {
            setActiveCategory(newSubmission.categories[0].category_id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
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

    // Cleanup
    return () => {
      verificationChannel.unsubscribe();
      submissionChannel.unsubscribe();
    };
  }, [supabase, verificationId, fetchData]);

  // Approve verification
  const handleApprove = async () => {
    if (!verification) return;
    
    if (!confirm('Are you sure you want to approve this verification?')) return;

    setIsProcessing(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('verifications')
        .update({ status: 'approved' })
        .eq('id', verification.id);

      if (error) throw error;

      // Log action
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('audit_logs').insert({
        verification_id: verification.id,
        actor_type: 'verifier',
        action: 'verification_approved',
        details: {},
      });

      alert('Verification approved successfully!');
      router.push('/agent/dashboard');

    } catch (error) {
      console.error('Approve error:', error);
      alert('Failed to approve. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reject verification with feedback
  const handleReject = async (feedbackMap: RejectionFeedbackMap) => {
    if (!verification) return;

    setIsRejecting(true);

    try {
      const result = await rejectSubmission(verification.id, feedbackMap);

      if (!result.success) {
        throw new Error(result.error || 'Failed to reject submission');
      }

      // Log action
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('audit_logs').insert({
        verification_id: verification.id,
        actor_type: 'verifier',
        action: 'verification_rejected',
        details: { feedbackMap, attempt: result.newRejectionCount },
      });

      // Update local state with all rejection data
      setVerification({
        ...verification,
        status: result.isPermanentlyRejected ? 'rejected' : 'needs_revision',
        rejection_count: result.newRejectionCount || (verification.rejection_count || 0) + 1,
        rejection_reason: feedbackMap,
        // Only update link_token if it's a normal rejection (not permanent)
        ...(result.newLinkToken ? { link_token: result.newLinkToken } : {}),
      });

      setShowRejectionModal(false);

    } catch (error) {
      console.error('Reject error:', error);
      alert(error instanceof Error ? error.message : 'Failed to reject. Please try again.');
    } finally {
      setIsRejecting(false);
    }
  };

  // Get current category data
  const currentCategoryData = submission?.categories.find(
    (c) => c.category_id === activeCategory
  );

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
            onClick={() => router.push('/agent/dashboard')}
            className="text-blue-600 hover:underline"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const policyType = verification.policy?.policy_type || 'unknown';
  const requiresGps = policyType === 'home_insurance';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/agent/dashboard')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-lg text-gray-900">
                {verification.verification_ref}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {verification.policy?.policy_name || 'Verification Review'}
            </p>
          </div>
          
          {/* Status Badge */}
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
            verification.status === 'submitted' ? 'bg-purple-100 text-purple-700' :
            verification.status === 'approved' ? 'bg-green-100 text-green-700' :
            verification.status === 'rejected' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {verification.status.replace('_', ' ')}
          </span>
        </div>
      </header>

      {/* Main Content - Split Layout */}
      <main className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row">
          {/* Left Panel - Customer Details (30%) */}
          <div className="lg:w-[350px] lg:min-h-[calc(100vh-73px)] bg-white border-r p-6 space-y-6">
            {/* Customer Info */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer Information
              </h3>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2 text-gray-600">
                  <User className="w-4 h-4 text-gray-400" />
                  {verification.customer_name}
                </p>
                <p className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {verification.customer_phone}
                </p>
                {verification.customer_email && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4 text-gray-400" />
                    {verification.customer_email}
                  </p>
                )}
                {verification.customer_address && (
                  <p className="flex items-start gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    {verification.customer_address}
                  </p>
                )}
              </div>
            </div>

            {/* Policy Details */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Policy Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Policy Name</span>
                  <span className="text-gray-900">{verification.policy?.policy_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="text-gray-900 capitalize">
                    {policyType.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">GPS Required</span>
                  <span className={requiresGps ? 'text-blue-600' : 'text-gray-400'}>
                    {requiresGps ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Verification Checklist</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Identity Verified ({submission?.photo_id_type || 'N/A'})</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>
                    {submission?.categories.reduce((sum, c) => sum + c.photos.length, 0) || 0} photos uploaded
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Consent given</span>
                </div>
              </div>
            </div>

            {/* ID Document */}
            {submission?.photo_id_url && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">ID Document</h3>
                <img
                  src={submission.photo_id_url}
                  alt="ID Document"
                  className="w-full rounded-lg border cursor-pointer"
                  onClick={() => setZoomedImage(submission.photo_id_url)}
                />
                <p className="text-xs text-gray-500 mt-2">
                  {submission.photo_id_type?.toUpperCase()} • {submission.photo_id_number_encrypted?.slice(-4).padStart(12, '•')}
                </p>
              </div>
            )}

            {/* Timestamps */}
            <div className="pt-4 border-t text-xs text-gray-500 space-y-1">
              <p className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Submitted: {verification.submitted_at ? new Date(verification.submitted_at).toLocaleString() : 'N/A'}
              </p>
            </div>
          </div>

          {/* Right Panel - Photo Gallery (70%) */}
          <div className="flex-1 p-6">
            {/* Category Tabs */}
            {submission && submission.categories.length > 0 && (
              <div className="flex gap-2 mb-6 flex-wrap">
                {submission.categories.map((category) => (
                  <button
                    key={category.category_id}
                    onClick={() => setActiveCategory(category.category_id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeCategory === category.category_id
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border hover:bg-gray-50'
                    }`}
                  >
                    {category.category_name}
                    <span className="ml-2 opacity-70">({category.photos.length})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Photos Grid */}
            {currentCategoryData && (
              <div key={`photos-${refreshKey}`} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in duration-300">
                {currentCategoryData.photos.map((photo, idx) => (
                  <PhotoCard
                    key={photo.field_id}
                    photo={photo}
                    label={photo.field_id.replace(/_/g, ' ').replace('photo ', '')}
                    policyType={policyType}
                    propertyCoordinates={verification.property_coordinates}
                    onZoom={setZoomedImage}
                  />
                ))}
              </div>
            )}

            {/* Answers */}
            {currentCategoryData && currentCategoryData.answers.length > 0 && (
              <div className="mt-6 bg-white rounded-lg border p-4">
                <h4 className="font-medium text-gray-900 mb-3">Questions & Answers</h4>
                <div className="space-y-2">
                  {currentCategoryData.answers.map((answer) => (
                    <div key={answer.question_id} className="flex justify-between text-sm">
                      <span className="text-gray-500">
                        {answer.question_id.replace(/_/g, ' ').replace('q ', '')}
                      </span>
                      <span className="text-gray-900 font-medium">
                        {Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!submission && (
              <div className="flex items-center justify-center h-64 bg-white rounded-lg border">
                <p className="text-gray-500">No submission data available</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Action Buttons - Fixed Bottom */}
      {verification.status === 'submitted' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-10">
          <div className="max-w-7xl mx-auto flex justify-end gap-4">
            <div className="relative group">
              <button
                onClick={() => setShowRejectionModal(true)}
                disabled={isProcessing}
                className={`px-6 py-3 font-semibold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  (verification.rejection_count || 0) >= 3 
                    ? 'bg-red-700 hover:bg-red-800 text-white' 
                    : 'bg-red-100 hover:bg-red-200 text-red-700'
                }`}
              >
                <X className="w-5 h-5" />
                {(verification.rejection_count || 0) >= 3 ? 'Final Reject' : 'Reject'}
              </button>
              {(verification.rejection_count || 0) >= 3 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-red-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  ⚠️ This will permanently reject (4/4)
                </div>
              )}
            </div>
            <button
              onClick={handleApprove}
              disabled={isProcessing}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Check className="w-5 h-5" />
              )}
              Approve
            </button>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-lg hover:bg-white/20"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={zoomedImage}
            alt="Zoomed"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
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
