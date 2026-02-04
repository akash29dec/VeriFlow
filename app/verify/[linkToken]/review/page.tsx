'use client';

/**
 * Review Page
 * Shows submission summary and handles final submission
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useVerification } from '@/contexts/VerificationContext';
import { 
  Shield, ChevronLeft, Loader2, CheckCircle, Camera, FileText,
  AlertCircle, Check, X
} from 'lucide-react';

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { state, dispatch, clearDraft } = useVerification();
  
  const linkToken = params.linkToken as string;

  const [confirmAccurate, setConfirmAccurate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Count totals
  const totalPhotos = state.categories.reduce((sum, cat) => sum + cat.photos.length, 0);
  const totalAnswers = state.categories.reduce((sum, cat) => sum + cat.answers.length, 0);

  // Check if all required fields are complete
  const checkCompleteness = (): { complete: boolean; missing: string[] } => {
    const missing: string[] = [];

    // Check identity
    if (!state.identity.verified) {
      missing.push('Identity verification');
    }

    // Check each category
    state.template.forEach((category, idx) => {
      const categoryData = state.categories[idx];
      
      // Check required photos
      category.photo_fields?.forEach((field) => {
        if (field.required && !categoryData?.photos.find(p => p.field_id === field.field_id)) {
          missing.push(`${category.category_name}: ${field.label}`);
        }
      });

      // Check required questions
      category.questions?.forEach((question) => {
        if (question.required) {
          const answer = categoryData?.answers.find(a => a.question_id === question.question_id);
          if (!answer || (typeof answer.value === 'string' && !answer.value.trim())) {
            missing.push(`${category.category_name}: ${question.text}`);
          }
        }
      });
    });

    return { complete: missing.length === 0, missing };
  };

  const completeness = checkCompleteness();

  // Handle submission
  const handleSubmit = async () => {
    if (!confirmAccurate) {
      setError('Please confirm that all information is accurate');
      return;
    }

    if (!completeness.complete) {
      setError('Please complete all required fields before submitting');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Build submission data
      const submissionData = {
        identity: state.identity,
        categories: state.categories.map((cat, idx) => ({
          category_id: cat.category_id,
          category_name: state.template[idx]?.category_name,
          photos: cat.photos,
          answers: cat.answers,
        })),
        consent: {
          given: true,
          timestamp: new Date().toISOString(),
        },
      };

      // Submit to API
      const response = await fetch(`/api/verify/${linkToken}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Submission failed');
      }

      // Success!
      dispatch({ type: 'SET_STEP', payload: 'submitted' });
      dispatch({ type: 'SET_CONSENT', payload: { given: true, timestamp: new Date().toISOString() } });
      clearDraft();
      setSubmitted(true);

    } catch (err) {
      console.error('Submit error:', err);
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <header className="bg-white border-b px-4 py-4">
          <div className="max-w-md mx-auto flex items-center justify-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            <span className="font-bold text-lg text-gray-900">VeriFlow</span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Verification Submitted!
              </h1>
              
              <p className="text-gray-600 mb-6">
                Thank you for completing your verification. Our team will review your submission and get back to you shortly.
              </p>

              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <p className="text-sm text-gray-500">Reference Number</p>
                <p className="text-lg font-bold text-gray-900">
                  {state.verification?.verification_ref}
                </p>
              </div>

              <p className="text-sm text-gray-500">
                You will receive an SMS notification once your verification is reviewed.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push(`/verify/${linkToken}/form`)}
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
            <span>Step 5 of 5</span>
            <span>Review & Submit</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 pb-32">
        <div className="max-w-md mx-auto space-y-4">
          {/* Summary Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-4">
              Review Your Submission
            </h1>

            {/* Status Items */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-700">
                  Identity Verified ({state.identity.type?.toUpperCase()})
                </span>
              </div>

              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                <Camera className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-700">
                  {totalPhotos} photos uploaded
                </span>
              </div>

              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                <FileText className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-700">
                  {totalAnswers} questions answered
                </span>
              </div>
            </div>

            {/* Category Summary */}
            <div className="border-t pt-4">
              <h3 className="font-medium text-gray-900 mb-3">Summary by Category</h3>
              <ul className="space-y-2">
                {state.template.map((category, idx) => {
                  const categoryData = state.categories[idx];
                  const photoCount = categoryData?.photos.length || 0;
                  const answerCount = categoryData?.answers.length || 0;

                  return (
                    <li 
                      key={category.category_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-600">{category.category_name}</span>
                      <span className="text-gray-900 font-medium">
                        {photoCount > 0 && `${photoCount} photo${photoCount > 1 ? 's' : ''}`}
                        {photoCount > 0 && answerCount > 0 && ' + '}
                        {answerCount > 0 && `${answerCount} answer${answerCount > 1 ? 's' : ''}`}
                        {photoCount === 0 && answerCount === 0 && '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Missing Items Warning */}
          {!completeness.complete && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 mb-2">Missing Required Fields</p>
                  <ul className="space-y-1">
                    {completeness.missing.slice(0, 5).map((item, idx) => (
                      <li key={idx} className="text-sm text-amber-700 flex items-center gap-1">
                        <X className="w-3 h-3" /> {item}
                      </li>
                    ))}
                    {completeness.missing.length > 5 && (
                      <li className="text-sm text-amber-700">
                        ... and {completeness.missing.length - 5} more
                      </li>
                    )}
                  </ul>
                  <button
                    onClick={() => router.push(`/verify/${linkToken}/form`)}
                    className="mt-3 text-sm font-medium text-amber-800 hover:underline"
                  >
                    Go back to complete →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation Checkbox */}
          <div className="bg-white rounded-xl shadow p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmAccurate}
                onChange={(e) => setConfirmAccurate(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                I confirm that all information provided is accurate and complete to the best of my knowledge.
              </span>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-md mx-auto flex gap-3">
          <button
            onClick={() => router.push(`/verify/${linkToken}/form`)}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-4 px-6 rounded-xl transition-colors"
          >
            Edit Form
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !confirmAccurate || !completeness.complete}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Submit
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
