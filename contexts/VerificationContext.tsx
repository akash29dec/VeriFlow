'use client';

/**
 * Verification Context
 * Manages state for the customer verification flow with localStorage persistence
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { TemplateCategory, PropertyCoordinates } from '@/types/database';

// ============================================================================
// Types
// ============================================================================

export interface VerificationData {
  id: string;
  verification_ref: string;
  customer_name: string;
  customer_phone_masked: string;
  link_expiry: string;
  status: string;
  rejection_reason?: Record<string, Record<string, string>>; // Added rejection_reason
}

export interface PhotoData {
  field_id: string;
  url: string;
  file_path: string;
  gps: PropertyCoordinates | null;
  captured_at: string;
}

export interface AnswerData {
  question_id: string;
  value: string | number | string[];
}

export interface CategoryData {
  category_id: string;
  photos: PhotoData[];
  answers: AnswerData[];
  completed: boolean;
}

export interface IdentityData {
  type: 'aadhaar' | 'pan' | 'passport' | 'drivers_license' | null;
  number: string;
  front_url: string | null;
  back_url: string | null;
  verified: boolean;
}

export interface VerificationState {
  linkToken: string | null;
  verification: VerificationData | null;
  template: TemplateCategory[];
  customQuestions: unknown[] | null;
  policyType: string;
  requiresGPS: boolean;
  propertyCoordinates: PropertyCoordinates | null;
  
  // Flow state
  currentStep: 'landing' | 'otp' | 'identity' | 'form' | 'review' | 'submitted';
  currentCategoryIndex: number;
  
  // OTP
  otpVerified: boolean;
  otpVerifiedAt: string | null;
  
  // Identity
  identity: IdentityData;
  
  // Form data
  categories: CategoryData[];
  
  // Consent
  consentGiven: boolean;
  consentTimestamp: string | null;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Actions
// ============================================================================

type VerificationAction =
  | { type: 'SET_VERIFICATION_DATA'; payload: { verification: VerificationData; template: TemplateCategory[]; customQuestions: unknown[] | null; policyType: string; requiresGPS: boolean; propertyCoordinates: PropertyCoordinates | null } }
  | { type: 'SET_LINK_TOKEN'; payload: string }
  | { type: 'SET_STEP'; payload: VerificationState['currentStep'] }
  | { type: 'SET_CATEGORY_INDEX'; payload: number }
  | { type: 'SET_OTP_VERIFIED'; payload: { verified: boolean; verifiedAt: string } }
  | { type: 'SET_IDENTITY'; payload: Partial<IdentityData> }
  | { type: 'ADD_PHOTO'; payload: { categoryId: string; photo: PhotoData } }
  | { type: 'REMOVE_PHOTO'; payload: { categoryId: string; fieldId: string } }
  | { type: 'SET_ANSWER'; payload: { categoryId: string; answer: AnswerData } }
  | { type: 'SET_CATEGORY_COMPLETED'; payload: { categoryId: string; completed: boolean } }
  | { type: 'SET_CONSENT'; payload: { given: boolean; timestamp: string } }
  | { type: 'SET_CONSENT'; payload: { given: boolean; timestamp: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'HYDRATE_SUBMISSION'; payload: CategoryData[] }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESTORE_STATE'; payload: Partial<VerificationState> }
  | { type: 'RESET' };

// ============================================================================
// Initial State
// ============================================================================

const initialState: VerificationState = {
  linkToken: null,
  verification: null,
  template: [],
  customQuestions: null, // ADDED
  policyType: '',
  requiresGPS: false,
  propertyCoordinates: null,
  currentStep: 'landing',
  currentCategoryIndex: 0,
  otpVerified: false,
  otpVerifiedAt: null,
  identity: {
    type: null,
    number: '',
    front_url: null,
    back_url: null,
    verified: false,
  },
  categories: [],
  consentGiven: false,
  consentTimestamp: null,
  isLoading: false,
  error: null,
};

// ============================================================================
// Reducer
// ============================================================================

function verificationReducer(state: VerificationState, action: VerificationAction): VerificationState {
  switch (action.type) {
    case 'SET_VERIFICATION_DATA': {
      const { verification, template, customQuestions, policyType, requiresGPS, propertyCoordinates } = action.payload;
      // Initialize categories from template
      const categories: CategoryData[] = template.map((cat) => ({
        category_id: cat.category_id,
        photos: [],
        answers: [],
        completed: false,
      }));
      
      // =========================================================================
      // CRITICAL FIX: If in revision mode, set correct initial state
      // This ensures we skip OTP/Identity steps from the SOURCE
      // =========================================================================
      const isRevisionMode = verification.status === 'needs_revision';
      
      return {
        ...state,
        verification,
        template,
        customQuestions, // ADDED
        policyType,
        requiresGPS,
        propertyCoordinates,
        categories,
        // AUTO-SET for revision mode: skip OTP and Identity
        ...(isRevisionMode ? {
          currentStep: 'form' as const,
          otpVerified: true,
          otpVerifiedAt: new Date().toISOString(),
          identity: {
            ...state.identity,
            verified: true,
          },
        } : {}),
      };
    }

    case 'SET_LINK_TOKEN':
      return { ...state, linkToken: action.payload };

    case 'SET_STEP':
      return { ...state, currentStep: action.payload };

    case 'SET_CATEGORY_INDEX':
      return { ...state, currentCategoryIndex: action.payload };

    case 'SET_OTP_VERIFIED':
      return {
        ...state,
        otpVerified: action.payload.verified,
        otpVerifiedAt: action.payload.verifiedAt,
      };

    case 'SET_IDENTITY':
      return {
        ...state,
        identity: { ...state.identity, ...action.payload },
      };

    case 'ADD_PHOTO': {
      const { categoryId, photo } = action.payload;
      
      // Check if category exists
      const categoryExists = state.categories.some(cat => cat.category_id === categoryId);
      
      if (!categoryExists) {
        // Auto-create the category and add the photo
        return {
          ...state,
          categories: [
            ...state.categories,
            {
              category_id: categoryId,
              photos: [photo],
              answers: [],
              completed: false,
            },
          ],
        };
      }
      
      return {
        ...state,
        categories: state.categories.map((cat) =>
          cat.category_id === categoryId
            ? {
                ...cat,
                photos: [
                  ...cat.photos.filter((p) => p.field_id !== photo.field_id),
                  photo,
                ],
              }
            : cat
        ),
      };
    }

    case 'REMOVE_PHOTO': {
      const { categoryId, fieldId } = action.payload;
      return {
        ...state,
        categories: state.categories.map((cat) =>
          cat.category_id === categoryId
            ? { ...cat, photos: cat.photos.filter((p) => p.field_id !== fieldId) }
            : cat
        ),
      };
    }

    case 'SET_ANSWER': {
      const { categoryId, answer } = action.payload;
      
      // Check if category exists
      const categoryExists = state.categories.some(cat => cat.category_id === categoryId);
      
      if (!categoryExists) {
        // Auto-create the category and add the answer
        console.log('[Context] Auto-creating category for answer:', categoryId);
        return {
          ...state,
          categories: [
            ...state.categories,
            {
              category_id: categoryId,
              photos: [],
              answers: [answer],
              completed: false,
            },
          ],
        };
      }
      
      return {
        ...state,
        categories: state.categories.map((cat) =>
          cat.category_id === categoryId
            ? {
                ...cat,
                answers: [
                  ...cat.answers.filter((a) => a.question_id !== answer.question_id),
                  answer,
                ],
              }
            : cat
        ),
      };
    }

    case 'SET_CATEGORY_COMPLETED': {
      const { categoryId, completed } = action.payload;
      return {
        ...state,
        categories: state.categories.map((cat) =>
          cat.category_id === categoryId ? { ...cat, completed } : cat
        ),
      };
    }

    case 'SET_CONSENT':
      return {
        ...state,
        consentGiven: action.payload.given,
        consentTimestamp: action.payload.timestamp,
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'HYDRATE_SUBMISSION':
      return {
        ...state,
        categories: action.payload,
      };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'RESTORE_STATE': {
      const payload = action.payload;
      
      // =========================================================================
      // CRITICAL FIX: Never restore to OTP/Identity steps if in revision mode
      // =========================================================================
      const isRevisionMode = state.verification?.status === 'needs_revision';
      let correctedStep = payload.currentStep || state.currentStep;
      
      if (isRevisionMode) {
        // Force correct step for revision mode
        if (correctedStep === 'landing' || correctedStep === 'otp' || correctedStep === 'identity') {
          console.log('[Context] GUARD: Correcting restored step to form for revision mode');
          correctedStep = 'form';
        }
      }
      
      return { 
        ...state, 
        ...payload,
        currentStep: correctedStep,
        // Ensure OTP and Identity are marked verified in revision mode
        ...(isRevisionMode ? {
          otpVerified: true,
          identity: {
            ...state.identity,
            ...(payload.identity || {}),
            verified: true,
          },
        } : {}),
      };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface VerificationContextType {
  state: VerificationState;
  dispatch: React.Dispatch<VerificationAction>;
  saveDraft: () => void;
  clearDraft: () => void;
}

const VerificationContext = createContext<VerificationContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function VerificationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(verificationReducer, initialState);

  const getStorageKey = useCallback(() => {
    return state.linkToken ? `veriflow_draft_${state.linkToken}` : null;
  }, [state.linkToken]);

  // Save draft to localStorage
  const saveDraft = useCallback(() => {
    const key = getStorageKey();
    if (!key) return;

    const draftData = {
      currentStep: state.currentStep,
      currentCategoryIndex: state.currentCategoryIndex,
      otpVerified: state.otpVerified,
      otpVerifiedAt: state.otpVerifiedAt,
      identity: state.identity,
      categories: state.categories,
      consentGiven: state.consentGiven,
      consentTimestamp: state.consentTimestamp,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(key, JSON.stringify(draftData));
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [state, getStorageKey]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    const key = getStorageKey();
    if (!key) return;

    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to clear draft:', error);
    }
  }, [getStorageKey]);

  // Restore draft from localStorage when linkToken is set
  // Use a ref to track if we've already restored to prevent infinite loops
  const hasRestored = React.useRef(false);
  
  useEffect(() => {
    const key = getStorageKey();
    if (!key || !state.verification) return;
    
    // Only restore once per session
    if (hasRestored.current) return;

    try {
      const savedDraft = localStorage.getItem(key);
      if (savedDraft) {
        const draftData = JSON.parse(savedDraft);
        
        console.log('[Context] Restoring draft from localStorage');
        hasRestored.current = true;
        
        dispatch({
          type: 'RESTORE_STATE',
          payload: {
            currentStep: draftData.currentStep || 'landing',
            currentCategoryIndex: draftData.currentCategoryIndex || 0,
            otpVerified: draftData.otpVerified || false,
            otpVerifiedAt: draftData.otpVerifiedAt || null,
            identity: draftData.identity || state.identity,
            categories: draftData.categories || [],
            consentGiven: draftData.consentGiven || false,
            consentTimestamp: draftData.consentTimestamp || null,
          },
        });
      } else {
        hasRestored.current = true;
      }
    } catch (error) {
      console.error('Failed to restore draft:', error);
      hasRestored.current = true;
    }
  }, [getStorageKey, state.verification]); // Removed state.categories.length to prevent infinite loop

  // Auto-save draft when state changes
  useEffect(() => {
    if (state.linkToken && state.verification && state.currentStep !== 'landing') {
      const timeoutId = setTimeout(saveDraft, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [state.categories, state.identity, state.currentCategoryIndex, saveDraft, state.linkToken, state.verification, state.currentStep]);

  return (
    <VerificationContext.Provider value={{ state, dispatch, saveDraft, clearDraft }}>
      {children}
    </VerificationContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useVerification() {
  const context = useContext(VerificationContext);
  if (!context) {
    throw new Error('useVerification must be used within a VerificationProvider');
  }
  return context;
}
