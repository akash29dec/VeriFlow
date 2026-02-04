'use client';

/**
 * Agent Dashboard
 * Shows assigned verifications with filters and SLA timer
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { 
  Shield, LogOut, RefreshCw, Search, Filter, 
  ChevronRight, Clock, AlertTriangle, CheckCircle,
  FileText, User as UserIcon, Loader2, Activity
} from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';

// ============================================================================
// Types
// ============================================================================

interface Verification {
  id: string;
  verification_ref: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  policy: {
    policy_name: string;
    policy_type: string;
    sla_hours: number;
  } | null;
}

interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  business_id: string;
}

interface DashboardStats {
  pendingReviews: number; // status === 'submitted'
  activeCases: number;    // in_progress + pending
  completed: number;      // approved + rejected
}

type FilterStatus = 'pending' | 'history' | 'all';

// ============================================================================
// SLA Indicator Component
// ============================================================================

function SLAIndicator({ submittedAt, slaHours }: { submittedAt: string | null; slaHours: number }) {
  if (!submittedAt) {
    return <span className="text-gray-400 text-sm">—</span>;
  }

  const deadline = new Date(new Date(submittedAt).getTime() + slaHours * 60 * 60 * 1000);
  const now = new Date();
  const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursRemaining < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
        <AlertTriangle className="w-3 h-3" />
        Overdue
      </span>
    );
  } else if (hoursRemaining < 2) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
        <Clock className="w-3 h-3" />
        {Math.round(hoursRemaining)}h
      </span>
    );
  } else if (hoursRemaining < 6) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
        <Clock className="w-3 h-3" />
        {Math.round(hoursRemaining)}h
      </span>
    );
  } else {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
        <CheckCircle className="w-3 h-3" />
        {Math.round(hoursRemaining)}h
      </span>
    );
  }
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
    in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
    submitted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Pending Review' },
    approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
    more_info_requested: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'More Info' },
    escalated: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Escalated' },
    cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Cancelled' },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AgentDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<DashboardStats>({
    pendingReviews: 0,
    activeCases: 0,
    completed: 0
  });

  // Fetch user profile
  const fetchUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return null;
    }

    const { data } = await supabase
      .from('users')
      .select('id, full_name, role, business_id')
      .eq('id', session.user.id)
      .single();

    return data as UserProfile | null;
  }, [supabase, router]);

  // Fetch dashboard stats - separate count queries
  const fetchStats = useCallback(async (userProfile: UserProfile) => {
    // Base query filter for verifier
    const baseFilter = userProfile.role === 'verifier' 
      ? { assigned_verifier_id: userProfile.id } 
      : {};

    // Pending Reviews: submitted
    const { count: pendingCount } = await supabase
      .from('verifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'submitted')
      .match(baseFilter);

    // Active Cases: in_progress + pending  
    const { count: activeCount } = await supabase
      .from('verifications')
      .select('*', { count: 'exact', head: true })
      .in('status', ['in_progress', 'pending'])
      .match(baseFilter);

    // Completed: approved + rejected
    const { count: completedCount } = await supabase
      .from('verifications')
      .select('*', { count: 'exact', head: true })
      .in('status', ['approved', 'rejected'])
      .match(baseFilter);

    setStats({
      pendingReviews: pendingCount || 0,
      activeCases: activeCount || 0,
      completed: completedCount || 0
    });
  }, [supabase]);

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Fetch verifications with server-side pagination & filtering
  const fetchVerifications = useCallback(async (
    userProfile: UserProfile, 
    statusFilter: FilterStatus, 
    queryText: string,
    pageNum: number
  ) => {
    setIsLoading(true);
    let query = supabase
      .from('verifications')
      .select(`
        id,
        verification_ref,
        customer_name,
        customer_phone,
        status,
        submitted_at,
        created_at,
        policy:policies (
          policy_name,
          policy_type,
          sla_hours
        )
      `, { count: 'exact' });

    // 1. Verifier Filter
    if (userProfile.role === 'verifier') {
      query = query.eq('assigned_verifier_id', userProfile.id);
    }

    // 2. Status Tab Filter
    if (statusFilter === 'pending') {
      query = query.in('status', ['submitted', 'more_info_requested', 'escalated', 'pending', 'in_progress']);
    } else if (statusFilter === 'history') {
      query = query.in('status', ['approved', 'rejected', 'cancelled']);
    }

    // 3. Search Filter
    if (queryText) {
      query = query.or(`verification_ref.ilike.%${queryText}%,customer_name.ilike.%${queryText}%,customer_phone.ilike.%${queryText}%`);
    }

    // 4. Pagination & Ordering
    const from = (pageNum - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('Error fetching verifications:', error);
      setIsLoading(false);
      return [];
    }

    if (count !== null) {
      setTotalPages(Math.ceil(count / PAGE_SIZE));
      setTotalItems(count);
    }
    
    setIsLoading(false);
    return (data || []) as unknown as Verification[];
  }, [supabase]);

  // Initial load
  useEffect(() => {
    async function init() {
      const userProfile = await fetchUser();
      if (userProfile) {
        setUser(userProfile);
        fetchStats(userProfile); // Fetch stats on load
      }
    }
    init();
  }, [fetchUser, fetchStats]);

  // Fetch data when filters/page change
  useEffect(() => {
    async function load() {
      if (user) {
        const data = await fetchVerifications(user, filter, searchQuery, page);
        setVerifications(data);
      }
    }
    // Simple debounce for search could be added here, but for now instant triggers
    const timer = setTimeout(load, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [user, filter, searchQuery, page, fetchVerifications]);

  // Refresh data
  const handleRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    const data = await fetchVerifications(user, filter, searchQuery, page);
    setVerifications(data);
    fetchStats(user); // Also refresh stats
    setIsRefreshing(false);
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Filter verifications by search AND status tab
  // NOTE: Logic moved to server-side fetch
  const filteredVerifications = verifications; 

  // Stats - strictly strictly speaking, stats should be fetched separately if we want accurate counts per tab
  // For now, we'll hide specific counts or fetch them separately if needed.
  // The user request prioritized "pagination". Showing counts on tabs is tricky with paginated data unless we do 3 count queries.
  // Let's implement a separate count fetcher or just hide the specific counts for now to be safe, OR we can do a quick count-only query.
  
  // Actually, to keep UI consistent, let's fetch 'counts' separately or just remove counts from tabs if it's too heavy.
  // But previously we filtered on client side.
  // Let's simplified tabs to just labels for now, or fetch counts once.
  // I will just use placeholders or remove counts from buttons to avoid confusion since 'verifications' array is only one page.


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-7 h-7 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">VeriFlow</h1>
              <p className="text-xs text-gray-500">Agent Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Pending Reviews */}
          <div className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingReviews}</p>
                <p className="text-sm text-gray-500">Pending Reviews</p>
              </div>
            </div>
          </div>

          {/* Active Cases */}
          <div className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Activity className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.activeCases}</p>
                <p className="text-sm text-gray-500">Active Cases</p>
              </div>
            </div>
          </div>

          {/* Completed */}
          <div className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
                <p className="text-sm text-gray-500">Completed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border mb-6">
          <div className="p-4 flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by reference, name, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-gray-400"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => { setFilter('pending'); setPage(1); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    filter === 'pending'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => { setFilter('history'); setPage(1); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    filter === 'history'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  History
                </button>
                <button
                  onClick={() => { setFilter('all'); setPage(1); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    filter === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All
                </button>
              </div>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-t">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Reference
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Customer
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Policy
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    SLA
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVerifications.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      No verifications found
                    </td>
                  </tr>
                ) : (
                  filteredVerifications.map((verification) => (
                    <tr 
                      key={verification.id}
                      onClick={() => router.push(`/agent/verifications/${verification.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm font-medium text-blue-600">
                          {verification.verification_ref}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {verification.customer_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {verification.customer_phone}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm text-gray-900">
                            {verification.policy?.policy_name || '—'}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">
                            {verification.policy?.policy_type?.replace('_', ' ') || '—'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={verification.status} />
                      </td>
                      <td className="px-4 py-4">
                        <SLAIndicator 
                          submittedAt={verification.submitted_at}
                          slaHours={verification.policy?.sla_hours || 24}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

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
      </main>
    </div>
  );
}
