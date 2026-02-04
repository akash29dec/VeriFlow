'use client';

/**
 * Verification Creation Wizard
 * 4-step flow: Category → Policy → Customer → Review
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  Home, Car, CreditCard, ChevronRight, ChevronLeft,
  Loader2, Check, Copy, CheckCircle, User, Phone,
  Mail, MapPin, FileText, AlertCircle, ExternalLink
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type PolicyType = 'home_insurance' | 'auto_insurance' | 'credit_card_kyc';

interface Policy {
  id: string;
  policy_name: string;
  policy_type: string;
  external_policy_id: string | null;
}

interface CustomerDetails {
  name: string;
  phone: string;
  email: string;
  address: string;
}

// ============================================================================
// Category Cards
// ============================================================================

const categories = [
  {
    id: 'home_insurance' as PolicyType,
    name: 'Home Insurance',
    description: 'Property verification with GPS validation',
    icon: Home,
    color: 'blue',
  },
  {
    id: 'auto_insurance' as PolicyType,
    name: 'Auto Insurance',
    description: 'Vehicle and documentation verification',
    icon: Car,
    color: 'green',
  },
  {
    id: 'credit_card' as PolicyType,
    name: 'Banking / KYC',
    description: 'Identity and income verification',
    icon: CreditCard,
    color: 'purple',
  },
];

// ============================================================================
// Main Component
// ============================================================================

export default function CreateVerificationPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  // Wizard state
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<PolicyType | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [customer, setCustomer] = useState<CustomerDetails>({
    name: '',
    phone: '',
    email: '',
    address: '',
  });
  
  // UI state
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [verificationRef, setVerificationRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch policies when category changes
  const fetchPolicies = useCallback(async (policyType: PolicyType) => {
    setIsLoadingPolicies(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: fetchError } = await (supabase as any)
      .from('policies')
      .select('id, policy_name, policy_type, external_policy_id')
      .eq('policy_type', policyType)
      .eq('status', 'active')
      .order('policy_name');

    if (fetchError) {
      console.error('Error fetching policies:', fetchError);
      setError('Failed to load policies');
    } else {
      setPolicies((data as Policy[]) || []);
    }

    setIsLoadingPolicies(false);
  }, [supabase]);

  useEffect(() => {
    if (selectedCategory) {
      fetchPolicies(selectedCategory);
    }
  }, [selectedCategory, fetchPolicies]);

  // Validation
  const isStep2Valid = selectedPolicy !== null;
  const isStep3Valid = customer.name.trim() !== '' && customer.phone.trim() !== '';

  // Handle category selection
  const handleCategorySelect = (category: PolicyType) => {
    setSelectedCategory(category);
    setSelectedPolicy(null);
    setStep(2);
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!selectedPolicy) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/verifications/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId: selectedPolicy.id,
          customer: {
            name: customer.name,
            phone: customer.phone,
            email: customer.email || undefined,
            address: customer.address || undefined,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create verification');
      }

      setGeneratedLink(data.customer_link);
      setVerificationRef(data.verification.verification_ref);
      setStep(5); // Success step

    } catch (err) {
      console.error('Create error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create verification');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy link
  const handleCopyLink = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Copy failed');
    }
  };

  // Render step content
  const renderStep = () => {
    switch (step) {
      // Step 1: Category Selection
      case 1:
        return (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Select Category</h2>
            <p className="text-gray-700 mb-6">Choose the type of verification you want to create</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {categories.map((category) => {
                const Icon = category.icon;
                const colorClasses = {
                  blue: 'bg-blue-50 border-blue-200 hover:border-blue-400',
                  green: 'bg-green-50 border-green-200 hover:border-green-400',
                  purple: 'bg-purple-50 border-purple-200 hover:border-purple-400',
                };
                const iconClasses = {
                  blue: 'bg-blue-100 text-blue-600',
                  green: 'bg-green-100 text-green-600',
                  purple: 'bg-purple-100 text-purple-600',
                };

                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className={`p-6 rounded-2xl border-2 text-left transition-all ${colorClasses[category.color as keyof typeof colorClasses]}`}
                  >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${iconClasses[category.color as keyof typeof iconClasses]}`}>
                      <Icon className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {category.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {category.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );

      // Step 2: Policy Selection
      case 2:
        return (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Select Policy</h2>
            <p className="text-gray-500 mb-6">
              Choose a policy template for {categories.find(c => c.id === selectedCategory)?.name}
            </p>

            {isLoadingPolicies ? (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                <p className="text-gray-500 mt-2">Loading policies...</p>
              </div>
            ) : policies.length === 0 ? (
              <div className="py-12 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <p className="text-gray-600">No policies found for this category.</p>
                <p className="text-sm text-gray-500 mt-1">Please create a policy first or select a different category.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {policies.map((policy) => (
                  <button
                    key={policy.id}
                    onClick={() => setSelectedPolicy(policy)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                      selectedPolicy?.id === policy.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      selectedPolicy?.id === policy.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{policy.policy_name}</p>
                      {policy.external_policy_id && (
                        <p className="text-xs text-gray-500">ID: {policy.external_policy_id}</p>
                      )}
                    </div>
                    {selectedPolicy?.id === policy.id && (
                      <CheckCircle className="w-5 h-5 text-blue-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      // Step 3: Customer Details
      case 3:
        return (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Customer Details</h2>
            <p className="text-gray-500 mb-6">Enter the customer&apos;s information</p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    placeholder="john@example.com"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <textarea
                    value={customer.address}
                    onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                    placeholder="123 Main Street, City, State"
                    rows={3}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white placeholder:text-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      // Step 4: Review
      case 4:
        return (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Review & Create</h2>
            <p className="text-gray-500 mb-6">Confirm the details before generating the verification link</p>

            <div className="bg-gray-50 rounded-xl p-6 space-y-4 max-w-lg">
              <div className="flex justify-between">
                <span className="text-gray-500">Category</span>
                <span className="text-gray-900 font-medium">
                  {categories.find(c => c.id === selectedCategory)?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Policy</span>
                <span className="text-gray-900 font-medium">{selectedPolicy?.policy_name}</span>
              </div>
              <hr className="border-gray-200" />
              <div className="flex justify-between">
                <span className="text-gray-500">Customer Name</span>
                <span className="text-gray-900 font-medium">{customer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="text-gray-900 font-medium">{customer.phone}</span>
              </div>
              {customer.email && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span className="text-gray-900 font-medium">{customer.email}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex justify-between items-start">
                  <span className="text-gray-500">Address</span>
                  <span className="text-gray-900 font-medium text-right max-w-[200px]">{customer.address}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
        );

      // Step 5: Success
      case 5:
        return (
          <div className="text-center max-w-lg mx-auto">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Created!</h2>
            <p className="text-gray-500 mb-6">
              Share this link with your customer to complete their verification
            </p>

            <div className="bg-gray-100 rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-500 mb-1">Reference Number</p>
              <p className="font-mono font-bold text-blue-600">{verificationRef}</p>
            </div>

            <div className="bg-gray-50 border rounded-xl p-4 mb-6">
              <p className="text-xs text-gray-500 mb-2">Customer Link</p>
              <p className="font-mono text-sm text-gray-800 break-all mb-3">{generatedLink}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </button>
                <a
                  href={generatedLink || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-5 h-5 text-gray-600" />
                </a>
              </div>
            </div>

            <button
              onClick={() => router.push('/admin/dashboard')}
              className="text-blue-600 hover:underline"
            >
              ← Back to Dashboard
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // Progress steps
  const steps = ['Category', 'Policy', 'Customer', 'Review'];

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/admin/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create Verification</h1>
      </div>

      {/* Progress Bar */}
      {step < 5 && (
        <div className="mb-8">
          <div className="flex items-center justify-between max-w-2xl">
            {steps.map((label, idx) => {
              const stepNum = idx + 1;
              const isActive = step === stepNum;
              const isComplete = step > stepNum;

              return (
                <div key={label} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                      isComplete
                        ? 'bg-green-500 text-white'
                        : isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}>
                      {isComplete ? <Check className="w-5 h-5" /> : stepNum}
                    </div>
                    <span className={`text-xs mt-1 ${isActive ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
                      {label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`w-16 sm:w-24 h-1 mx-2 ${
                      step > stepNum ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 lg:p-8">
        {renderStep()}
      </div>

      {/* Navigation Buttons */}
      {step > 1 && step < 5 && (
        <div className="mt-6 flex justify-between max-w-2xl">
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 2 ? !isStep2Valid : step === 3 ? !isStep3Valid : false}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl flex items-center gap-2 transition-colors"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-xl flex items-center gap-2 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Create Verification
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
