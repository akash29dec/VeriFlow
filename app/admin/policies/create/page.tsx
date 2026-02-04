'use client';

/**
 * Create Policy Page - Multi-Step Wizard
 * 
 * Step 1: Category Selection (Home Insurance, Auto Insurance, Banking/KYC)
 * Step 2: Template Selection with Preview Modal
 * Step 3: Configuration & Submit
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  ChevronLeft, Loader2, FileText, Check, AlertCircle,
  Home, Car, CreditCard, Eye, X, ChevronRight, Layers
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface TemplateCategory {
  category_id: string;
  category_name: string;
  photo_fields?: { field_id: string; label: string }[];
  questions?: { question_id: string; text: string; type: string }[];
}

interface Template {
  id: string;
  template_name: string;
  policy_type: string;
  business_id: string | null; // null = global, set = business-owned
  categories?: TemplateCategory[];
}

interface CategoryOption {
  id: string;
  label: string;
  policyType: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

// ============================================================================
// Category Options
// ============================================================================

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    id: 'home',
    label: 'Home Insurance',
    policyType: 'home_insurance',
    icon: <Home className="w-8 h-8" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400',
  },
  {
    id: 'auto',
    label: 'Auto Insurance',
    policyType: 'auto_insurance',
    icon: <Car className="w-8 h-8" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200 hover:border-blue-400',
  },
  {
    id: 'banking',
    label: 'Credit Card / KYC',
    policyType: 'credit_card', // FIXED: was 'banking_kyc', now matches database enum
    icon: <CreditCard className="w-8 h-8" />,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 border-violet-200 hover:border-violet-400',
  },
];

// ============================================================================
// Component
// ============================================================================

export default function CreatePolicyPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  
  // Step 1: Category
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Step 2: Template
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const lastFetchedPolicyType = useRef<string | null>(null);
  
  // Step 3: Form
  const [policyName, setPolicyName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [slaHours, setSlaHours] = useState(24);
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // Fetch Templates (Step 2)
  // ============================================================================

  const fetchTemplates = useCallback(async (policyType: string) => {
    setIsLoadingTemplates(true);
    setError(null);
    setTemplates([]); // Clear previous templates to avoid duplication

    console.log('[CreatePolicy] Fetching templates for policy_type:', policyType);

    try {
      // 1. Get current user's business_id
      const { data: { session } } = await supabase.auth.getSession();
      let userBusinessId: string | null = null;
      
      if (session) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userData } = await (supabase as any)
          .from('users')
          .select('business_id')
          .eq('id', session.user.id)
          .single();
        userBusinessId = userData?.business_id || null;
      }

      console.log('[CreatePolicy] User business_id:', userBusinessId);

      // 2. Fetch ALL active templates (RLS handles visibility)
      // RLS ensures: business_id IS NULL (global) OR business_id = user's business
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fetchError } = await (supabase as any)
        .from('templates')
        .select('id, template_name, policy_type, business_id, categories')
        .eq('is_active', true)
        .order('template_name');

      console.log('[CreatePolicy] Templates result:', { data, error: fetchError });

      if (fetchError) {
        console.error('Error fetching templates:', fetchError);
        setError('Failed to load templates');
      } else {
        // 3. Filter by policy type
        const filteredByType = (data || []).filter(
          (t: Template) => t.policy_type === policyType
        );

        // 4. Deduplicate by ID (prevents duplicates from Strict Mode re-renders)
        const uniqueTemplates: Template[] = Array.from(
          new Map(filteredByType.map((t: Template) => [t.id, t])).values()
        ) as Template[];

        // 5. Sort: Custom templates (user's business) first, then Global
        const sorted = uniqueTemplates.sort((a, b) => {
          // Custom = has business_id that matches user's business
          const aIsCustom = Boolean(a.business_id && a.business_id === userBusinessId);
          const bIsCustom = Boolean(b.business_id && b.business_id === userBusinessId);
          
          // Custom templates first
          if (aIsCustom && !bIsCustom) return -1;
          if (!aIsCustom && bIsCustom) return 1;
          
          // Then sort by name
          return a.template_name.localeCompare(b.template_name);
        });

        console.log('[CreatePolicy] Deduplicated & sorted templates:', sorted.length);
        setTemplates(sorted);
      }
    } catch (err) {
      console.error('Fetch templates error:', err);
      setError('Failed to load templates');
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [supabase]);

  // Fetch templates when category is selected
  useEffect(() => {
    if (selectedCategory && currentStep === 2) {
      const category = CATEGORY_OPTIONS.find(c => c.id === selectedCategory);
      if (category) {
        // Prevent duplicate fetches for the same policy type
        if (lastFetchedPolicyType.current !== category.policyType) {
          lastFetchedPolicyType.current = category.policyType;
          fetchTemplates(category.policyType);
        }
      }
    }
  }, [selectedCategory, currentStep, fetchTemplates]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleCategorySelect = (categoryId: string) => {
    // Reset ref to allow fresh fetch when category changes
    lastFetchedPolicyType.current = null;
    setSelectedCategory(categoryId);
    setSelectedTemplate(null);
    setCurrentStep(2);
  };

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setCurrentStep(3);
  };

  const handleBack = () => {
    if (currentStep === 3) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(1);
      setSelectedCategory(null);
      setTemplates([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTemplate || !policyName.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Call API endpoint (uses service role to bypass RLS)
      const response = await fetch('/api/policies/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          policy_name: policyName.trim(),
          external_policy_id: externalId.trim() || undefined,
          policy_type: selectedTemplate.policy_type,
          template_id: selectedTemplate.id,
          sla_hours: slaHours,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Policy creation failed:', data);
        throw new Error(data.error || 'Failed to create policy');
      }

      console.log('Policy created successfully:', data.policy);

      // Success - redirect to policy editor to customize
      router.push(`/admin/policies/${data.policy.id}`);

    } catch (err) {
      console.error('Create policy error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // Step Indicator Component
  // ============================================================================

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map((step) => (
        <div key={step} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
            currentStep >= step 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 text-gray-500'
          }`}>
            {currentStep > step ? <Check className="w-4 h-4" /> : step}
          </div>
          {step < 3 && (
            <div className={`w-12 h-1 mx-1 rounded ${
              currentStep > step ? 'bg-blue-600' : 'bg-gray-200'
            }`} />
          )}
        </div>
      ))}
    </div>
  );

  // ============================================================================
  // Preview Modal Component
  // ============================================================================

  const PreviewModal = () => {
    if (!previewTemplate) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setPreviewTemplate(null)}
        />
        
        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{previewTemplate.template_name}</h3>
              <p className="text-sm text-gray-500 capitalize">{previewTemplate.policy_type.replace(/_/g, ' ')}</p>
            </div>
            <button
              onClick={() => setPreviewTemplate(null)}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">

            {previewTemplate.categories && previewTemplate.categories.length > 0 ? (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Categories & Fields</h4>
                {previewTemplate.categories.map((category, idx) => (
                  <div key={category.category_id || idx} className="bg-gray-50 rounded-xl p-4">
                    <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      {category.category_name}
                    </h5>
                    
                    {/* Photo Fields */}
                    {category.photo_fields && category.photo_fields.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">Photo Fields:</p>
                        <div className="flex flex-wrap gap-2">
                          {category.photo_fields.map((pf) => (
                            <span key={pf.field_id} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700">
                              📷 {pf.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Questions */}
                    {category.questions && category.questions.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">Questions:</p>
                        <div className="space-y-1">
                          {category.questions.map((q) => (
                            <div key={q.question_id} className="flex items-start gap-2 text-xs text-gray-700">
                              <span className="text-gray-400">•</span>
                              <span>{q.text}</span>
                              <span className="text-gray-400 capitalize">({q.type.replace(/_/g, ' ')})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No category details available for preview.</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 p-4 border-t bg-gray-50">
            <button
              onClick={() => setPreviewTemplate(null)}
              className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-xl transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                handleTemplateSelect(previewTemplate);
                setPreviewTemplate(null);
              }}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Select This Template
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => currentStep === 1 ? router.push('/admin/policies') : handleBack()}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          {currentStep === 1 ? 'Back to Policies' : 'Back'}
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create Policy</h1>
        <p className="text-gray-500 mt-1">
          {currentStep === 1 && 'Select a category to get started'}
          {currentStep === 2 && 'Choose a template for your policy'}
          {currentStep === 3 && 'Configure your policy details'}
        </p>
      </div>

      {/* Step Indicator */}
      <StepIndicator />

      {/* Error Display */}
      {error && (
        <div className="max-w-2xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Step 1: Category Selection */}
      {currentStep === 1 && (
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategorySelect(category.id)}
                className={`p-8 rounded-2xl border-2 text-center transition-all hover:shadow-lg ${category.bgColor}`}
              >
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm mb-4 ${category.color}`}>
                  {category.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900">{category.label}</h3>
                <p className="text-sm text-gray-500 mt-1">Select to continue</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Template Selection */}
      {currentStep === 2 && (
        <div className="max-w-3xl mx-auto">
          {isLoadingTemplates ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Templates Found</h3>
              <p className="text-gray-500 mb-4">No templates available for this category yet.</p>
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl transition-colors"
              >
                Choose Another Category
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="bg-white rounded-2xl border-2 border-gray-200 hover:border-blue-300 transition-all overflow-hidden"
                >
                  <div className="p-5 flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 text-lg">{template.template_name}</h3>
                        {template.business_id ? (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
                            Custom
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                            Global
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 capitalize">
                        {template.policy_type.replace(/_/g, ' ')}
                      </p>
                      {template.categories && (
                        <p className="text-xs text-gray-400 mt-2">
                          {template.categories.length} {template.categories.length === 1 ? 'category' : 'categories'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => setPreviewTemplate(template)}
                        className="p-3 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                        title="Preview Template"
                      >
                        <Eye className="w-5 h-5 text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleTemplateSelect(template)}
                        className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
                      >
                        Select
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configuration */}
      {currentStep === 3 && selectedTemplate && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border p-6 lg:p-8">
            {/* Selected Template Summary */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6 flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-600 font-medium">Selected Template</p>
                <p className="font-bold text-gray-900">{selectedTemplate.template_name}</p>
              </div>
              <button
                onClick={handleBack}
                className="ml-auto text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Change
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Policy Name */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Policy Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                  placeholder="e.g., Premium Auto Coverage"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
                  autoFocus
                />
              </div>

              {/* External ID */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  External Policy ID
                </label>
                <input
                  type="text"
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                  placeholder="e.g., POL-2024-X"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">Optional. For integration with external systems.</p>
              </div>

              {/* SLA Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  SLA (Hours)
                </label>
                <input
                  type="number"
                  value={slaHours}
                  onChange={(e) => setSlaHours(parseInt(e.target.value) || 24)}
                  min={1}
                  max={168}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">Time limit for verification review (1-168 hours)</p>
              </div>

              {/* Policy Type (Read-only) */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">Policy Type (from template)</p>
                <p className="font-semibold text-gray-900 capitalize">
                  {selectedTemplate.policy_type.replace(/_/g, ' ')}
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => router.push('/admin/policies')}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!policyName.trim() || isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Create Policy
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <PreviewModal />
    </div>
  );
}
