'use client';

/**
 * Template Editor Page
 * 
 * Allows editing template categories, questions, and photo fields.
 * Based on Policy Editor but points to templates table.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  ChevronLeft, Loader2, FileText, Save, Plus, Trash2,
  AlertCircle, Check, ChevronDown, Camera, Folder, FolderPlus,
  Edit2, X, HelpCircle
} from 'lucide-react';

// ============================================================================
// Types (same as Policy Editor)
// ============================================================================

interface PhotoField {
  field_id: string;
  label: string;
  instruction?: string;
  required?: boolean;
  capture_gps?: boolean;
}

interface ConditionalPhotoField {
  field_id: string;
  label: string;
  instruction?: string;
  required?: boolean;
  capture_gps?: boolean;
}

type ConditionalOperator = '>' | '<' | '=' | '>=' | '<=';

interface ConditionalLogic {
  operator: ConditionalOperator;
  value: number | string;
  show_fields: ConditionalPhotoField[];
  use_dynamic_count?: boolean;
}

interface CustomQuestion {
  id: string;
  question_id: string;
  text: string;
  type: 'text' | 'number' | 'single_select' | 'yes_no';
  options?: string[];
  required: boolean;
  conditional?: ConditionalLogic;
}

interface TemplateCategory {
  id: string;
  title: string;
  order: number;
  photo_fields: PhotoField[];
  questions: CustomQuestion[];
}

interface Template {
  id: string;
  template_name: string;
  policy_type: string;
  business_id: string | null;
  is_active: boolean;
  categories: TemplateCategory[] | null;
}

// ============================================================================
// Question Editor Component
// ============================================================================

function QuestionEditor({
  question,
  onChange,
  onRemove,
  isExpanded,
  onToggle,
}: {
  question: CustomQuestion;
  onChange: (updated: CustomQuestion) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const updateField = (field: keyof CustomQuestion, value: unknown) => {
    onChange({ ...question, [field]: value });
  };

  const initializeConditional = (useDynamic: boolean) => {
    const baseLabel = useDynamic ? 'Photo #' : 'Additional Photo';
    
    let defaultValue: string | number;
    if (question.type === 'yes_no') {
      defaultValue = 'Yes';
    } else if (question.type === 'single_select') {
      defaultValue = question.options?.[0] || '';
    } else {
      defaultValue = 0;
    }
    
    const conditional: ConditionalLogic = {
      operator: (question.type === 'yes_no' || question.type === 'single_select') ? '=' : '>',
      value: defaultValue,
      show_fields: useDynamic ? [] : [{
        field_id: `photo_${question.question_id}_${Date.now()}`,
        label: baseLabel,
        instruction: 'Please upload the required photo',
        required: true,
      }],
      use_dynamic_count: useDynamic,
    };
    updateField('conditional', conditional);
  };

  const addStaticPhotoField = () => {
    const conditional = question.conditional || {
      operator: '>' as ConditionalOperator,
      value: 0,
      show_fields: [],
      use_dynamic_count: false,
    };
    conditional.show_fields.push({
      field_id: `photo_${question.question_id}_${Date.now()}`,
      label: `Photo ${conditional.show_fields.length + 1}`,
      instruction: 'Please upload the required photo',
      required: true,
    });
    updateField('conditional', conditional);
  };

  const removeConditionalField = (idx: number) => {
    const fields = question.conditional?.show_fields?.filter((_, i) => i !== idx) || [];
    if (fields.length === 0 && !question.conditional?.use_dynamic_count) {
      updateField('conditional', undefined);
    } else {
      updateField('conditional', { ...question.conditional!, show_fields: fields });
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return 'Text';
      case 'number': return 'Number';
      case 'single_select': return 'Single Select';
      case 'yes_no': return 'Yes / No';
      default: return type;
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Question Header */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
        <HelpCircle className="w-4 h-4 text-blue-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {question.text || 'Untitled Question'}
          </p>
          <p className="text-xs text-gray-500">
            {getTypeLabel(question.type)}
            {question.required && <span className="ml-2 text-red-500">• Required</span>}
            {question.conditional && <span className="ml-2 text-purple-600">• Has Conditions</span>}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded Question Editor */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4 space-y-4 bg-gray-50/50">
          {/* Question Text */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Question Text</label>
            <input
              type="text"
              value={question.text}
              onChange={(e) => updateField('text', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              placeholder="Enter your question..."
            />
          </div>

          {/* Type & Required Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Type</label>
              <select
                value={question.type}
                onChange={(e) => {
                  const newType = e.target.value as CustomQuestion['type'];
                  updateField('type', newType);
                  if (newType !== 'single_select') {
                    updateField('options', undefined);
                  }
                  if (question.conditional) {
                    updateField('conditional', undefined);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="single_select">Single Select</option>
                <option value="yes_no">Yes / No</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Required</label>
              <button
                onClick={() => updateField('required', !question.required)}
                className={`w-full px-3 py-2 rounded-lg font-semibold transition-colors ${
                  question.required 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {question.required ? 'Yes, Required' : 'No, Optional'}
              </button>
            </div>
          </div>

          {/* Options for single_select */}
          {question.type === 'single_select' && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Options</label>
              <div className="space-y-2">
                {(question.options || []).map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const newOptions = [...(question.options || [])];
                        newOptions[idx] = e.target.value;
                        updateField('options', newOptions);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      placeholder={`Option ${idx + 1}`}
                    />
                    <button
                      onClick={() => {
                        const newOptions = (question.options || []).filter((_, i) => i !== idx);
                        updateField('options', newOptions);
                      }}
                      className="p-2 hover:bg-red-100 text-red-500 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => updateField('options', [...(question.options || []), ''])}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4 inline mr-1" /> Add Option
                </button>
              </div>
            </div>
          )}

          {/* Conditional Logic Section */}
          {question.conditional ? (
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-semibold text-purple-900 flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  {question.conditional.use_dynamic_count 
                    ? 'Dynamic Photo Count' 
                    : 'Conditional Photo Fields'}
                </h5>
                <button
                  onClick={() => updateField('conditional', undefined)}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                >
                  Remove Condition
                </button>
              </div>

              {/* Condition Row */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-sm text-purple-800">If answer is</span>
                {(question.type === 'yes_no' || question.type === 'single_select') ? (
                  <select
                    value={String(question.conditional.value)}
                    onChange={(e) => updateField('conditional', { 
                      ...question.conditional!, 
                      value: e.target.value 
                    })}
                    className="px-2 py-1 border border-purple-300 rounded-lg text-sm bg-white text-gray-900"
                  >
                    {question.type === 'yes_no' ? (
                      <>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </>
                    ) : (
                      (question.options || []).map((opt, i) => (
                        <option key={i} value={opt}>{opt || `Option ${i + 1}`}</option>
                      ))
                    )}
                  </select>
                ) : (
                  <>
                    <select
                      value={question.conditional.operator}
                      onChange={(e) => updateField('conditional', { 
                        ...question.conditional!, 
                        operator: e.target.value as ConditionalOperator 
                      })}
                      className="px-2 py-1 border border-purple-300 rounded-lg text-sm bg-white text-gray-900"
                    >
                      <option value=">">greater than</option>
                      <option value=">=">greater or equal</option>
                      <option value="=">equal to</option>
                      <option value="<">less than</option>
                      <option value="<=">less or equal</option>
                    </select>
                    <input
                      type="number"
                      value={question.conditional.value}
                      onChange={(e) => updateField('conditional', { 
                        ...question.conditional!, 
                        value: Number(e.target.value) 
                      })}
                      className="w-16 px-2 py-1 border border-purple-300 rounded-lg text-sm text-gray-900"
                    />
                  </>
                )}
                {question.conditional.use_dynamic_count && (
                  <span className="text-sm text-purple-600 italic">
                    → show that many photo uploads
                  </span>
                )}
              </div>

              {/* Photo Fields List (static) */}
              {!question.conditional.use_dynamic_count && (
                <div className="space-y-2">
                  {question.conditional.show_fields.map((field, idx) => (
                    <div key={field.field_id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-200">
                      <Camera className="w-4 h-4 text-purple-500" />
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => {
                          const newFields = [...question.conditional!.show_fields];
                          newFields[idx] = { ...field, label: e.target.value };
                          updateField('conditional', { ...question.conditional!, show_fields: newFields });
                        }}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                        placeholder="Photo label"
                      />
                      <button
                        onClick={() => removeConditionalField(idx)}
                        className="p-1 hover:bg-red-100 text-red-500 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addStaticPhotoField}
                    className="w-full py-1.5 border border-dashed border-purple-300 rounded-lg text-xs text-purple-600 hover:bg-purple-100"
                  >
                    + Add Photo Field
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-sm text-amber-800 mb-2">
                <strong>Add Conditional Photos:</strong> {question.type === 'number' 
                  ? 'Require photos when customer enters a specific number'
                  : question.type === 'single_select'
                  ? 'Require photos when customer selects a specific option'
                  : 'Require photos when customer answers Yes or No'}
              </p>
              <div className="flex gap-3">
                {question.type === 'number' && (
                  <>
                    <button
                      onClick={() => initializeConditional(false)}
                      className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-semibold hover:bg-amber-200 transition-colors"
                    >
                      + Fixed Photo Count
                    </button>
                    <button
                      onClick={() => initializeConditional(true)}
                      className="px-4 py-2 bg-purple-100 text-purple-800 rounded-lg text-sm font-semibold hover:bg-purple-200 transition-colors"
                    >
                      + Dynamic Photo Count
                    </button>
                  </>
                )}
                {(question.type === 'yes_no' || question.type === 'single_select') && (
                  <button
                    onClick={() => initializeConditional(false)}
                    className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-semibold hover:bg-amber-200 transition-colors"
                  >
                    + Add Conditional Photo
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Category Card Component
// ============================================================================

function CategoryCard({
  category,
  isExpanded,
  onToggle,
  onUpdateTitle,
  onDelete,
  onUpdateQuestion,
  onRemoveQuestion,
  onAddQuestion,
  onUpdatePhotoField,
  onRemovePhotoField,
  onAddPhotoField,
  expandedQuestionId,
  onToggleQuestion,
}: {
  category: TemplateCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateTitle: (title: string) => void;
  onDelete: () => void;
  onUpdateQuestion: (idx: number, q: CustomQuestion) => void;
  onRemoveQuestion: (idx: number) => void;
  onAddQuestion: () => void;
  onUpdatePhotoField: (idx: number, field: PhotoField) => void;
  onRemovePhotoField: (idx: number) => void;
  onAddPhotoField: () => void;
  expandedQuestionId: string | null;
  onToggleQuestion: (id: string) => void;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(category.title);

  const handleSaveTitle = () => {
    onUpdateTitle(editTitle);
    setIsEditingTitle(false);
  };

  return (
    <div className="border border-gray-300 rounded-xl bg-white overflow-hidden shadow-md">
      {/* Category Header */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
        <button onClick={onToggle} className="p-1 hover:bg-white/50 rounded">
          <ChevronDown className={`w-5 h-5 text-blue-700 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
        </button>
        <Folder className="w-5 h-5 text-blue-700" />
        
        {isEditingTitle ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white font-semibold"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); }}
            />
            <button
              onClick={handleSaveTitle}
              className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setIsEditingTitle(false); setEditTitle(category.title); }}
              className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <span className="flex-1 font-bold text-gray-900">{category.title || 'Untitled Category'}</span>
            <button
              onClick={() => setIsEditingTitle(true)}
              className="p-1.5 hover:bg-blue-100 text-blue-700 rounded-lg"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </>
        )}

        <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full border">
          {(category.questions || []).length} questions
        </span>
        <button
          onClick={onDelete}
          className="p-1.5 hover:bg-red-100 text-red-500 rounded-lg"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Category Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Photo Fields Section */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Photo Fields ({category.photo_fields?.length || 0})
            </h4>
            <div className="space-y-2">
              {(category.photo_fields || []).map((field, idx) => (
                <div key={field.field_id} className="flex items-center gap-2 p-2 bg-white rounded-lg border">
                  <Camera className="w-4 h-4 text-blue-500" />
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => onUpdatePhotoField(idx, { ...field, label: e.target.value })}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                    placeholder="Photo label"
                  />
                  <button
                    onClick={() => onRemovePhotoField(idx)}
                    className="p-1.5 hover:bg-red-100 text-red-500 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={onAddPhotoField}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Photo Field
              </button>
            </div>
          </div>

          {/* Questions Section */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              Questions ({(category.questions || []).length})
            </h4>
            <div className="space-y-2">
              {(category.questions || []).map((q, idx) => (
                <QuestionEditor
                  key={q.id}
                  question={q}
                  onChange={(updated) => onUpdateQuestion(idx, updated)}
                  onRemove={() => onRemoveQuestion(idx)}
                  isExpanded={expandedQuestionId === q.id}
                  onToggle={() => onToggleQuestion(q.id)}
                />
              ))}
              <button
                onClick={onAddQuestion}
                className="w-full py-2 border-2 border-dashed border-blue-300 rounded-lg text-sm text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Question
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createBrowserClient();

  const templateId = params.id as string;

  const [template, setTemplate] = useState<Template | null>(null);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch template
  const fetchTemplate = useCallback(async () => {
    setIsLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: fetchError } = await (supabase as any)
      .from('templates')
      .select('id, template_name, policy_type, business_id, is_active, categories')
      .eq('id', templateId)
      .single();

    if (fetchError || !data) {
      console.error('Error fetching template:', fetchError);
      setError('Template not found');
    } else {
      const templateData = data as Template;
      setTemplate(templateData);

      // Load categories from template, normalizing old format
      if (templateData.categories && Array.isArray(templateData.categories) && templateData.categories.length > 0) {
        // Normalize categories to handle old format (category_id/category_name) vs new (id/title)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalizedCategories = templateData.categories.map((cat: any, idx: number) => ({
          id: cat.id || cat.category_id || `cat_${idx}`,
          title: cat.title || cat.category_name || 'Untitled Category',
          order: cat.order ?? idx,
          photo_fields: cat.photo_fields || [],
          questions: (cat.questions || []).map((q: any) => ({
            id: q.id || q.question_id || `q_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            question_id: q.question_id || q.id || `q_${Date.now()}`,
            text: q.text || '',
            type: q.type || 'text',
            options: q.options,
            required: q.required ?? false,
            conditional: q.conditional,
          })),
        }));
        
        setCategories(normalizedCategories);
        setExpandedCategories(new Set([normalizedCategories[0].id]));
      } else {
        setCategories([]);
      }
    }

    setIsLoading(false);
  }, [supabase, templateId]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // Category handlers
  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestionId(prev => prev === questionId ? null : questionId);
  };

  const updateCategoryTitle = (categoryId: string, title: string) => {
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, title } : c));
  };

  const deleteCategory = (categoryId: string) => {
    if (confirm('Delete this category and all its questions?')) {
      setCategories(prev => prev.filter(c => c.id !== categoryId));
    }
  };

  const addCategory = () => {
    const newId = `cat_${Date.now()}`;
    const newCategory: TemplateCategory = {
      id: newId,
      title: 'New Category',
      order: categories.length,
      photo_fields: [],
      questions: [],
    };
    setCategories(prev => [...prev, newCategory]);
    setExpandedCategories(prev => new Set([...prev, newId]));
  };

  const updateQuestion = (categoryId: string, questionIdx: number, question: CustomQuestion) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      const questions = [...c.questions];
      questions[questionIdx] = question;
      return { ...c, questions };
    }));
  };

  const removeQuestion = (categoryId: string, questionIdx: number) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      return { ...c, questions: c.questions.filter((_, i) => i !== questionIdx) };
    }));
  };

  const addQuestion = (categoryId: string) => {
    const newQuestion: CustomQuestion = {
      id: `q_${Date.now()}`,
      question_id: `q_${Date.now()}`,
      text: '',
      type: 'text',
      required: false,
    };
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      return { ...c, questions: [...c.questions, newQuestion] };
    }));
    setExpandedQuestionId(newQuestion.id);
  };

  const updatePhotoField = (categoryId: string, fieldIdx: number, field: PhotoField) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      const photo_fields = [...c.photo_fields];
      photo_fields[fieldIdx] = field;
      return { ...c, photo_fields };
    }));
  };

  const removePhotoField = (categoryId: string, fieldIdx: number) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      return { ...c, photo_fields: c.photo_fields.filter((_, i) => i !== fieldIdx) };
    }));
  };

  const addPhotoField = (categoryId: string) => {
    const newField: PhotoField = {
      field_id: `photo_${Date.now()}`,
      label: '',
      instruction: '',
      required: true,
      capture_gps: false,
    };
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      return { ...c, photo_fields: [...c.photo_fields, newField] };
    }));
  };

  // Save handler
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('templates')
        .update({ categories: categories })
        .eq('id', templateId);

      if (updateError) throw updateError;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Template Not Found</h2>
          <button
            onClick={() => router.push('/admin/templates')}
            className="text-blue-700 hover:underline font-semibold"
          >
            ← Back to Templates
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin/templates')}
          className="text-sm text-gray-700 hover:text-gray-900 mb-2 flex items-center gap-1 font-semibold"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Templates
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{template.template_name}</h1>
            <p className="text-gray-700">
              <span className="capitalize">{template.policy_type.replace(/_/g, ' ')}</span>
              {' • '}Template Editor
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${
              template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
            }`}>
              {template.is_active ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveSuccess ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saveSuccess ? 'Saved!' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4 sticky top-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Folder className="w-4 h-4 text-gray-700" />
              Categories ({categories.length})
            </h3>
            
            <div className="space-y-1.5">
              {categories.map((cat, idx) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    const element = document.getElementById(`category-${cat.id}`);
                    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setExpandedCategories(prev => new Set([...prev, cat.id]));
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    expandedCategories.has(cat.id)
                      ? 'bg-blue-100 text-blue-800 font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {idx + 1}. {cat.title || 'Untitled'}
                </button>
              ))}
            </div>

            <button
              onClick={addCategory}
              className="w-full mt-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              Add Category
            </button>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
            <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Template Info
            </h4>
            <p className="text-sm text-blue-700">
              Define categories, questions, and photo requirements. 
              This template can be used when creating new policies.
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {categories.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-300">
              <FolderPlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Categories Yet</h3>
              <p className="text-gray-500 mb-4">Add your first category to start building this template.</p>
              <button
                onClick={addCategory}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-lg flex items-center gap-2 mx-auto"
              >
                <FolderPlus className="w-5 h-5" />
                Add New Category
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {categories.map((category) => (
                <div key={category.id} id={`category-${category.id}`}>
                  <CategoryCard
                    category={category}
                    isExpanded={expandedCategories.has(category.id)}
                    onToggle={() => toggleCategory(category.id)}
                    onUpdateTitle={(title) => updateCategoryTitle(category.id, title)}
                    onDelete={() => deleteCategory(category.id)}
                    onUpdateQuestion={(idx, q) => updateQuestion(category.id, idx, q)}
                    onRemoveQuestion={(idx) => removeQuestion(category.id, idx)}
                    onAddQuestion={() => addQuestion(category.id)}
                    onUpdatePhotoField={(idx, field) => updatePhotoField(category.id, idx, field)}
                    onRemovePhotoField={(idx) => removePhotoField(category.id, idx)}
                    onAddPhotoField={() => addPhotoField(category.id)}
                    expandedQuestionId={expandedQuestionId}
                    onToggleQuestion={toggleQuestion}
                  />
                </div>
              ))}

              {/* Add Category Button */}
              <button
                onClick={addCategory}
                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2 transition-colors"
              >
                <FolderPlus className="w-5 h-5" />
                Add New Category
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
