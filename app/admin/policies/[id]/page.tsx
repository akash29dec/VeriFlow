'use client';

/**
 * Policy Editor Page (Complete Fix)
 * 
 * FIXED:
 * 1. Questions fully editable with inline expansion
 * 2. Text visibility improved (darker text-gray-900 for inputs)
 * 3. Dynamic photo count: if condition triggers N photos from answer value
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  ChevronLeft, Loader2, FileText, Clock, Save, Plus, Trash2,
  AlertCircle, Check, ChevronDown, Camera, Folder, FolderPlus,
  Edit2, X, HelpCircle, Copy
} from 'lucide-react';

// ============================================================================
// Types
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
  use_dynamic_count?: boolean; // NEW: If true, use the answer value as photo count
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

interface PolicyCategory {
  id: string;
  title: string;
  order: number;
  photo_fields: PhotoField[];
  questions: CustomQuestion[];
}

interface TemplateCategory {
  category_id: string;
  category_name: string;
  order?: number;
  questions?: Array<{
    question_id: string;
    text: string;
    type: string;
    options?: string[];
    required?: boolean;
  }>;
  photo_fields?: PhotoField[];
}

interface Template {
  id: string;
  template_name: string;
  policy_type: string;
  categories: TemplateCategory[];
}

interface Policy {
  id: string;
  policy_name: string;
  policy_type: string;
  external_policy_id: string | null;
  sla_hours: number;
  status: string;
  custom_questions: PolicyCategory[] | null;
  template: Template | null;
}

// ============================================================================
// Helper: Deep copy template to PolicyCategory[]
// ============================================================================

function deepCopyTemplateToCategories(templateCategories: TemplateCategory[]): PolicyCategory[] {
  return templateCategories.map((cat, index) => ({
    id: cat.category_id,
    title: cat.category_name,
    order: cat.order ?? index,
    photo_fields: (cat.photo_fields || []).map(pf => ({
      field_id: pf.field_id,
      label: pf.label,
      instruction: pf.instruction || '',
      required: pf.required ?? false,
      capture_gps: pf.capture_gps ?? false,
    })),
    questions: (cat.questions || []).map(q => ({
      id: `q_${q.question_id}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      question_id: q.question_id,
      text: q.text,
      type: q.type as 'text' | 'number' | 'single_select' | 'yes_no',
      options: q.options,
      required: q.required ?? false,
    })),
  }));
}

// ============================================================================
// Question Editor Component (Fully Editable)
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
    
    // Determine default value based on question type
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
      case 'yes_no': return 'Yes/No';
      default: return type;
    }
  };

  return (
    <div className="border border-gray-300 rounded-lg bg-white overflow-hidden shadow-sm">
      {/* Question Header */}
      <div 
        className="flex items-center gap-3 p-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={onToggle}
      >
        <button className="p-1 hover:bg-gray-200 rounded">
          <ChevronDown className={`w-4 h-4 text-gray-700 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
        </button>
        <HelpCircle className="w-4 h-4 text-blue-600" />
        <span className="flex-1 text-sm font-semibold text-gray-900 truncate">
          {question.text || 'Click to edit question...'}
        </span>
        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded font-semibold">
          {getTypeLabel(question.type)}
        </span>
        {question.required && (
          <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded font-semibold">Required</span>
        )}
        {question.conditional?.use_dynamic_count && (
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded font-semibold">
            Dynamic 📷
          </span>
        )}
        {question.conditional && !question.conditional.use_dynamic_count && question.conditional.show_fields.length > 0 && (
          <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded font-semibold">
            +{question.conditional.show_fields.length} 📷
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
          title="Delete question"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Question Editor Body */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-white">
          {/* Question Text */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1.5">
              Question Text <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={question.text}
              onChange={(e) => updateField('text', e.target.value)}
              placeholder="Enter your question (e.g., 'How many damages are visible?')"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
            />
          </div>

          {/* Type & Required Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1.5">
                Answer Type
              </label>
              <select
                value={question.type}
                onChange={(e) => {
                  const newType = e.target.value as CustomQuestion['type'];
                  updateField('type', newType);
                  // Only keep conditional if new type supports it
                  if (newType !== 'number' && newType !== 'yes_no' && newType !== 'single_select') {
                    updateField('conditional', undefined);
                  }
                }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="text">Text (Free input)</option>
                <option value="number">Number</option>
                <option value="yes_no">Yes / No</option>
                <option value="single_select">Single Select (Custom options)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1.5">
                Required?
              </label>
              <select
                value={question.required ? 'yes' : 'no'}
                onChange={(e) => updateField('required', e.target.value === 'yes')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="yes">Yes - Must answer</option>
                <option value="no">No - Optional</option>
              </select>
            </div>
          </div>

          {/* Options (for single_select) */}
          {question.type === 'single_select' && (
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1.5">
                Options <span className="text-gray-600 font-normal">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={question.options?.join(', ') || ''}
                onChange={(e) => updateField('options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="Good, Fair, Poor, Damaged"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
              />
              {question.options && question.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {question.options.map((opt, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">
                      {opt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Yes/No Preview */}
          {question.type === 'yes_no' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900 font-semibold mb-2">Preview: Customer will see</p>
              <div className="flex gap-2">
                <span className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm font-semibold">Yes</span>
                <span className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm font-semibold">No</span>
              </div>
            </div>
          )}

          {/* Conditional Photo Upload (for number, yes_no, and single_select types) */}
          {(question.type === 'number' || question.type === 'yes_no' || question.type === 'single_select') && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-600" />
                Conditional Photo Upload
              </h4>
              
              {/* Mode Selection for Number Type */}
              {question.type === 'number' && (
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-900 mb-2">Photo Requirement Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => initializeConditional(false)}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        question.conditional && !question.conditional.use_dynamic_count
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <p className="font-semibold text-gray-900 text-sm">Fixed Count</p>
                      <p className="text-xs text-gray-600 mt-1">Define specific photos to require</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => initializeConditional(true)}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        question.conditional?.use_dynamic_count
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <p className="font-semibold text-gray-900 text-sm">Dynamic Count</p>
                      <p className="text-xs text-gray-600 mt-1">Require N photos based on answer</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Dynamic Count Mode */}
              {question.conditional?.use_dynamic_count && question.type === 'number' && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-purple-900 font-semibold mb-2">
                    🎯 Dynamic Photo Count Enabled
                  </p>
                  <p className="text-sm text-purple-800">
                    If customer enters <strong>2</strong>, they must upload <strong>2 photos</strong>.
                    <br />
                    If customer enters <strong>5</strong>, they must upload <strong>5 photos</strong>.
                  </p>
                  
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-purple-800 mb-1">Trigger when answer is</label>
                      <select
                        value={question.conditional.operator}
                        onChange={(e) => updateField('conditional', {
                          ...question.conditional!,
                          operator: e.target.value as ConditionalOperator,
                        })}
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm text-gray-900 bg-white"
                      >
                        <option value=">">Greater than (&gt;)</option>
                        <option value=">=">Greater or equal (≥)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-purple-800 mb-1">Value</label>
                      <input
                        type="number"
                        value={question.conditional.value as number}
                        onChange={(e) => updateField('conditional', {
                          ...question.conditional!,
                          value: parseInt(e.target.value) || 0,
                        })}
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm text-gray-900 bg-white"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-purple-800 mb-1">Photo Label Template</label>
                    <input
                      type="text"
                      value={question.conditional.show_fields[0]?.label || 'Photo #'}
                      onChange={(e) => updateField('conditional', {
                        ...question.conditional!,
                        show_fields: [{
                          field_id: question.conditional!.show_fields[0]?.field_id || `photo_${question.question_id}_dynamic`,
                          label: e.target.value,
                          instruction: 'Upload photo',
                          required: true,
                        }],
                      })}
                      placeholder="Photo # (# will be replaced with number)"
                      className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400"
                    />
                    <p className="text-xs text-purple-700 mt-1">Use # as placeholder for number (e.g., &quot;Damage Photo #&quot; → &quot;Damage Photo 1&quot;, &quot;Damage Photo 2&quot;...)</p>
                  </div>

                  <button
                    onClick={() => updateField('conditional', undefined)}
                    className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Remove conditional logic
                  </button>
                </div>
              )}

              {/* Fixed Count Mode / Yes-No Mode */}
              {question.conditional && !question.conditional.use_dynamic_count && (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-amber-900 font-semibold">
                      If answer is{' '}
                      <strong>{question.conditional.operator}</strong>{' '}
                      <strong>{question.conditional.value}</strong>
                      , then require these photos:
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Operator</label>
                      {(question.type === 'yes_no' || question.type === 'single_select') ? (
                        <select
                          value="="
                          disabled
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-gray-100"
                        >
                          <option value="=">Equal to (=)</option>
                        </select>
                      ) : (
                        <select
                          value={question.conditional.operator}
                          onChange={(e) => updateField('conditional', {
                            ...question.conditional!,
                            operator: e.target.value as ConditionalOperator,
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                        >
                          <option value=">">Greater than (&gt;)</option>
                          <option value=">=">Greater or equal (≥)</option>
                          <option value="<">Less than (&lt;)</option>
                          <option value="<=">Less or equal (≤)</option>
                          <option value="=">Equal to (=)</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Value</label>
                      {question.type === 'yes_no' ? (
                        <select
                          value={String(question.conditional.value)}
                          onChange={(e) => updateField('conditional', {
                            ...question.conditional!,
                            value: e.target.value,
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                        >
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      ) : question.type === 'single_select' ? (
                        <select
                          value={String(question.conditional.value)}
                          onChange={(e) => updateField('conditional', {
                            ...question.conditional!,
                            value: e.target.value,
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                        >
                          {question.options && question.options.length > 0 ? (
                            question.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))
                          ) : (
                            <option value="">No options defined</option>
                          )}
                        </select>
                      ) : (
                        <input
                          type="number"
                          value={question.conditional.value as number}
                          onChange={(e) => updateField('conditional', {
                            ...question.conditional!,
                            value: parseInt(e.target.value) || 0,
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                        />
                      )}
                    </div>
                  </div>

                  {/* Photo fields list */}
                  <div className="space-y-2 mb-3">
                    {question.conditional.show_fields.map((field, idx) => (
                      <div key={field.field_id} className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg">
                        <Camera className="w-4 h-4 text-gray-600" />
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => {
                            const fields = [...question.conditional!.show_fields];
                            fields[idx] = { ...fields[idx], label: e.target.value };
                            updateField('conditional', { ...question.conditional!, show_fields: fields });
                          }}
                          placeholder="Photo label (e.g., 'Photo of damage')"
                          className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white placeholder:text-gray-400"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 whitespace-nowrap font-medium">
                          <input
                            type="checkbox"
                            checked={field.required ?? true}
                            onChange={(e) => {
                              const fields = [...question.conditional!.show_fields];
                              fields[idx] = { ...fields[idx], required: e.target.checked };
                              updateField('conditional', { ...question.conditional!, show_fields: fields });
                            }}
                            className="rounded border-gray-300"
                          />
                          Required
                        </label>
                        <button
                          onClick={() => removeConditionalField(idx)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={addStaticPhotoField}
                      className="text-sm text-blue-700 hover:text-blue-800 font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add photo requirement
                    </button>
                    <button
                      onClick={() => updateField('conditional', undefined)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Remove all
                    </button>
                  </div>
                </>
              )}

              {/* No conditional yet - show init buttons */}
              {!question.conditional && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700 mb-3 font-medium">
                    {question.type === 'number' 
                      ? 'Require photos based on the answer value'
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
  category: PolicyCategory;
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
              className="p-1.5 text-green-700 hover:bg-green-50 rounded"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setEditTitle(category.title); setIsEditingTitle(false); }}
              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <span className="flex-1 font-bold text-gray-900 text-lg">{category.title}</span>
            <button
              onClick={() => setIsEditingTitle(true)}
              className="p-1.5 text-gray-600 hover:bg-white/50 rounded"
              title="Edit title"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </>
        )}
        
        <span className="text-xs px-2.5 py-1 bg-white border border-gray-300 text-gray-800 rounded-full font-semibold">
          {category.questions.length} Questions • {category.photo_fields.length} Photos
        </span>
        <button
          onClick={onDelete}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
          title="Delete category"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Category Content */}
      {isExpanded && (
        <div className="p-5 space-y-6">
          {/* Photo Fields Section */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4 text-gray-700" />
              Photo Requirements ({category.photo_fields.length})
            </h4>
            
            {category.photo_fields.length === 0 ? (
              <p className="text-sm text-gray-600 italic mb-3 bg-gray-50 p-3 rounded-lg">
                No photo requirements added yet
              </p>
            ) : (
              <div className="space-y-2 mb-3">
                {category.photo_fields.map((field, idx) => (
                  <div key={field.field_id} className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <Camera className="w-4 h-4 text-gray-600" />
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => onUpdatePhotoField(idx, { ...field, label: e.target.value })}
                      placeholder="Photo label (e.g., 'Front of property')"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400"
                    />
                    <label className="flex items-center gap-1.5 text-sm text-gray-800 font-medium">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => onUpdatePhotoField(idx, { ...field, required: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-gray-800 font-medium">
                      <input
                        type="checkbox"
                        checked={field.capture_gps}
                        onChange={(e) => onUpdatePhotoField(idx, { ...field, capture_gps: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      GPS
                    </label>
                    <button
                      onClick={() => onRemovePhotoField(idx)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <button
              onClick={onAddPhotoField}
              className="text-sm text-blue-700 hover:text-blue-800 font-semibold flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add photo requirement
            </button>
          </div>

          {/* Questions Section */}
          <div className="border-t border-gray-200 pt-5">
            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-gray-700" />
              Questions ({category.questions.length})
            </h4>
            
            {category.questions.length === 0 ? (
              <p className="text-sm text-gray-600 italic mb-3 bg-gray-50 p-3 rounded-lg">
                No questions in this category. Click below to add one.
              </p>
            ) : (
              <div className="space-y-3 mb-4">
                {category.questions.map((q, idx) => (
                  <QuestionEditor
                    key={q.id}
                    question={q}
                    onChange={(updated) => onUpdateQuestion(idx, updated)}
                    onRemove={() => onRemoveQuestion(idx)}
                    isExpanded={expandedQuestionId === q.id}
                    onToggle={() => onToggleQuestion(q.id)}
                  />
                ))}
              </div>
            )}
            
            <button
              onClick={onAddQuestion}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-700 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 flex items-center justify-center gap-2 transition-colors font-semibold"
            >
              <Plus className="w-5 h-5" />
              Add Question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function PolicyEditorPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createBrowserClient();

  const policyId = params.id as string;

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [categories, setCategories] = useState<PolicyCategory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Save as Template modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState(false);

  // Fetch policy
  const fetchPolicy = useCallback(async () => {
    setIsLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: fetchError } = await (supabase as any)
      .from('policies')
      .select(`
        id,
        policy_name,
        policy_type,
        external_policy_id,
        sla_hours,
        status,
        custom_questions,
        template:templates (
          id,
          template_name,
          policy_type,
          categories
        )
      `)
      .eq('id', policyId)
      .single();

    if (fetchError || !data) {
      console.error('Error fetching policy:', fetchError);
      setError('Policy not found');
    } else {
      const policyData = data as Policy;
      setPolicy(policyData);

      if (policyData.custom_questions && Array.isArray(policyData.custom_questions) && policyData.custom_questions.length > 0) {
        const firstItem = policyData.custom_questions[0] as unknown;
        if (firstItem && typeof firstItem === 'object' && 'title' in (firstItem as object)) {
          setCategories(policyData.custom_questions as PolicyCategory[]);
        } else {
          setCategories([{
            id: 'legacy_questions',
            title: 'Custom Questions',
            order: 0,
            photo_fields: [],
            questions: policyData.custom_questions as unknown as CustomQuestion[],
          }]);
        }
      } else if (policyData.template?.categories) {
        const copiedCategories = deepCopyTemplateToCategories(policyData.template.categories);
        setCategories(copiedCategories);
        if (copiedCategories.length > 0) {
          setExpandedCategories(new Set([copiedCategories[0].id]));
        }
      }
    }

    setIsLoading(false);
  }, [supabase, policyId]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

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
    if (confirm('Delete this category and all its contents?')) {
      setCategories(prev => prev.filter(c => c.id !== categoryId));
    }
  };

  const addCategory = () => {
    const newCategory: PolicyCategory = {
      id: `cat_${Date.now()}`,
      title: 'New Category',
      order: categories.length,
      photo_fields: [],
      questions: [],
    };
    setCategories([...categories, newCategory]);
    setExpandedCategories(prev => new Set(prev).add(newCategory.id));
  };

  const updateQuestion = (categoryId: string, questionIdx: number, updated: CustomQuestion) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      const questions = [...c.questions];
      questions[questionIdx] = updated;
      return { ...c, questions };
    }));
  };

  const removeQuestion = (categoryId: string, questionIdx: number) => {
    if (confirm('Delete this question?')) {
      setCategories(prev => prev.map(c => {
        if (c.id !== categoryId) return c;
        return { ...c, questions: c.questions.filter((_, i) => i !== questionIdx) };
      }));
    }
  };

  const addQuestion = (categoryId: string) => {
    const newQuestionId = `q_${Date.now()}`;
    const newQuestion: CustomQuestion = {
      id: newQuestionId,
      question_id: `q_custom_${Date.now()}`,
      text: '',
      type: 'text',
      required: false,
    };
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      return { ...c, questions: [...c.questions, newQuestion] };
    }));
    setExpandedQuestionId(newQuestionId);
  };

  const updatePhotoField = (categoryId: string, fieldIdx: number, updated: PhotoField) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      const photo_fields = [...c.photo_fields];
      photo_fields[fieldIdx] = updated;
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

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('policies')
        .update({ custom_questions: categories })
        .eq('id', policyId);

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

  // ============================================================================
  // Save as Template Handler
  // ============================================================================
  
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim() || !policy) return;
    
    setIsSavingTemplate(true);
    setError(null);
    
    try {
      // 1. Get user's business_id
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
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
      
      // 2. Deep copy the current categories (already in PolicyCategory format)
      // This preserves all questions, photo fields, conditionals, etc.
      const deepCopiedCategories = JSON.parse(JSON.stringify(categories));
      
      // 3. Insert into templates table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('templates')
        .insert({
          template_name: templateName.trim(),
          policy_type: policy.policy_type,
          categories: deepCopiedCategories,
          business_id: userData.business_id,
          is_active: true,
        });
        
      if (insertError) {
        console.error('Template insert error:', insertError);
        throw new Error(insertError.message || 'Failed to save template');
      }
      
      // 4. Success!
      setTemplateSaveSuccess(true);
      setTimeout(() => {
        setTemplateSaveSuccess(false);
        setShowTemplateModal(false);
        setTemplateName('');
      }, 2000);
      
    } catch (err) {
      console.error('Save as template error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save as template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Policy Not Found</h2>
          <button
            onClick={() => router.push('/admin/policies')}
            className="text-blue-700 hover:underline font-semibold"
          >
            ← Back to Policies
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
          onClick={() => router.push('/admin/policies')}
          className="text-sm text-gray-700 hover:text-gray-900 mb-2 flex items-center gap-1 font-semibold"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Policies
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{policy.policy_name}</h1>
            <p className="text-gray-700">
              {policy.external_policy_id && <span className="font-mono text-gray-800">{policy.external_policy_id} • </span>}
              <span className="capitalize">{policy.policy_type.replace(/_/g, ' ')}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${
              policy.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
            }`}>
              {policy.status}
            </span>
            {/* Save as Template Button */}
            <button
              onClick={() => setShowTemplateModal(true)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-colors border border-gray-300"
            >
              <Copy className="w-4 h-4" />
              Save as Template
            </button>
            {/* Save Policy Button */}
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
              {saveSuccess ? 'Saved!' : 'Save Policy'}
            </button>
          </div>
        </div>
      </div>

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
                    setExpandedCategories(prev => new Set(prev).add(cat.id));
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    expandedCategories.has(cat.id)
                      ? 'bg-blue-100 text-blue-900 font-semibold'
                      : 'hover:bg-gray-100 text-gray-800 font-medium'
                  }`}
                >
                  <span className="w-5 h-5 rounded bg-gray-200 text-gray-800 text-xs flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <span className="truncate">{cat.title}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">SLA</span>
                  <span className="text-gray-900 font-semibold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {policy.sla_hours}h
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Template</span>
                  <span className="text-gray-900 font-semibold text-right truncate max-w-[120px]">
                    {policy.template?.template_name || '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-800 font-semibold">{error}</p>
            </div>
          )}

          {categories.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-12 text-center">
              <Folder className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">No Categories</h3>
              <p className="text-gray-700 mb-6">Start building your policy by adding a category</p>
              <button
                onClick={addCategory}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                Add First Category
              </button>
            </div>
          ) : (
            <div className="space-y-5">
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
                    onUpdatePhotoField={(idx, f) => updatePhotoField(category.id, idx, f)}
                    onRemovePhotoField={(idx) => removePhotoField(category.id, idx)}
                    onAddPhotoField={() => addPhotoField(category.id)}
                    expandedQuestionId={expandedQuestionId}
                    onToggleQuestion={toggleQuestion}
                  />
                </div>
              ))}

              <button
                onClick={addCategory}
                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-700 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50 flex items-center justify-center gap-2 transition-colors font-bold"
              >
                <FolderPlus className="w-5 h-5" />
                Add New Category
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Save as Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isSavingTemplate && setShowTemplateModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Copy className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Save as Template</h3>
                  <p className="text-sm text-gray-500">Create a reusable template</p>
                </div>
              </div>
              <button
                onClick={() => !isSavingTemplate && setShowTemplateModal(false)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                disabled={isSavingTemplate}
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {templateSaveSuccess ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 mb-1">Template Saved!</h4>
                  <p className="text-gray-500">Your template is now available for new policies.</p>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 mb-4">
                    Save the current policy configuration as a template. This includes all categories, 
                    questions, photo fields, and conditional logic.
                  </p>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Template Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g., My Custom Home Template"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
                      autoFocus
                      disabled={isSavingTemplate}
                    />
                  </div>
                  
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-sm text-blue-700">
                      <strong>Policy Type:</strong> <span className="capitalize">{policy?.policy_type.replace(/_/g, ' ')}</span>
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      <strong>Categories:</strong> {categories.length} | <strong>Questions:</strong> {categories.reduce((sum, c) => sum + c.questions.length, 0)}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {!templateSaveSuccess && (
              <div className="flex gap-3 p-4 border-t bg-gray-50">
                <button
                  onClick={() => setShowTemplateModal(false)}
                  disabled={isSavingTemplate}
                  className="flex-1 py-2.5 px-4 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={!templateName.trim() || isSavingTemplate}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {isSavingTemplate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Template
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
