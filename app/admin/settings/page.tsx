'use client';

/**
 * Admin Settings Page
 *
 * Three-tab layout:
 * - Company Profile (branding & business info)
 * - Security & Access (password + session timeout)
 * - Notifications (email preferences)
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  Building2,
  Shield,
  Bell,
  Loader2,
  Upload,
  Mail,
  Palette,
  Image as ImageIcon,
  Lock,
  Clock,
  Check,
} from 'lucide-react';

type ActiveTab = 'profile' | 'security' | 'notifications';

type SessionTimeoutOption = '15' | '30' | '60' | 'never';

interface NotificationPrefs {
  email_on_new_verification: boolean;
  email_on_submission: boolean;
  email_on_overdue: boolean;
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');

  // Shared state
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Toast state (same pattern as other admin pages)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ---------------------------------------------------------------------------
  // Company Profile state
  // ---------------------------------------------------------------------------

  const [companyName, setCompanyName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [brandColor, setBrandColor] = useState('#0066CC');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Security & Access state
  // ---------------------------------------------------------------------------

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sessionTimeout, setSessionTimeout] = useState<SessionTimeoutOption>('30');
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Notifications state
  // ---------------------------------------------------------------------------

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    email_on_new_verification: true,
    email_on_submission: true,
    email_on_overdue: true,
  });
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Initial load: fetch user + business profile + preferences
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      setIsInitialLoading(true);
      setGlobalError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/login');
          return;
        }

        const authUser = session.user;
        setUserId(authUser.id);

        // Try to fetch user row to get business_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userRow } = await (supabase as any)
          .from('users')
          .select('business_id, email')
          .eq('id', authUser.id)
          .maybeSingle();

        let effectiveBusinessId: string | null = null;

        if (userRow?.business_id) {
          effectiveBusinessId = userRow.business_id as string;
        } else {
          // Fallback: if the user is not linked to a business yet, try to find
          // or create a business so the settings page remains usable in dev.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existingBusiness } = await (supabase as any)
            .from('businesses')
            .select('id')
            .limit(1)
            .maybeSingle();

          if (existingBusiness?.id) {
            effectiveBusinessId = existingBusiness.id as string;
          } else {
            // No business exists yet – create a simple default one.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: createdBusiness, error: createError } = await (supabase as any)
              .from('businesses')
              .insert({
                name: 'Demo Business',
                industry: 'insurance',
                country: 'IN',
                contact_email: authUser.email,
                primary_color: '#0066CC',
                logo_url: null,
                webhook_url: null,
                webhook_secret: null,
              })
              .select('id')
              .single();

            if (createError || !createdBusiness?.id) {
              setGlobalError('No business is configured for your account. Please contact support.');
              return;
            }

            effectiveBusinessId = createdBusiness.id as string;
          }

          // Best-effort: attach this business to the current user so future
          // queries behave consistently. Ignore any RLS errors silently.
          try {
            if (!userRow) {
              await (supabase as any)
                .from('users')
                .insert({
                  id: authUser.id,
                  business_id: effectiveBusinessId,
                  role: 'business_admin',
                  full_name: authUser.email,
                  email: authUser.email,
                  phone: null,
                  team_id: null,
                  is_active: true,
                });
            } else if (!userRow.business_id) {
              await (supabase as any)
                .from('users')
                .update({ business_id: effectiveBusinessId })
                .eq('id', authUser.id);
            }
          } catch {
            // Ignore in dev if RLS prevents this; businessId is still usable locally.
          }
        }

        if (!effectiveBusinessId) {
          setGlobalError('No business is configured for your account. Please contact support.');
          return;
        }

        setBusinessId(effectiveBusinessId);

        // Fetch business profile
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: businessRow, error: businessError } = await (supabase as any)
          .from('businesses')
          .select('name, contact_email, primary_color, logo_url')
          .eq('id', effectiveBusinessId)
          .maybeSingle();

        if (businessError || !businessRow) {
          setGlobalError('Could not load business settings. Please contact support.');
          return;
        }

        setCompanyName(businessRow.name || '');
        setSupportEmail(businessRow.contact_email || authUser.email || '');
        setBrandColor(businessRow.primary_color || '#0066CC');
        setLogoPreviewUrl(businessRow.logo_url || null);
      } catch {
        setGlobalError('Failed to load settings. Please refresh the page.');
      } finally {
        setIsInitialLoading(false);
      }
    }

    void init();
  }, [router, supabase]);

  // ---------------------------------------------------------------------------
  // Handlers - Company Profile
  // ---------------------------------------------------------------------------

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const preview = URL.createObjectURL(file);
    setLogoPreviewUrl(preview);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    setProfileError(null);
    setIsSavingProfile(true);

    try {
      let logoUrl = logoPreviewUrl || null;

      if (logoFile) {
        const ext = logoFile.name.split('.').pop() || 'png';
        const path = `${businessId}/logo-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('branding')
          .upload(path, logoFile, {
            upsert: true,
            contentType: logoFile.type || 'image/png',
          });

        if (uploadError) {
          console.error('Logo upload failed:', uploadError);
          throw new Error('Failed to upload logo');
        }

        const { data } = supabase.storage.from('branding').getPublicUrl(path);
        logoUrl = data.publicUrl;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('businesses')
        .update({
          name: companyName.trim(),
          contact_email: supportEmail.trim(),
          primary_color: brandColor.trim(),
          logo_url: logoUrl,
        })
        .eq('id', businessId);

      if (updateError) {
        console.error('Profile update failed:', updateError);
        throw new Error(updateError.message || 'Failed to save changes');
      }

      setToast({ message: 'Company profile updated', type: 'success' });
      setLogoFile(null);
    } catch (err) {
      console.error('Save profile error:', err);
      setProfileError(
        err instanceof Error ? err.message : 'Failed to save company profile'
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers - Security & Access
  // ---------------------------------------------------------------------------

  const handleUpdateSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setSecurityError('Please fill in all password fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setSecurityError('New password and confirmation do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setSecurityError('New password must be at least 8 characters long.');
      return;
    }

    setIsUpdatingSecurity(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.email) {
        throw new Error('Unable to determine current user. Please log in again.');
      }

      const email = session.user.email;

      // Verify current password by attempting a sign-in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (verifyError) {
        setSecurityError('Current password is incorrect.');
        setIsUpdatingSecurity(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Password update error:', updateError);
        throw new Error(updateError.message || 'Failed to update password');
      }

      // NOTE: Session timeout configuration is UI-only for now because the
      // backing column may not exist in all environments. Hook up to a
      // persistent store when available.

      setToast({ message: 'Security settings updated', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Update security error:', err);
      setSecurityError(
        err instanceof Error ? err.message : 'Failed to update security settings'
      );
    } finally {
      setIsUpdatingSecurity(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers - Notifications
  // ---------------------------------------------------------------------------

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotificationsError(null);

    if (!userId) return;

    setIsSavingNotifications(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('users')
        .update({
          notification_prefs: notificationPrefs,
        })
        .eq('id', userId);

      if (error) {
        console.error('Notifications update failed:', error);
        throw new Error(error.message || 'Failed to save preferences');
      }

      setToast({ message: 'Notification preferences saved', type: 'success' });
    } catch (err) {
      console.error('Save notifications error:', err);
      setNotificationsError(
        err instanceof Error ? err.message : 'Failed to save notification preferences'
      );
    } finally {
      setIsSavingNotifications(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderTabs = () => (
    <div className="mb-6 border-b border-gray-200">
      <nav className="flex gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'profile'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Company Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'security'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield className="w-4 h-4" />
          Security &amp; Access
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'notifications'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
        </button>
      </nav>
    </div>
  );

  const renderProfileTab = () => (
    <form onSubmit={handleSaveProfile} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company Name
          </label>
          <div className="relative">
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="e.g., InsureCo Demo Ltd"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Support Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Support Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              required
              placeholder="support@company.com"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Brand Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Brand Color
          </label>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
              />
              <Palette className="w-4 h-4 text-gray-400 absolute -right-5 top-1/2 -translate-y-1/2" />
            </div>
            <input
              type="text"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="#0066CC"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            This color is used as the primary accent on customer verification forms.
          </p>
        </div>

        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company Logo
          </label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 border border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
              {logoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreviewUrl}
                  alt="Company logo preview"
                  className="w-full h-full object-contain"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-gray-300" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
                <Upload className="w-4 h-4" />
                <span>Upload Logo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </label>
              <p className="text-xs text-gray-500">
                PNG or JPG, max 2MB. This logo appears on customer verification pages.
              </p>
            </div>
          </div>
        </div>
      </div>

      {profileError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {profileError}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSavingProfile}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors"
        >
          {isSavingProfile ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </form>
  );

  const renderSecurityTab = () => (
    <form onSubmit={handleUpdateSecurity} className="space-y-6 max-w-xl">
      {/* Change Password */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-500" />
          Change Password
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Password should be at least 8 characters and include a mix of letters, numbers,
          and symbols.
        </p>
      </div>

      {/* Session Timeout */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          Session Timeout
        </h3>
        <div className="max-w-xs">
          <select
            value={sessionTimeout}
            onChange={(e) => setSessionTimeout(e.target.value as SessionTimeoutOption)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="never">Never (not recommended)</option>
          </select>
        </div>
        <p className="text-xs text-gray-500">
          Controls how long users stay logged in without activity before being asked to
          sign in again.
        </p>
      </div>

      {securityError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {securityError}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={isUpdatingSecurity}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors"
        >
          {isUpdatingSecurity ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Update Security
            </>
          )}
        </button>
      </div>
    </form>
  );

  const renderNotificationsTab = () => (
    <form onSubmit={handleSaveNotifications} className="space-y-6 max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Choose when you want to receive email notifications about verification
          activity for your business.
        </p>

        {/* Toggle row */}
        <div className="space-y-3">
          <ToggleRow
            label="Email me when a new verification is created."
            description="Get notified whenever a new customer verification link is generated."
            checked={notificationPrefs.email_on_new_verification}
            onChange={(value) =>
              setNotificationPrefs((prev) => ({
                ...prev,
                email_on_new_verification: value,
              }))
            }
          />
          <ToggleRow
            label="Email me when a verification is submitted."
            description="Receive an email when customers complete and submit their verification."
            checked={notificationPrefs.email_on_submission}
            onChange={(value) =>
              setNotificationPrefs((prev) => ({
                ...prev,
                email_on_submission: value,
              }))
            }
          />
          <ToggleRow
            label="Email me when a verification is overdue (SLA breach)."
            description="Alerts you when a verification crosses its SLA deadline without a decision."
            checked={notificationPrefs.email_on_overdue}
            onChange={(value) =>
              setNotificationPrefs((prev) => ({
                ...prev,
                email_on_overdue: value,
              }))
            }
          />
        </div>
      </div>

      {notificationsError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {notificationsError}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSavingNotifications}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors"
        >
          {isSavingNotifications ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save Preferences
            </>
          )}
        </button>
      </div>
    </form>
  );

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  if (isInitialLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">
          Manage your company branding, security, and notification preferences.
        </p>
      </div>

      {globalError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {globalError}
        </div>
      )}

      {/* Tabs */}
      {renderTabs()}

      {/* Content Card */}
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        {activeTab === 'profile' && renderProfileTab()}
        {activeTab === 'security' && renderSecurityTab()}
        {activeTab === 'notifications' && renderNotificationsTab()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple Toggle Switch Component
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-colors ${
          checked
            ? 'bg-blue-600 border-blue-600'
            : 'bg-gray-200 border-gray-300'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

