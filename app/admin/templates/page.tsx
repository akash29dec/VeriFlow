'use client';

/**
 * Template Manager Page
 * 
 * Lists all templates created by the current business.
 * Allows creating, editing, renaming, and deleting custom templates.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  Loader2, FileText, Trash2, Edit2, Check, X, AlertCircle,
  Plus, ChevronLeft, Layers, Calendar, ChevronRight, Home, Car, CreditCard
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Template {
  id: string;
  template_name: string;
  policy_type: string;
  business_id: string | null;
  is_active: boolean;
  created_at: string;
  categories?: {
    id: string;
    title: string;
    questions?: unknown[];
  }[];
}

// Policy type options for dropdown
const POLICY_TYPE_OPTIONS = [
  { value: 'home_insurance', label: 'Home Insurance', icon: Home },
  { value: 'auto_insurance', label: 'Auto Insurance', icon: Car },
  { value: 'credit_card', label: 'Credit Card / KYC', icon: CreditCard },
];

// ============================================================================
// Component
// ============================================================================

export default function TemplateManagerPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  // State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userBusinessId, setUserBusinessId] = useState<string | null>(null);
  
  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newPolicyType, setNewPolicyType] = useState('home_insurance');
  const [isCreating, setIsCreating] = useState(false);
  
  // Edit name state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ============================================================================
  // Fetch Templates (only business-owned, not global)
  // ============================================================================

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get current user's business_id
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: userData, error: userError } = await (supabase as any)
        .from('users')
        .select('business_id')
        .eq('id', session.user.id)
        .single();

      if (userError || !userData?.business_id) {
        throw new Error('Could not determine your business');
      }

      setUserBusinessId(userData.business_id);

      // Fetch templates where business_id matches (custom templates only)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fetchError } = await (supabase as any)
        .from('templates')
        .select('id, template_name, policy_type, business_id, is_active, created_at, categories')
        .eq('business_id', userData.business_id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching templates:', fetchError);
        throw new Error('Failed to load templates');
      }

      setTemplates((data as Template[]) || []);
    } catch (err) {
      console.error('Fetch templates error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // ============================================================================
  // Create Template
  // ============================================================================

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !userBusinessId) return;

    setIsCreating(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: insertError } = await (supabase as any)
        .from('templates')
        .insert({
          template_name: newTemplateName.trim(),
          policy_type: newPolicyType,
          categories: [], // Initialize as empty
          business_id: userBusinessId,
          is_active: true,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        throw new Error(insertError.message || 'Failed to create template');
      }

      // Redirect to template editor
      router.push(`/admin/templates/${data.id}`);
    } catch (err) {
      console.error('Create template error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create template');
      setIsCreating(false);
    }
  };

  // ============================================================================
  // Edit Template Name (inline)
  // ============================================================================

  const startEditing = (e: React.MouseEvent, template: Template) => {
    e.stopPropagation(); // Prevent card click
    setEditingId(template.id);
    setEditingName(template.template_name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveTemplateName = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!editingId || !editingName.trim()) return;

    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('templates')
        .update({ template_name: editingName.trim() })
        .eq('id', editingId);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error('Failed to update template name');
      }

      // Update local state
      setTemplates(prev => prev.map(t => 
        t.id === editingId ? { ...t, template_name: editingName.trim() } : t
      ));
      
      cancelEditing();
    } catch (err) {
      console.error('Save template name error:', err);
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================================
  // Delete Template
  // ============================================================================

  const confirmDelete = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation(); // Prevent card click
    setDeletingId(templateId);
  };

  const cancelDelete = () => {
    setDeletingId(null);
  };

  const deleteTemplate = async () => {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any)
        .from('templates')
        .delete()
        .eq('id', deletingId);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw new Error('Failed to delete template');
      }

      // Remove from local state
      setTemplates(prev => prev.filter(t => t.id !== deletingId));
      setDeletingId(null);
    } catch (err) {
      console.error('Delete template error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  // ============================================================================
  // Navigate to Editor
  // ============================================================================

  const openTemplateEditor = (templateId: string) => {
    if (editingId) return; // Don't navigate while editing name
    router.push(`/admin/templates/${templateId}`);
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/admin')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Templates</h1>
            <p className="text-gray-500 mt-1">
              Create and manage reusable templates for your policies
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create New Template
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Custom Templates Yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Create a new template to define reusable categories, questions, and photo requirements.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create New Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              onClick={() => openTemplateEditor(template.id)}
              className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all overflow-hidden cursor-pointer group"
            >
              <div className="p-5">
                {/* Template Icon & Name */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === template.id ? (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTemplateName();
                            if (e.key === 'Escape') cancelEditing();
                          }}
                        />
                        <button
                          onClick={(e) => saveTemplateName(e)}
                          disabled={isSaving || !editingName.trim()}
                          className="p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors">{template.template_name}</h3>
                        <p className="text-sm text-gray-500 capitalize">
                          {template.policy_type.replace(/_/g, ' ')}
                        </p>
                      </>
                    )}
                  </div>
                  {/* Arrow indicator */}
                  {editingId !== template.id && (
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" />
                    {template.categories?.length || 0} categories
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(template.created_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Actions */}
                {editingId !== template.id && (
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={(e) => openTemplateEditor(template.id)}
                      className="flex-1 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit Template
                    </button>
                    <button
                      onClick={(e) => startEditing(e, template)}
                      className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      onClick={(e) => confirmDelete(e, template.id)}
                      className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isCreating && setShowCreateModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Plus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Create New Template</h3>
                  <p className="text-sm text-gray-500">Start with an empty template</p>
                </div>
              </div>
              <button
                onClick={() => !isCreating && setShowCreateModal(false)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                disabled={isCreating}
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Template Name */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Premium Home Insurance"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
                  autoFocus
                  disabled={isCreating}
                />
              </div>

              {/* Policy Type */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Policy Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {POLICY_TYPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = newPolicyType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setNewPolicyType(option.value)}
                        disabled={isCreating}
                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50 text-blue-700' 
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{option.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={isCreating}
                className="flex-1 py-2.5 px-4 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim() || isCreating}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Template
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={cancelDelete}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Template?</h3>
              <p className="text-gray-500 mb-6">
                This action cannot be undone. Existing policies using this template will not be affected.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={cancelDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteTemplate}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
