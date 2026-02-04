'use client';

/**
 * Admin Verifications List
 * Full list of all verifications with filters
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  Plus, Search, Filter, ChevronRight, Loader2, RefreshCw
} from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';

interface Verification {
  id: string;
  verification_ref: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  created_at: string;
  policy: {
    policy_name: string;
    policy_type: string;
  } | null;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' },
    in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
    submitted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Pending' },
    approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  };
  const c = config[status] || config.draft;
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

export default function VerificationsPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const PAGE_SIZE = 10;

  const fetchVerifications = useCallback(async () => {
    setIsLoading(true);

    // Dynamic Query Construction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('verifications')
      .select(`
        id,
        verification_ref,
        customer_name,
        customer_phone,
        status,
        created_at,
        policy:policies (
          policy_name,
          policy_type
        )
      `, { count: 'exact' });

    // 1. Status Filter
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    // 2. Search Filter
    if (searchQuery) {
      query = query.or(`verification_ref.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,customer_phone.ilike.%${searchQuery}%`);
    }

    // 3. Pagination & Ordering
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    
    if (error) {
      console.error('Error fetching verifications:', error);
    } else {
      setVerifications((data as Verification[]) || []);
      if (count !== null) {
        setTotalPages(Math.ceil(count / PAGE_SIZE));
        setTotalItems(count);
      }
    }
    setIsLoading(false);
  }, [supabase, statusFilter, searchQuery, page]);

  // Debounce search/filter/page change to valid over-fetching
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVerifications();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchVerifications]); // fetchVerifications depends on all filter/page states

  // Realtime subscription for verification updates
  useEffect(() => {
    const channel = supabase
      .channel('verifications-list-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'verifications',
        },
        (payload: { new: { id: string; status: string; updated_at?: string } }) => {
          const updated = payload.new;
          
          // Update local state with new status
          setVerifications((prev) =>
            prev.map((v) =>
              v.id === updated.id
                ? { ...v, status: updated.status }
                : v
            )
          );

          // Show toast notification
          const statusLabels: Record<string, string> = {
            draft: 'Draft',
            pending: 'Pending',
            in_progress: 'In Progress',
            submitted: 'Submitted',
            approved: 'Approved',
            rejected: 'Rejected',
          };
          const label = statusLabels[updated.status] || updated.status;
          
          // Create toast element
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-pulse';
          toast.textContent = `Status updated to ${label}`;
          document.body.appendChild(toast);
          
          // Remove after 3 seconds
          setTimeout(() => toast.remove(), 3000);
        }
      )
      .subscribe();

    // Cleanup on unmount
    return () => {
      channel.unsubscribe();
    };
  }, [supabase]);

  // No client-side filtering needed anymore
  const filtered = verifications;

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Verifications</h1>
        <Link
          href="/admin/verifications/create"
          className="mt-4 sm:mt-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors"
        >
          <Plus className="w-5 h-5" />
          New
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In Progress</option>
            <option value="submitted">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={fetchVerifications}
            className="p-2.5 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className={`w-5 h-5 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-500">No verifications found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Reference</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Customer</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Policy</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Created</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => router.push(`/admin/verifications/${v.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4 font-mono text-sm text-blue-600 font-medium">{v.verification_ref}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{v.customer_name}</p>
                      <p className="text-xs text-gray-500">{v.customer_phone}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{v.policy?.policy_name || '—'}</td>
                    <td className="px-6 py-4"><StatusBadge status={v.status} /></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(v.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4"><ChevronRight className="w-5 h-5 text-gray-400" /></td>
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
