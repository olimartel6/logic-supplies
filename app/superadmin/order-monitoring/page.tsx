'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface OrderAttempt {
  id: number;
  order_job_id: number;
  company_id: number;
  request_id: number;
  supplier: string;
  attempt_number: number;
  status: 'success' | 'failed' | 'timeout';
  duration_ms: number;
  error_message: string | null;
  attempted_at: string;
  product: string | null;
}

interface FailedJob {
  id: number;
  company_id: number;
  request_id: number;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  product: string | null;
  quantity: number | null;
  company_name: string | null;
}

interface Stats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  doneJobs: number;
  failedJobs: number;
  recentAttempts: OrderAttempt[];
  failedJobsList: FailedJob[];
}

export default function OrderMonitoringPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [retrySuccess, setRetrySuccess] = useState<number | null>(null);

  async function loadStats() {
    try {
      const res = await fetch('/api/superadmin/order-stats');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { router.push('/'); return; }
        return;
      }
      const data = await res.json();
      setStats(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => {
      if (!u || u.role !== 'superadmin') { router.push('/'); return; }
      loadStats();
    });
    const interval = setInterval(loadStats, 30_000);
    return () => clearInterval(interval);
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRetry(requestId: number) {
    setRetrying(requestId);
    setRetrySuccess(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/retry-order`, { method: 'POST' });
      if (res.ok) {
        setRetrySuccess(requestId);
        setTimeout(() => setRetrySuccess(null), 3000);
        loadStats();
      }
    } finally {
      setRetrying(null);
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-500/20 text-green-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      case 'timeout': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Monitoring des commandes</h1>
            <p className="text-sm text-gray-400 mt-1">Suivi en temps réel des jobs de commande automatique</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/superadmin')}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              ← Super Admin
            </button>
            <button
              onClick={() => { setLoading(true); loadStats(); }}
              className="text-sm bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition"
            >
              Actualiser
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
              <p className="text-xs text-gray-400 mb-1">Total</p>
              <p className="text-2xl font-bold text-white">{stats.totalJobs}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl border border-yellow-800/50 p-4">
              <p className="text-xs text-yellow-400 mb-1">En attente</p>
              <p className="text-2xl font-bold text-yellow-400">{stats.pendingJobs}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl border border-blue-800/50 p-4">
              <p className="text-xs text-blue-400 mb-1">En cours</p>
              <p className="text-2xl font-bold text-blue-400">{stats.processingJobs}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl border border-green-800/50 p-4">
              <p className="text-xs text-green-400 mb-1">Terminés</p>
              <p className="text-2xl font-bold text-green-400">{stats.doneJobs}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl border border-red-800/50 p-4">
              <p className="text-xs text-red-400 mb-1">Échoués</p>
              <p className="text-2xl font-bold text-red-400">{stats.failedJobs}</p>
            </div>
          </div>
        )}

        {/* Failed Jobs */}
        {stats && stats.failedJobsList.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-red-800/40 p-5 mb-8">
            <h2 className="font-semibold text-lg text-red-400 mb-4">Jobs échoués</h2>
            <div className="space-y-3">
              {stats.failedJobsList.map(job => (
                <div key={job.id} className="bg-gray-800 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {job.product || `Requête #${job.request_id}`}
                      {job.quantity != null && <span className="text-gray-400 font-normal"> x{job.quantity}</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {job.company_name || `Compagnie #${job.company_id}`} — {job.attempts} tentative{job.attempts > 1 ? 's' : ''}
                    </p>
                    {job.last_error && (
                      <p className="text-xs text-red-400/80 mt-1 truncate" title={job.last_error}>
                        {job.last_error}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(job.created_at).toLocaleString('fr-CA')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRetry(job.request_id)}
                    disabled={retrying === job.request_id}
                    className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition"
                  >
                    {retrying === job.request_id ? '...' : retrySuccess === job.request_id ? 'Relancé !' : 'Relancer'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Attempts Table */}
        {stats && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h2 className="font-semibold text-lg mb-4">Tentatives récentes</h2>
            {stats.recentAttempts.length === 0 ? (
              <p className="text-gray-500 text-sm italic">Aucune tentative enregistrée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-800">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">Produit</th>
                      <th className="pb-2 pr-4">Fournisseur</th>
                      <th className="pb-2 pr-4">Statut</th>
                      <th className="pb-2 pr-4">Durée</th>
                      <th className="pb-2">Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentAttempts.map(a => (
                      <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2.5 pr-4 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(a.attempted_at).toLocaleString('fr-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 pr-4 text-white truncate max-w-[200px]">
                          {a.product || `#${a.request_id || '—'}`}
                        </td>
                        <td className="py-2.5 pr-4 text-gray-300 capitalize">
                          {a.supplier}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(a.status)}`}>
                            {a.status === 'success' ? 'Succès' : a.status === 'failed' ? 'Échoué' : 'Timeout'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-gray-400">
                          {a.duration_ms != null ? `${(a.duration_ms / 1000).toFixed(1)}s` : '—'}
                        </td>
                        <td className="py-2.5 text-xs text-red-400/70 truncate max-w-[250px]" title={a.error_message || ''}>
                          {a.error_message || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
