'use client';

/**
 * Policy List Page
 * Shows all policies with template info
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  Plus, Search, Loader2, RefreshCw, ChevronRight, FileText, Trash2
} from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';

interface Policy {
  id: string;
  policy_name: string;
  policy_type: string;
  external_policy_id: string | null;
  sla_hours: number;
  status: string;
  template: {
    template_name: string;
  } | null;
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
      isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
    }`}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function PolicyTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    home_insurance: 'bg-blue-100 text-blue-700',
    auto_insurance: 'bg-green-100 text-green-700',
    credit_card: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-600'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

export default function PoliciesPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const PAGE_SIZE = 10;

  const fetchPolicies = useCallback(async () => {
    setIsLoading(true);

    // Dynamic Query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('policies')
      .select(`
        id,
        policy_name,
        policy_type,
        external_policy_id,
        sla_hours,
        status,
        template:templates (
          template_name
        )
      `, { count: 'exact' });

    // Search
    if (searchQuery) {
      query = query.or(`policy_name.ilike.%${searchQuery}%,policy_type.ilike.%${searchQuery}%,external_policy_id.ilike.%${searchQuery}%`);
    }

    // Pagination
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('Error fetching policies:', error);
    } else {
      setPolicies((data as Policy[]) || []);
      if (count !== null) {
        setTotalPages(Math.ceil(count / PAGE_SIZE));
        setTotalItems(count);
      }
    }

    setIsLoading(false);
  }, [supabase, searchQuery, page]);

  // Debounce search/page changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPolicies();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchPolicies]);

  // No client-side filter
  const filtered = policies;

  const handleDelete = async (e: React.MouseEvent, policyId: string, policyName: string) => {
    e.stopPropagation(); // Prevent row click navigation
    
    const confirmed = window.confirm(
      `Are you sure you want to delete "${policyName}"?\n\nThis action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    setIsDeleting(policyId);
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('policies')
        .delete()
        .eq('id', policyId)
        .select(); // Add .select() to get the deleted row back
      
      if (error) {
        // Check for foreign key constraint error
        if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('violates')) {
          alert('Cannot delete this policy because it is being used by existing verifications.\n\nPlease archive the policy instead, or delete the associated verifications first.');
        } else {
          alert(`Failed to delete policy: ${error.message}`);
        }
        console.error('Delete error:', error);
      } else if (!data || data.length === 0) {
        // RLS silently blocked the delete - no rows were deleted
        alert('Unable to delete this policy. You may not have permission to delete it, or the policy no longer exists.');
        console.error('Delete returned no data - RLS may have blocked the operation');
      } else {
        // Successfully deleted - remove from local state
        setPolicies(prev => prev.filter(p => p.id !== policyId));
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('An unexpected error occurred while deleting the policy.');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
          <p className="text-gray-500 mt-1">Manage verification policy templates</p>
        </div>
        <Link
          href="/admin/policies/create"
          className="mt-4 sm:mt-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Policy
        </Link>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search policies..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={fetchPolicies}
          className="p-2.5 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No policies found</p>
            <Link
              href="/admin/policies/create"
              className="inline-flex items-center gap-2 mt-4 text-blue-600 hover:underline"
            >
              <Plus className="w-4 h-4" />
              Create your first policy
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Policy Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Linked Template</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">SLA</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((policy) => (
                  <tr
                    key={policy.id}
                    onClick={() => router.push(`/admin/policies/${policy.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{policy.policy_name}</p>
                      {policy.external_policy_id && (
                        <p className="text-xs text-gray-500">{policy.external_policy_id}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <PolicyTypeBadge type={policy.policy_type} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {policy.template?.template_name || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {policy.sla_hours}h
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={policy.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => handleDelete(e, policy.id, policy.policy_name)}
                          disabled={isDeleting === policy.id}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete policy"
                        >
                          {isDeleting === policy.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination Controls */}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
