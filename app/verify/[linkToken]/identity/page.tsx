'use client';

/**
 * Identity Verification Page
 * Handles ID document upload (Aadhaar/PAN/etc)
 */

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useVerification } from '@/contexts/VerificationContext';
import { createBrowserClient } from '@/lib/supabase/client';
import { 
  Shield, ChevronRight, ChevronLeft, Loader2, 
  Upload, Camera, X, Check, AlertCircle
} from 'lucide-react';
import CameraCaptureModal from '@/components/ui/CameraCaptureModal';

// ============================================================================
// Types
// ============================================================================

type IdType = 'aadhaar' | 'pan' | 'passport' | 'drivers_license';

interface IdTypeOption {
  value: IdType;
  label: string;
  description: string;
}

// ============================================================================
// Constants
// ============================================================================

const ID_TYPES: IdTypeOption[] = [
  { value: 'aadhaar', label: 'Aadhaar Card', description: '12-digit unique ID' },
  { value: 'pan', label: 'PAN Card', description: '10-character tax ID' },
  { value: 'passport', label: 'Passport', description: 'Travel document' },
  { value: 'drivers_license', label: 'Driving License', description: 'Vehicle license' },
];

// ============================================================================
// Component
// ============================================================================

export default function IdentityPage() {
  const params = useParams();
  const router = useRouter();
  const { state, dispatch, saveDraft } = useVerification();
  
  const linkToken = params.linkToken as string;
  const supabase = createBrowserClient();

  const [selectedType, setSelectedType] = useState<IdType | null>(state.identity.type);
  const [idNumber, setIdNumber] = useState(state.identity.number);
  const [frontImage, setFrontImage] = useState<{ file: File; preview: string } | null>(null);
  const [backImage, setBackImage] = useState<{ file: File; preview: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeCameraSide, setActiveCameraSide] = useState<'front' | 'back' | null>(null);

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // CRITICAL: RENDER-TIME BLOCK FOR REVISION MODE
  // ============================================================================
  const isRevisionMode = state.verification?.status === 'needs_revision';
  
  // IMMEDIATE redirect for revision mode
  useEffect(() => {
    if (isRevisionMode) {
      console.log('🛡️ IDENTITY GUARD: Forcing jump to Form (revision mode)');
      router.replace(`/verify/${linkToken}/form`);
    }
  }, [isRevisionMode, linkToken, router]);

  // Check OTP verification (skip in revision mode)
  useEffect(() => {
    if (isRevisionMode) return;
    
    if (!state.otpVerified) {
      router.push(`/verify/${linkToken}/otp`);
    }
  }, [isRevisionMode, state.otpVerified, linkToken, router]);

  // RENDER-TIME BLOCK: Return loading if in revision mode
  if (isRevisionMode) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Redirecting to form...</p>
        </div>
      </div>
    );
  }

  // Process file
  const processFile = (file: File, side: 'front' | 'back') => {
    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    const preview = URL.createObjectURL(file);
    
    if (side === 'front') {
      setFrontImage({ file, preview });
    } else {
      setBackImage({ file, preview });
    }
    
    setError(null);
  };

  // Handle image selection
  const handleImageSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    side: 'front' | 'back'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    processFile(file, side);
    event.target.value = '';
  };
  
  // Handle camera capture
  const handleCameraCapture = (file: File) => {
    if (activeCameraSide) {
      processFile(file, activeCameraSide);
      setActiveCameraSide(null);
    }
  };

  // Remove image
  const removeImage = (side: 'front' | 'back') => {
    if (side === 'front') {
      if (frontImage?.preview) URL.revokeObjectURL(frontImage.preview);
      setFrontImage(null);
    } else {
      if (backImage?.preview) URL.revokeObjectURL(backImage.preview);
      setBackImage(null);
    }
  };

  // Upload to Supabase Storage
  const uploadToStorage = async (file: File, path: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('verification-documents')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('verification-documents')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  // Handle continue
  const handleContinue = async () => {
    if (!selectedType) {
      setError('Please select an ID type');
      return;
    }

    if (!idNumber.trim()) {
      setError('Please enter your ID number');
      return;
    }

    if (!frontImage) {
      setError('Please upload the front of your ID');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const timestamp = Date.now();
      const basePath = `${state.verification?.id || 'unknown'}`;

      // Upload front image
      const frontUrl = await uploadToStorage(
        frontImage.file,
        `${basePath}/id_${selectedType}_front_${timestamp}.jpg`
      );

      // Upload back image if provided
      let backUrl = null;
      if (backImage) {
        backUrl = await uploadToStorage(
          backImage.file,
          `${basePath}/id_${selectedType}_back_${timestamp}.jpg`
        );
      }

      // Update context
      dispatch({
        type: 'SET_IDENTITY',
        payload: {
          type: selectedType,
          number: idNumber,
          front_url: frontUrl,
          back_url: backUrl,
          verified: true,
        },
      });

      saveDraft();
      dispatch({ type: 'SET_STEP', payload: 'form' });
      router.push(`/verify/${linkToken}/form`);

    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload documents. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Validate ID number format
  const validateIdNumber = (type: IdType, value: string): boolean => {
    switch (type) {
      case 'aadhaar':
        return /^\d{12}$/.test(value.replace(/\s/g, ''));
      case 'pan':
        return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value.toUpperCase());
      default:
        return value.length >= 4;
    }
  };

  const isValid = selectedType && 
                  idNumber.trim() && 
                  validateIdNumber(selectedType, idNumber) && 
                  frontImage;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push(`/verify/${linkToken}/otp`)}
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
            <span>Step 2 of 5</span>
            <span>ID Verification</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: '40%' }} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Upload your ID proof
            </h1>
            <p className="text-gray-500 mb-6">
              Select your ID type and upload a clear photo
            </p>

            {/* ID Type Selection */}
            <div className="space-y-2 mb-6">
              <label className="text-sm font-medium text-gray-700">Select ID Type *</label>
              <div className="grid grid-cols-2 gap-3">
                {ID_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      selectedType === type.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-medium text-gray-900 text-sm">{type.label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ID Number Input */}
            {selectedType && (
              <div className="mb-6">
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  {selectedType === 'aadhaar' ? 'Aadhaar Number' :
                   selectedType === 'pan' ? 'PAN Number' :
                   'ID Number'} *
                </label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value.toUpperCase())}
                  placeholder={selectedType === 'aadhaar' ? 'XXXX XXXX XXXX' : 
                               selectedType === 'pan' ? 'ABCDE1234F' : 'Enter ID number'}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder:text-gray-400"
                />
                {idNumber && !validateIdNumber(selectedType, idNumber) && (
                  <p className="text-amber-600 text-xs mt-1">
                    Please enter a valid {selectedType === 'aadhaar' ? '12-digit' : selectedType === 'pan' ? '10-character' : ''} ID
                  </p>
                )}
              </div>
            )}

            {/* Document Upload */}
            {selectedType && (
              <div className="space-y-4 mb-6">
                {/* Front */}
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Front of ID *
                  </label>
                  {frontImage ? (
                    <div className="relative">
                      <img
                        src={frontImage.preview}
                        alt="Front of ID"
                        className="w-full h-40 object-cover rounded-xl border"
                      />
                      <button
                        onClick={() => removeImage('front')}
                        className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-md hover:bg-gray-100"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </button>
                      <div className="absolute bottom-2 left-2 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs flex items-center gap-1">
                        <Check className="w-3 h-3" /> Uploaded
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-4 hover:border-blue-400 transition-colors p-4">
                       <button
                         onClick={() => setActiveCameraSide('front')}
                         className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                       >
                         <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                           <Camera className="w-6 h-6" />
                         </div>
                         <span className="text-sm font-medium text-gray-700">Camera</span>
                       </button>
                       <div className="w-px h-12 bg-gray-200" />
                       <button
                         onClick={() => frontInputRef.current?.click()}
                         className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                       >
                         <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-600">
                           <Upload className="w-6 h-6" />
                         </div>
                         <span className="text-sm font-medium text-gray-700">Upload</span>
                       </button>
                    </div>
                  )}
                  <input
                    ref={frontInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageSelect(e, 'front')}
                    className="hidden"
                  />
                </div>

                {/* Back (optional) */}
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Back of ID <span className="text-gray-400">(optional)</span>
                  </label>
                  {backImage ? (
                    <div className="relative">
                      <img
                        src={backImage.preview}
                        alt="Back of ID"
                        className="w-full h-40 object-cover rounded-xl border"
                      />
                      <button
                        onClick={() => removeImage('back')}
                        className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-md hover:bg-gray-100"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-4 hover:border-blue-400 transition-colors p-4">
                       <button
                         onClick={() => setActiveCameraSide('back')}
                         className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                       >
                         <Camera className="w-5 h-5 text-blue-600" />
                         <span className="text-sm font-medium text-gray-700">Camera</span>
                       </button>
                       <div className="w-px h-8 bg-gray-200" />
                       <button
                         onClick={() => backInputRef.current?.click()}
                         className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                       >
                         <Upload className="w-5 h-5 text-gray-600" />
                         <span className="text-sm font-medium text-gray-700">Upload</span>
                       </button>
                    </div>
                  )}
                  <input
                    ref={backInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageSelect(e, 'back')}
                    className="hidden"
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Continue Button */}
            <button
              onClick={handleContinue}
              disabled={!isValid || isUploading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </main>
      <CameraCaptureModal
        isOpen={!!activeCameraSide}
        onClose={() => setActiveCameraSide(null)}
        onCapture={handleCameraCapture}
      />
    </div>
  );
}
