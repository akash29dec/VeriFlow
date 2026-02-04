'use client';

/**
 * Customer Verification Form Page
 * 
 * UPDATED: Now reads categories exclusively from policy.custom_questions
 * (which contains the deep-copied and potentially modified template structure)
 * 
 * Features:
 * - Category-based navigation from policy
 * - Operator-based conditional logic (>, <, =, >=, <=)
 * - Photo upload with GPS validation
 * - Comprehensive validation for required fields
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useVerification, type PhotoData, type AnswerData } from '@/contexts/VerificationContext';
import { createBrowserClient } from '@/lib/supabase/client';
import { PhotoUploader, type PhotoCaptureResult } from '@/components/customer/PhotoUploader';
import { 
  Shield, ChevronRight, ChevronLeft, Loader2, Save,
  CheckCircle, Circle, ClipboardList, AlertTriangle
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

// Photo field from policy
interface PhotoField {
  field_id: string;
  label: string;
  instruction?: string;
  required?: boolean;
  capture_gps?: boolean;
}

// Conditional photo field that can be triggered
interface ConditionalPhotoField {
  field_id: string;
  label: string;
  instruction?: string;
  required?: boolean;
  capture_gps?: boolean;
}

// Operator type for type-safe comparisons
type ConditionalOperator = '>' | '<' | '=' | '>=' | '<=';

// Operator-based conditional (for number and string comparisons)
interface OperatorConditionalField {
  operator: ConditionalOperator;
  value: number | string; // UPDATED: Now supports string for Single Select
  show_fields: ConditionalPhotoField[];
  use_dynamic_count?: boolean; // For dynamic photo count mode
}

// String-based conditional (legacy support)
interface StringConditionalField {
  if_answer: string;
  show_fields: ConditionalPhotoField[];
}

type LocalConditionalField = StringConditionalField | OperatorConditionalField;

// Question from policy category
interface PolicyQuestion {
  id: string;
  question_id: string;
  text: string;
  type: 'text' | 'number' | 'single_select' | 'yes_no';
  options?: string[];
  required: boolean;
  conditional?: LocalConditionalField;
}

// Category from policy (new structure)
interface PolicyCategory {
  id: string;
  title: string;
  order: number;
  photo_fields: PhotoField[];
  questions: PolicyQuestion[];
}

// ============================================================================
// Helper: Evaluate conditional logic with strict type safety
// ============================================================================

function evaluateConditional(
  conditional: LocalConditionalField | undefined,
  answerValue: string | number | string[] | undefined
): boolean {
  if (!conditional) return false;
  if (answerValue === undefined || answerValue === '') return false;

  // Operator-based conditional
  if ('operator' in conditional) {
    const conditionValue = conditional.value;
    
    // Handle array values (multi-select)
    if (Array.isArray(answerValue)) {
      // For equality, check if the array includes the condition value
      if (conditional.operator === '=') {
        return answerValue.includes(String(conditionValue));
      }
      // For numeric operators, can't compare arrays - return false
      return false;
    }
    
    // Handle equality operator with string support
    if (conditional.operator === '=') {
      // String comparison (for Single Select and Yes/No)
      return String(answerValue) === String(conditionValue);
    }
    
    // For other operators (>, <, >=, <=), use numeric comparison
    const numAnswerValue = typeof answerValue === 'number' ? answerValue : parseFloat(String(answerValue));
    const numConditionValue = typeof conditionValue === 'number' ? conditionValue : parseFloat(String(conditionValue));
    
    if (isNaN(numAnswerValue) || isNaN(numConditionValue)) return false;

    switch (conditional.operator) {
      case '>': return numAnswerValue > numConditionValue;
      case '>=': return numAnswerValue >= numConditionValue;
      case '<': return numAnswerValue < numConditionValue;
      case '<=': return numAnswerValue <= numConditionValue;
      default: return false;
    }
  }

  // String-based conditional (legacy support - if_answer field)
  if ('if_answer' in conditional) {
    if (Array.isArray(answerValue)) {
      return answerValue.includes(conditional.if_answer);
    }
    return String(answerValue) === conditional.if_answer;
  }

  return false;
}

// Helper: Get required photo count for dynamic photo mode
function getDynamicPhotoCount(
  conditional: LocalConditionalField | undefined,
  answerValue: string | number | string[] | undefined
): number {
  if (!conditional) return 0;
  if (!('operator' in conditional)) return 0;
  if (!conditional.use_dynamic_count) return 0;
  
  // Get numeric answer value for dynamic count
  const numValue = typeof answerValue === 'number' ? answerValue : parseInt(String(answerValue), 10);
  if (isNaN(numValue) || numValue <= 0) return 0;
  
  // Check if condition is met
  if (!evaluateConditional(conditional, answerValue)) return 0;
  
  return numValue;
}

// ============================================================================
// Component
// ============================================================================

export default function FormPage() {
  const params = useParams();
  const router = useRouter();
  const { state, dispatch, saveDraft } = useVerification();
  
  const linkToken = params.linkToken as string;

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  
  // LOCAL ANSWERS STATE for hydration in correction mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [localAnswers, setLocalAnswers] = useState<Record<string, Record<string, any>>>({});
  const [isHydrated, setIsHydrated] = useState(false);

  const supabase = createBrowserClient();

  // ============================================================================
  // Compute categories using useMemo (prevents render thrashing)
  // This replaces the useEffect + useState pattern that was causing state loss
  // ============================================================================
  
  const allCategories: PolicyCategory[] = useMemo(() => {
    console.log('[FormPage] Computing allCategories via useMemo');
    
    // Check if we have customQuestions from the policy (edited categories)
    const customQuestions = state.customQuestions || [];
    
    if (customQuestions.length > 0) {
      const firstItem = customQuestions[0] as Record<string, unknown>;
      
      if (firstItem && 'title' in firstItem) {
        // New category-based structure - these are the fully edited categories
        console.log('[FormPage] Using category-based custom_questions');
        const categoryData = customQuestions as PolicyCategory[];
        
        // Sort by order and return
        return [...categoryData].sort((a, b) => a.order - b.order);
      } else if (firstItem && 'text' in firstItem) {
        // Legacy flat question structure - wrap in single category
        console.log('[FormPage] Using legacy flat question structure');
        return [{
          id: 'custom_questions',
          title: 'Additional Questions',
          order: 999,
          photo_fields: [],
          questions: customQuestions as unknown as PolicyQuestion[],
        }];
      }
    }
    
    // Fallback: Convert template to PolicyCategory format
    if (state.template && state.template.length > 0) {
      console.log('[FormPage] Using template categories as fallback');
      return state.template.map((cat, idx) => ({
        id: cat.category_id,
        title: cat.category_name,
        order: idx,
        photo_fields: (cat.photo_fields || []).map(pf => ({
          field_id: pf.field_id,
          label: pf.label,
          instruction: pf.instruction,
          required: pf.required ?? false,
          capture_gps: pf.capture_gps ?? false,
        })),
        questions: (cat.questions || []).map(q => ({
          id: q.question_id,
          question_id: q.question_id,
          text: q.text,
          type: q.type as 'text' | 'number' | 'single_select' | 'yes_no',
          options: q.options,
          required: q.required ?? false,
        })),
      }));
    }
    
    console.log('[FormPage] No categories available');
    return [];
  }, [state.customQuestions, state.template]);
  
  // Track loading state based on whether we have categories
  const isLoadingPolicy = allCategories.length === 0 && !state.verification;

  // Current category from policy
  const currentCategory = allCategories[state.currentCategoryIndex];
  
  // Look up category data by ID (not index) - with fallback for new categories
  const currentCategoryData = useMemo(() => {
    if (!currentCategory) return { category_id: '', photos: [], answers: [], completed: false };
    
    const found = state.categories.find(c => c.category_id === currentCategory.id);
    if (found) return found;
    
    // Return empty category data if not yet in state
    return {
      category_id: currentCategory.id,
      photos: [],
      answers: [],
      completed: false,
    };
  }, [currentCategory, state.categories]);

  // Check identity verification
  useEffect(() => {
    if (!state.identity.verified) {
      router.push(`/verify/${linkToken}/identity`);
    }
  }, [state.identity.verified, linkToken, router]);

  // ============================================================================
  // Correction Mode: Hydrate previous submission
  // TASK 1 FIX: Proper data transformation from DB to form state
  // ============================================================================
  
  useEffect(() => {
    async function loadPreviousSubmission() {
      if (state.verification?.status !== 'needs_revision') return;
      if (isHydrated) return; // Only hydrate once
      
      console.log("🔄 Starting Hydration...");
      setIsSaving(true);
      
      try {
        // Use API endpoint to fetch submission (bypasses RLS)
        const response = await fetch(`/api/verify/${linkToken}/submission`);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error("Hydration API Error:", errorData);
          setIsHydrated(true);
          return;
        }
        
        const { submission } = await response.json();
        
        if (!submission || !submission.categories) {
          console.error("Hydration Failed: No submission data");
          setIsHydrated(true);
          return;
        }
        
        // CRITICAL: Transform DB Array -> Form Object State
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const restoredAnswers: Record<string, Record<string, any>> = {};
        
        // Get rejection_reason from verification (for skipping rejected fields)
        const rejectionReason = state.verification?.rejection_reason || {};
        
        // Loop through the 'categories' JSONB column from the submission
        if (submission.categories && Array.isArray(submission.categories)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          submission.categories.forEach((cat: any) => {
            restoredAnswers[cat.category_id] = {};
            
            // 1. Restore Answers (ONLY if not rejected)
            if (Array.isArray(cat.answers)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cat.answers.forEach((a: any) => {
                const isRejected = rejectionReason[cat.category_id]?.[a.question_id];
                if (!isRejected) {
                  restoredAnswers[cat.category_id][a.question_id] = a.value;
                } else {
                  console.log(`⏭️ Skipping rejected answer: ${cat.category_id}/${a.question_id}`);
                }
              });
            }
            
            // 2. Restore Photos (ONLY if not rejected)
            if (Array.isArray(cat.photos)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cat.photos.forEach((p: any) => {
                const isRejected = rejectionReason[cat.category_id]?.[p.field_id];
                if (!isRejected) {
                  restoredAnswers[cat.category_id][p.field_id] = p.url;
                } else {
                  console.log(`⏭️ Skipping rejected photo: ${cat.category_id}/${p.field_id}`);
                }
              });
            }
          });
        }
        
        console.log("✅ Hydrated State:", restoredAnswers);
        setLocalAnswers(restoredAnswers); // This fills the form
        
        // Also hydrate context for photos
        if (submission.categories && Array.isArray(submission.categories)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hydratedCategories = submission.categories.map((cat: any) => ({
            category_id: cat.category_id,
            completed: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            answers: (cat.answers || []).map((a: any) => ({
              question_id: a.question_id,
              value: a.value
            })),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            photos: (cat.photos || []).map((p: any) => ({
              field_id: p.field_id,
              url: p.url,
              file_path: p.url,
              gps: p.gps,
              captured_at: p.captured_at
            }))
          }));
          
          dispatch({
            type: 'HYDRATE_SUBMISSION',
            payload: hydratedCategories
          });
        }
        
        setIsHydrated(true);
      } catch (error) {
        console.error('Error hydrating submission:', error);
        setIsHydrated(true);
      } finally {
        setIsSaving(false);
      }
    }
    
    loadPreviousSubmission();
  }, [state.verification?.status, state.verification?.id, supabase, dispatch, isHydrated]);

  // ============================================================================
  // Photo handling
  // ============================================================================

  const handlePhotoCapture = useCallback(async (fieldId: string, result: PhotoCaptureResult) => {
    setIsUploading(true);



    try {
      const timestamp = Date.now();
      const categoryId = currentCategory?.id || 'unknown';
      const path = `${state.verification?.id || 'unknown'}/${categoryId}_${fieldId}_${timestamp}.jpg`;
      
      const { data, error } = await supabase.storage
        .from('verification-documents')
        .upload(path, result.file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('verification-documents')
        .getPublicUrl(data.path);

      const photoData: PhotoData = {
        field_id: fieldId,
        url: urlData.publicUrl,
        file_path: data.path,
        gps: result.gps,
        captured_at: result.capturedAt,
      };

      dispatch({
        type: 'ADD_PHOTO',
        payload: {
          categoryId: currentCategory?.id || '',
          photo: photoData,
        },
      });

    } catch (error) {
      console.error('Photo upload error:', error);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [supabase, state.verification?.id, currentCategory?.id, dispatch]);

  const handlePhotoRemove = useCallback((fieldId: string) => {
    dispatch({
      type: 'REMOVE_PHOTO',
      payload: {
        categoryId: currentCategory?.id || '',
        fieldId,
      },
    });
  }, [dispatch, currentCategory?.id]);

  // ============================================================================
  // Answer handling
  // ============================================================================

  const handleAnswerChange = useCallback((questionId: string, value: string | number | string[]) => {
    const answer: AnswerData = {
      question_id: questionId,
      value,
    };

    // Update context
    dispatch({
      type: 'SET_ANSWER',
      payload: {
        categoryId: currentCategory?.id || '',
        answer,
      },
    });
    
    // Also update local answers for immediate UI feedback in correction mode
    const catId = currentCategory?.id || '';
    setLocalAnswers(prev => ({
      ...prev,
      [catId]: {
        ...(prev[catId] || {}),
        [questionId]: value,
      },
    }));
  }, [dispatch, currentCategory?.id]);

  // Get answer - checks localAnswers first (for hydrated data), then context
  const getAnswer = useCallback((questionId: string): string | number | string[] | undefined => {
    const catId = currentCategory?.id || '';
    // First check localAnswers (hydrated from correction mode)
    const localValue = localAnswers[catId]?.[questionId];
    if (localValue !== undefined) return localValue;
    // Fall back to context
    return currentCategoryData?.answers.find(a => a.question_id === questionId)?.value;
  }, [currentCategoryData, localAnswers, currentCategory?.id]);

  // Get photo URL - checks localAnswers first, then context
  const getPhotoUrl = useCallback((fieldId: string): string | null => {
    const catId = currentCategory?.id || '';
    // First check localAnswers (hydrated from correction mode)
    const localUrl = localAnswers[catId]?.[fieldId];
    if (localUrl && typeof localUrl === 'string') return localUrl;
    // Fall back to context
    return currentCategoryData?.photos.find(p => p.field_id === fieldId)?.url || null;
  }, [currentCategoryData, localAnswers, currentCategory?.id]);

  // ============================================================================
  // Validation logic
  // ============================================================================

  const getMissingFields = useCallback((category: PolicyCategory, categoryData: typeof currentCategoryData): string[] => {
    const missing: string[] = [];
    if (!categoryData) return ['Category data not loaded'];

    // Check required photos
    for (const field of category.photo_fields) {
      if (field.required && !categoryData.photos.find(p => p.field_id === field.field_id)) {
        missing.push(`Photo: ${field.label}`);
      }
    }

    // Check required questions and their conditional photos
    for (const question of category.questions) {
      if (question.required) {
        const answer = categoryData.answers.find(a => a.question_id === question.question_id);
        if (!answer || (typeof answer.value === 'string' && !answer.value.trim())) {
          missing.push(`Question: ${question.text}`);
        }
      }

      // Check conditional photo fields
      if (question.conditional) {
        const answer = categoryData.answers.find(a => a.question_id === question.question_id);
        
        if (evaluateConditional(question.conditional, answer?.value)) {
          // Check for dynamic photo count mode
          const isDynamicMode = 'operator' in question.conditional && question.conditional.use_dynamic_count;
          const dynamicCount = getDynamicPhotoCount(question.conditional, answer?.value);
          
          if (isDynamicMode && dynamicCount > 0) {
            // Validate dynamic photo fields
            const templateLabel = question.conditional.show_fields[0]?.label || 'Photo #';
            for (let i = 1; i <= dynamicCount; i++) {
              const fieldId = `dynamic_photo_${category.id}_${i}`;
              if (!categoryData.photos.find(p => p.field_id === fieldId)) {
                const label = templateLabel.includes('#') ? templateLabel.replace('#', String(i)) : `${templateLabel} ${i}`;
                missing.push(`Photo: ${label} (required based on your answer)`);
              }
            }
          } else {
            // Validate static conditional photo fields
            for (const field of question.conditional.show_fields) {
              if (field.required && !categoryData.photos.find(p => p.field_id === field.field_id)) {
                missing.push(`Photo: ${field.label} (required based on your answer)`);
              }
            }
          }
        }
      }
    }

    return missing;
  }, []);

  const isCategoryComplete = useCallback((category: PolicyCategory, categoryData: typeof currentCategoryData): boolean => {
    return getMissingFields(category, categoryData).length === 0;
  }, [getMissingFields]);

  const validateCurrentCategory = useCallback((): boolean => {
    if (!currentCategory || !currentCategoryData) return false;
    const missing = getMissingFields(currentCategory, currentCategoryData);
    setValidationErrors(missing);
    if (missing.length > 0) {
      setShowErrors(true);
      return false;
    }
    setShowErrors(false);
    return true;
  }, [currentCategory, currentCategoryData, getMissingFields]);

  // ============================================================================
  // Navigation handlers
  // ============================================================================

  const handleSaveDraft = async () => {
    setIsSaving(true);
    saveDraft();
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsSaving(false);
  };

  const handleNext = () => {
    if (!validateCurrentCategory()) {
      return;
    }

    if (state.currentCategoryIndex < allCategories.length - 1) {
      setShowErrors(false);
      dispatch({ type: 'SET_CATEGORY_INDEX', payload: state.currentCategoryIndex + 1 });
    } else {
      // Go to review
      dispatch({ type: 'SET_STEP', payload: 'review' });
      router.push(`/verify/${linkToken}/review`);
    }
  };

  const handleCategoryClick = (targetIndex: number) => {
    // Allow going back without validation
    if (targetIndex < state.currentCategoryIndex) {
      setShowErrors(false);
      dispatch({ type: 'SET_CATEGORY_INDEX', payload: targetIndex });
      return;
    }

    // Validate all categories between current and target
    for (let i = state.currentCategoryIndex; i < targetIndex; i++) {
      const cat = allCategories[i];
      // Use ID-based lookup for category data (not index-based)
      const catData = state.categories.find(c => c.category_id === cat.id) || {
        category_id: cat.id,
        photos: [],
        answers: [],
        completed: false,
      };
      const missing = getMissingFields(cat, catData);
      if (missing.length > 0) {
        if (i === state.currentCategoryIndex) {
          setValidationErrors(missing);
          setShowErrors(true);
        } else {
          dispatch({ type: 'SET_CATEGORY_INDEX', payload: i });
          setValidationErrors(missing);
          setShowErrors(true);
        }
        return;
      }
    }

    setShowErrors(false);
    dispatch({ type: 'SET_CATEGORY_INDEX', payload: targetIndex });
  };

  const handlePrevious = () => {
    if (state.currentCategoryIndex > 0) {
      setShowErrors(false);
      dispatch({ type: 'SET_CATEGORY_INDEX', payload: state.currentCategoryIndex - 1 });
    }
  };

  // ============================================================================
  // Render helpers
  // ============================================================================

  const renderConditionalPhotos = (conditional: LocalConditionalField, answerValue: string | number | string[] | undefined) => {
    if (!evaluateConditional(conditional, answerValue)) return null;

    // Check for dynamic photo count mode
    const isDynamicMode = 'operator' in conditional && conditional.use_dynamic_count;
    const dynamicCount = getDynamicPhotoCount(conditional, answerValue);
    
    // Generate photo fields for dynamic count
    let photoFieldsToRender: ConditionalPhotoField[] = [];
    
    if (isDynamicMode && dynamicCount > 0) {
      // Get the template label from the first show_field (if any)
      const templateLabel = conditional.show_fields[0]?.label || 'Photo #';
      const templateInstruction = conditional.show_fields[0]?.instruction || 'Upload the required photo';
      const templateRequired = conditional.show_fields[0]?.required ?? true;
      const templateGps = conditional.show_fields[0]?.capture_gps ?? false;
      
      // Generate N photo fields based on answer value
      for (let i = 1; i <= dynamicCount; i++) {
        photoFieldsToRender.push({
          field_id: `dynamic_photo_${currentCategory?.id}_${i}`,
          label: templateLabel.includes('#') ? templateLabel.replace('#', String(i)) : `${templateLabel} ${i}`,
          instruction: templateInstruction,
          required: templateRequired,
          capture_gps: templateGps,
        });
      }
    } else {
      // Use static show_fields
      photoFieldsToRender = conditional.show_fields;
    }
    
    if (photoFieldsToRender.length === 0) return null;

    return (
      <div className="mt-4 pl-4 border-l-2 border-amber-300 bg-amber-50 rounded-r-lg py-3 px-3">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <p className="text-xs font-medium text-amber-700">
            {isDynamicMode 
              ? `Please upload ${dynamicCount} photo${dynamicCount > 1 ? 's' : ''} based on your answer`
              : 'Additional photos required based on your answer'
            }
          </p>
        </div>
        {photoFieldsToRender.map((field: ConditionalPhotoField) => {
          // Check rejection status
          const isCorrectionMode = state.verification?.status === 'needs_revision';
          const rejectionReason = state.verification?.rejection_reason?.[currentCategory?.id || '']?.[field.field_id];
          const isRejected = !!rejectionReason;

          // Render Logic
          if (isCorrectionMode && !isRejected) {
             const photoUrl = getPhotoUrl(field.field_id);
             if (photoUrl) {
               return (
                 <div key={field.field_id} className="mb-4 p-3 bg-white border border-green-200 rounded-lg opacity-50 grayscale pointer-events-none select-none relative">
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-100 px-2 py-0.5 rounded-full border border-green-200 z-10">
                       <CheckCircle className="w-3 h-3 text-green-700" />
                       <span className="text-xs font-bold text-green-800 uppercase tracking-wide">Verified</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{field.label}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl} alt={field.label} className="w-full h-40 object-cover rounded bg-gray-100" />
                 </div>
               );
             }
             // If no photo but validated previously? Should imply verified.
          }

          return (
            <div key={field.field_id} className="mb-4">
              <PhotoUploader
                fieldId={field.field_id}
                label={field.label}
                instruction={field.instruction}
                required={field.required ?? false}
                captureGps={field.capture_gps ?? false}
                policyType={state.policyType}
                propertyCoordinates={state.propertyCoordinates}
                currentPhotoUrl={getPhotoUrl(field.field_id)}
                onPhotoCapture={(result) => handlePhotoCapture(field.field_id, result)}
                onPhotoRemove={() => handlePhotoRemove(field.field_id)}
                disabled={isUploading}
              />
              {isRejected && (
                <div className="mb-2 p-3 bg-red-50 border-2 border-red-500 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-800">⚠️ Correction Required</h4>
                    <p className="text-sm text-red-700 mt-1">{rejectionReason}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderQuestion = (question: PolicyQuestion) => {
    const value = getAnswer(question.question_id);
    
    // Check rejection status
    const isCorrectionMode = state.verification?.status === 'needs_revision';
    const catId = currentCategory?.id || '';
    const qId = question.question_id;
    
    // DEBUG: See why the lookup might fail
    if (isCorrectionMode) {
      console.log(`🔎 LOOKUP: Cat=[${catId}] Q=[${qId}]`);
      console.log(`   --> Rejection Object:`, state.verification?.rejection_reason);
      console.log(`   --> Found Reason:`, state.verification?.rejection_reason?.[catId]?.[qId]);
    }
    
    const rejectionReason = state.verification?.rejection_reason?.[catId]?.[qId];
    const isRejected = !!rejectionReason;

    // Read-Only View for Non-Rejected items in Correction Mode
    if (isCorrectionMode && !isRejected) {
      if (!value) return null; // Or show empty state? Usually answer is provided.
        
      return (
        <div key={question.question_id} className="mb-6 p-4 bg-white border border-gray-200 rounded-xl relative overflow-hidden opacity-50 grayscale pointer-events-none select-none">
          <div className="absolute top-0 right-0 bg-green-100 px-3 py-1 rounded-bl-xl border-l border-b border-green-200 flex items-center gap-1.5 z-10">
             <CheckCircle className="w-3.5 h-3.5 text-green-700" />
             <span className="text-xs font-bold text-green-800 uppercase tracking-wide">Verified</span>
          </div>
          <p className="text-sm font-medium text-gray-500 mb-1">{question.text}</p>
          <p className="text-base font-semibold text-gray-900">{String(value)}</p>
          
          {question.conditional && renderConditionalPhotos(question.conditional, value)}
        </div>
      );
    }

    const renderInput = () => {
      switch (question.type) {
        case 'single_select':
          return (
            <div className="flex flex-wrap gap-2">
              {question.options?.map((option: string) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleAnswerChange(question.question_id, option)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    value === option
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          );
        // ... (other cases need to be restored or assumed covered if I use switch here)
        // Wait, I am replacing the switch statement. I need to handle other cases like text/number.
        case 'text':
        case 'number':
           return (
             <input
               type={question.type === 'number' ? 'number' : 'text'}
               value={value || ''}
               onChange={(e) => handleAnswerChange(question.question_id, question.type === 'number' ? Number(e.target.value) : e.target.value)}
               className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
               placeholder="Enter your answer"
             />
           );
        case 'yes_no':
           return (
             <div className="flex gap-3">
               {['Yes', 'No'].map((option) => (
                 <button
                   key={option}
                   type="button"
                   onClick={() => handleAnswerChange(question.question_id, option)}
                   className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                     value === option
                       ? 'bg-blue-600 text-white border-blue-600'
                       : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                   }`}
                 >
                   {option}
                 </button>
               ))}
             </div>
           );
        default:
          return null;
      }
    };

    return (
      <div key={question.question_id} className={`mb-6 ${isRejected ? 'p-4 bg-red-50 border-2 border-red-500 rounded-xl' : ''}`}>
        {/* Label */}
        <label className="text-sm font-bold text-gray-900 block mb-3">
          {question.text}
          {question.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        
        {/* Input Field */}
        {renderInput()}
        
        {/* Conditional Photos */}
        {question.conditional && renderConditionalPhotos(question.conditional, value)}
        
        {/* Rejection Warning - Now appears BELOW the input */}
        {isRejected && (
          <div className="mt-4 flex items-start gap-2 text-red-700 bg-white/50 p-3 rounded-lg border border-red-200">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-800">⚠️ Correction Required</h4>
              <p className="text-sm text-red-700 mt-1">{rejectionReason}</p>
            </div>
          </div>
        )}
      </div>
    );
  };


  // ============================================================================
  // Loading state
  // ============================================================================

  if (isLoadingPolicy || !currentCategory) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Loading verification form...</p>
        </div>
      </div>
    );
  }

  const progressPercent = 40 + ((state.currentCategoryIndex + 1) / allCategories.length) * 40;
  const isLastCategory = state.currentCategoryIndex === allCategories.length - 1;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={state.currentCategoryIndex === 0}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="font-bold text-gray-900">VeriFlow</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
            ) : (
              <Save className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b sticky top-16 z-10">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>Step 3 of 5</span>
            <span>{state.currentCategoryIndex + 1} of {allCategories.length} sections</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 rounded-full transition-all" 
              style={{ width: `${progressPercent}%` }} 
            />
          </div>
        </div>
      </div>

      {/* Category Navigation Pills */}
      <div className="bg-white border-b overflow-x-auto">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex gap-2 min-w-max">
            {allCategories.map((cat, idx) => {
              // Use ID-based lookup for category data
              const catData = state.categories.find(c => c.category_id === cat.id) || {
                category_id: cat.id,
                photos: [],
                answers: [],
                completed: false,
              };
              const isComplete = isCategoryComplete(cat, catData);
              const isCurrent = idx === state.currentCategoryIndex;

              // Check for rejections in this category
              const categoryRejections = state.verification?.rejection_reason?.[cat.id];
              const hasRejections = categoryRejections && Object.keys(categoryRejections).length > 0;
              const isCorrectionMode = state.verification?.status === 'needs_revision';
              
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => handleCategoryClick(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    isCurrent 
                      ? 'bg-blue-600 text-white' 
                      : hasRejections && isCorrectionMode
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : isComplete 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {hasRejections && isCorrectionMode ? (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  ) : isComplete ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                  <span className="whitespace-nowrap">
                    {cat.title}
                    {hasRejections && isCorrectionMode && (
                      <span className="ml-1.5 text-xs bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full">
                        Fix Needed
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 pb-24">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">
                {currentCategory.title}
              </h2>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              Complete all required fields in this section
            </p>

            {/* Validation Errors */}
            {showErrors && validationErrors.length > 0 && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-semibold text-red-700 mb-2">Please complete the following required fields:</p>
                <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                  {validationErrors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Photo Fields */}
            {/* Photo Fields */}
            {currentCategory.photo_fields.map((field) => {
              // Check rejection status
              const isCorrectionMode = state.verification?.status === 'needs_revision';
              const rejectionReason = state.verification?.rejection_reason?.[currentCategory?.id || '']?.[field.field_id];
              const isRejected = !!rejectionReason;

              // Read-Only View for Non-Rejected items in Correction Mode
              if (isCorrectionMode && !isRejected) {
                 const photoUrl = getPhotoUrl(field.field_id);
                 if (photoUrl) {
                   return (
                     <div key={field.field_id} className="mb-4 p-4 bg-white border border-green-200 rounded-xl relative overflow-hidden opacity-50 grayscale pointer-events-none select-none">
                        <div className="absolute top-0 right-0 bg-green-100 px-3 py-1 rounded-bl-xl border-l border-b border-green-200 flex items-center gap-1.5 z-10">
                           <CheckCircle className="w-3.5 h-3.5 text-green-700" />
                           <span className="text-xs font-bold text-green-800 uppercase tracking-wide">Verified</span>
                        </div>
                        <p className="text-sm font-medium text-gray-500 mb-2">{field.label}</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl} alt={field.label} className="w-full h-48 object-cover rounded-lg bg-gray-100" />
                     </div>
                   );
                 }
              }

              return (
                <div key={field.field_id} className="mb-6">
                  <PhotoUploader
                    fieldId={field.field_id}
                    label={field.label}
                    instruction={field.instruction}
                    required={field.required ?? false}
                    captureGps={field.capture_gps ?? false}
                    policyType={state.policyType}
                    propertyCoordinates={state.propertyCoordinates}
                    currentPhotoUrl={getPhotoUrl(field.field_id)}
                    onPhotoCapture={(result) => handlePhotoCapture(field.field_id, result)}
                    onPhotoRemove={() => handlePhotoRemove(field.field_id)}
                    disabled={isUploading}
                  />
                  {isRejected && (
                    <div className="mb-4 p-4 bg-red-50 border-2 border-red-500 rounded-lg flex items-start gap-3">
                      <div className="bg-red-100 p-2 rounded-full shrink-0">
                         <AlertTriangle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-red-900">⚠️ Correction Required</h4>
                        <p className="text-sm text-red-700 mt-1">{rejectionReason}</p>
                        <p className="text-xs text-red-600 mt-2 font-medium">Please retake this photo according to the instructions.</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Questions */}
            {currentCategory.questions.map((question) => renderQuestion(question))}
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-md mx-auto flex gap-3">
          {state.currentCategoryIndex > 0 && (
            <button
              type="button"
              onClick={handlePrevious}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={isUploading}
            className={`flex-1 font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:bg-gray-300 ${
              isLastCategory 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Uploading...
              </>
            ) : isLastCategory ? (
              <>
                Review & Submit
                <ChevronRight className="w-5 h-5" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
