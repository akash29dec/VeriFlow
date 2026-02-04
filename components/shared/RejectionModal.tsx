'use client';

/**
 * Rejection Modal Component
 * Allows verifiers to specify which photos/answers need revision with reasons
 */

import { useState } from 'react';
import { X, AlertTriangle, Camera, FileText, ChevronDown } from 'lucide-react';
import type { RejectionFeedbackMap } from '@/app/admin/verifications/actions';

// ============================================================================
// Types
// ============================================================================

interface CategoryData {
  category_id: string;
  category_name: string;
  photos: Array<{
    field_id: string;
    url: string;
  }>;
  answers: Array<{
    question_id: string;
    value: string | number | string[];
  }>;
}

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryData[];
  rejectionCount: number;
  onSubmit: (feedbackMap: RejectionFeedbackMap) => Promise<void>;
  isSubmitting: boolean;
}

// ============================================================================
// Reason Options
// ============================================================================

const REJECTION_REASONS = [
  'Blurry Image',
  'Too Dark',
  'Incomplete Answer',
  'Irrelevant Photo',
  'Wrong Angle',
  'Missing Required Details',
  'Other',
];

// ============================================================================
// Component
// ============================================================================

export default function RejectionModal({
  isOpen,
  onClose,
  categories,
  rejectionCount,
  onSubmit,
  isSubmitting,
}: RejectionModalProps) {
  // State: { categoryId: { fieldId: reason } }
  const [selectedItems, setSelectedItems] = useState<RejectionFeedbackMap>({});
  const [customReasons, setCustomReasons] = useState<Record<string, string>>({});
  const [showFinalWarning, setShowFinalWarning] = useState(false);

  if (!isOpen) return null;

  // Filter out identity verification category (with null safety)
  const filteredCategories = categories.filter(
    (cat) => {
      const categoryId = (cat.category_id || '').toLowerCase();
      const categoryName = (cat.category_name || '').toLowerCase();
      return !categoryId.includes('identity') &&
             !categoryName.includes('identity') &&
             !categoryName.includes('id verification');
    }
  );

  const handleToggleItem = (categoryId: string, fieldId: string, reason: string) => {
    console.log('🎯 handleToggleItem called:', { categoryId, fieldId, reason });
    
    setSelectedItems((prev) => {
      console.log('📋 Previous state:', JSON.stringify(prev, null, 2));
      
      // IMPORTANT: Deep clone to avoid mutation issues
      const newState: RejectionFeedbackMap = {};
      for (const catKey of Object.keys(prev)) {
        newState[catKey] = { ...prev[catKey] };
      }
      
      if (!newState[categoryId]) {
        newState[categoryId] = {};
      }

      if (newState[categoryId][fieldId]) {
        // Remove if already selected
        console.log('🗑️ Removing item:', { categoryId, fieldId });
        delete newState[categoryId][fieldId];
        if (Object.keys(newState[categoryId]).length === 0) {
          delete newState[categoryId];
        }
      } else {
        // Add with reason
        console.log('➕ Adding item:', { categoryId, fieldId, reason });
        newState[categoryId][fieldId] = reason;
      }

      console.log('📝 New state:', JSON.stringify(newState, null, 2));
      return newState;
    });
  };

  const handleReasonChange = (categoryId: string, fieldId: string, reason: string) => {
    setSelectedItems((prev) => {
      const newState = { ...prev };
      if (!newState[categoryId]) {
        newState[categoryId] = {};
      }
      newState[categoryId][fieldId] = reason === 'Other' 
        ? customReasons[`${categoryId}-${fieldId}`] || 'Other'
        : reason;
      return newState;
    });
  };

  const handleCustomReasonChange = (categoryId: string, fieldId: string, value: string) => {
    const key = `${categoryId}-${fieldId}`;
    setCustomReasons((prev) => ({ ...prev, [key]: value }));
    
    // Update the selected item with the custom reason
    setSelectedItems((prev) => {
      if (prev[categoryId]?.[fieldId]) {
        return {
          ...prev,
          [categoryId]: {
            ...prev[categoryId],
            [fieldId]: value || 'Other',
          },
        };
      }
      return prev;
    });
  };

  const isItemSelected = (categoryId: string, fieldId: string) => {
    return !!selectedItems[categoryId]?.[fieldId];
  };

  const getItemReason = (categoryId: string, fieldId: string) => {
    return selectedItems[categoryId]?.[fieldId] || '';
  };

  const getTotalSelected = () => {
    return Object.values(selectedItems).reduce(
      (sum, cat) => sum + Object.keys(cat).length,
      0
    );
  };

  const handleSubmit = async () => {
    if (getTotalSelected() === 0) {
      alert('Please select at least one item to reject.');
      return;
    }
    
    // If this is the final (4th) rejection, show confirmation first
    if (isFinalRejection && !showFinalWarning) {
      setShowFinalWarning(true);
      return;
    }
    
    await onSubmit(selectedItems);
  };

  // Check if this will be a FINAL permanent rejection (4th time)
  const isFinalRejection = rejectionCount >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              Reject Submission
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select items that need revision and provide reasons
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* FINAL REJECTION WARNING */}
          {showFinalWarning && (
            <div className="bg-red-100 border-2 border-red-500 rounded-xl p-6 text-center mb-6">
              <AlertTriangle className="w-16 h-16 text-red-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-red-800 mb-2">⚠️ FINAL REJECTION WARNING</h3>
              <p className="text-red-700 mb-4">
                This verification has already been rejected <strong>3 times</strong>. 
                If you proceed, the verification will be <strong>permanently rejected</strong>.
              </p>
              <p className="text-red-600 text-sm mb-4">
                The customer will NOT be able to resubmit or make corrections.
                This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setShowFinalWarning(false)}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={() => onSubmit(selectedItems)}
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    '🚫 Permanently Reject'
                  )}
                </button>
              </div>
            </div>
          )}
          
          {/* Final rejection info banner */}
          {isFinalRejection && !showFinalWarning && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-800">⚠️ Final Rejection Warning</h4>
                <p className="text-amber-700 text-sm">
                  This is the 4th rejection. Submitting will <strong>permanently reject</strong> this verification.
                  The customer will not be able to make any more corrections.
                </p>
              </div>
            </div>
          )}
          
          {!showFinalWarning && (
            filteredCategories.map((category) => (
              <div key={category.category_id} className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-4">{category.category_name}</h3>

                {/* Photos */}
                {category.photos.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                      <Camera className="w-4 h-4" />
                      Photos
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {category.photos.map((photo) => {
                        const isSelected = isItemSelected(category.category_id, photo.field_id);
                        const reason = getItemReason(category.category_id, photo.field_id);
                        const key = `${category.category_id}-${photo.field_id}`;

                        return (
                          <div
                            key={photo.field_id}
                            className={`relative rounded-lg border-2 overflow-hidden transition-all ${
                              isSelected
                                ? 'border-red-500 ring-2 ring-red-200'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <img
                              src={photo.url}
                              alt={photo.field_id}
                              className="w-full h-24 object-cover"
                            />
                            <div className="p-2 bg-white">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      handleToggleItem(category.category_id, photo.field_id, '');
                                    } else {
                                      handleToggleItem(category.category_id, photo.field_id, REJECTION_REASONS[0]);
                                    }
                                  }}
                                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                />
                                <span className="text-xs font-medium text-gray-700">Reject</span>
                              </label>
                              
                              {isSelected && (
                                <div className="mt-2 space-y-2">
                                  <div className="relative">
                                    <select
                                      value={REJECTION_REASONS.includes(reason) ? reason : 'Other'}
                                      onChange={(e) => handleReasonChange(category.category_id, photo.field_id, e.target.value)}
                                      className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md pr-8 focus:outline-none focus:ring-1 focus:ring-red-500"
                                    >
                                      {REJECTION_REASONS.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                  </div>
                                  
                                  {(!REJECTION_REASONS.includes(reason) || reason === 'Other') && (
                                    <input
                                      type="text"
                                      placeholder="Specify reason..."
                                      value={customReasons[key] || ''}
                                      onChange={(e) => handleCustomReasonChange(category.category_id, photo.field_id, e.target.value)}
                                      className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Answers */}
                {category.answers.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Answers
                    </h4>
                    <div className="space-y-2">
                      {category.answers.map((answer) => {
                        const isSelected = isItemSelected(category.category_id, answer.question_id);
                        const reason = getItemReason(category.category_id, answer.question_id);
                        const key = `${category.category_id}-${answer.question_id}`;
                        const displayValue = Array.isArray(answer.value)
                          ? answer.value.join(', ')
                          : String(answer.value);

                        return (
                          <div
                            key={answer.question_id}
                            className={`p-3 rounded-lg border-2 transition-all ${
                              isSelected
                                ? 'border-red-500 bg-red-50'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500">{answer.question_id}</p>
                                <p className="text-sm text-gray-900 font-medium truncate">{displayValue}</p>
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      handleToggleItem(category.category_id, answer.question_id, '');
                                    } else {
                                      handleToggleItem(category.category_id, answer.question_id, REJECTION_REASONS[2]); // Incomplete Answer
                                    }
                                  }}
                                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                />
                                <span className="text-xs font-medium text-gray-700">Reject</span>
                              </label>
                            </div>

                            {isSelected && (
                              <div className="mt-3 flex gap-2">
                                <div className="relative flex-1">
                                  <select
                                    value={REJECTION_REASONS.includes(reason) ? reason : 'Other'}
                                    onChange={(e) => handleReasonChange(category.category_id, answer.question_id, e.target.value)}
                                    className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md pr-8 focus:outline-none focus:ring-1 focus:ring-red-500"
                                  >
                                    {REJECTION_REASONS.map((r) => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                </div>
                                
                                {(!REJECTION_REASONS.includes(reason) || reason === 'Other') && (
                                  <input
                                    type="text"
                                    placeholder="Specify..."
                                    value={customReasons[key] || ''}
                                    onChange={(e) => handleCustomReasonChange(category.category_id, answer.question_id, e.target.value)}
                                    className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {category.photos.length === 0 && category.answers.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No items in this category</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-500">Rejection Attempt:</span>
              <span className={`ml-2 font-bold ${rejectionCount >= 2 ? 'text-red-600' : 'text-gray-900'}`}>
                {rejectionCount} / 3
              </span>
              {getTotalSelected() > 0 && (
                <span className="ml-4 text-amber-600">
                  {getTotalSelected()} item(s) selected
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || getTotalSelected() === 0 || showFinalWarning}
                className={`px-6 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                  isFinalRejection ? 'bg-red-700 hover:bg-red-800' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : isFinalRejection ? (
                  '🚫 Final Reject'
                ) : (
                  'Send Feedback'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
