'use client';
import { useEffect, useState, useCallback } from 'react';
import NavBar from '@/components/NavBar';
import { useAuth } from '@/lib/useAuth';

interface Stats {
  monthlyExpenses: { month: string; total: number }[];
  topProducts: { product: string; supplier: string; order_count: number; total_quantity: number }[];
  supplierDistribution: { supplier: string; order_count: number }[];
  kpis: { ordersThisMonth: number; pendingRequests: number; estimatedSavings: number };
}

interface JobSiteBudget {
  id: number; name: string; address: string; status: string;
  budget_total: number | null; budget_committed: number;
  unseen_alerts: number;
}
interface BudgetAlert {
  id: number; job_site_id: number; job_site_name: string;
  type: '80_percent' | '100_percent' | 'large_order';
  amount: number; message: string; seen: number; created_at: string;
}

const SUPPLIER_COLORS: Record<string, string> = {
  lumen: 'bg-blue-500', canac: 'bg-red-500', homedepot: 'bg-orange-500',
  guillevin: 'bg-green-500', jsv: 'bg-purple-500', westburne: 'bg-cyan-500',
  nedco: 'bg-pink-500', futech: 'bg-amber-500', deschenes: 'bg-teal-500',
  bmr: 'bg-yellow-500', rona: 'bg-indigo-500', inconnu: 'bg-slate-500',
};

const fmt = (n: number) =>
  n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';

function getPct(committed: number, total: number) {
  return Math.min((committed / total) * 100, 999);
}

function budgetBarColor(p: number) {
  if (p >= 100) return 'bg-red-500';
  if (p >= 80) return 'bg-orange-400';
  if (p >= 60) return 'bg-yellow-400';
  return 'bg-green-500';
}

function alertIcon(type: string) {
  if (type === '100_percent') return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-500">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
    </svg>
  );
  if (type === '80_percent') return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-yellow-500">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-orange-500">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  );
}

function alertLabel(type: string) {
  if (type === '100_percent') return 'Budget dépassé';
  if (type === '80_percent') return '80% atteint';
  return 'Grande commande';
}

export default function DashboardPage() {
  const user = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sites, setSites] = useState<JobSiteBudget[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadBudget = useCallback(async () => {
    const [budgetRes, alertsRes] = await Promise.all([
      fetch('/api/budget'),
      fetch('/api/budget/alerts'),
    ]);
    const budgetData = await budgetRes.json();
    const alertsData = await alertsRes.json();
    setSites(budgetData.sites || []);
    setAlerts(Array.isArray(alertsData) ? alertsData : []);
  }, []);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
    loadBudget();
    fetch('/api/budget/alerts/seen', { method: 'PATCH' }).catch(() => {});
    fetch('/api/budget/export').then(r => r.json()).then((m: string[]) => {
      if (Array.isArray(m) && m.length > 0) {
        setMonths(m);
        setSelectedMonth(m[0]);
      }
    }).catch(() => {});
  }, [loadBudget]);

  async function handleSaveBudget(id: number) {
    setSaving(true);
    await fetch(`/api/budget/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget_total: editValue === '' ? null : parseFloat(editValue) }),
    });
    setEditingId(null);
    setEditValue('');
    setSaving(false);
    await loadBudget();
  }

  async function handleExport() {
    if (!selectedMonth) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/budget/export?month=${selectedMonth}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportError(data.error || 'Erreur lors de la génération');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logicsupplies-commandes-${selectedMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Erreur réseau');
    } finally {
      setExporting(false);
    }
  }

  function monthLabel(m: string) {
    const [y, mo] = m.split('-');
    return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
  }

  if (!user) return null;
  if (user.role === 'worker') return <p className="p-8 text-white">Non autorisé</p>;

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-20 md:pb-6 md:ml-56">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} marketingEnabled={user.marketingEnabled} />
      <main className="p-4 md:p-8 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Tableau de bord</h1>

        {!stats ? (
          <p className="text-slate-400">Chargement...</p>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <KpiCard label="Commandes ce mois" value={stats.kpis.ordersThisMonth} />
              <KpiCard label="Demandes en attente" value={stats.kpis.pendingRequests} accent={stats.kpis.pendingRequests > 0 ? 'text-yellow-400' : undefined} />
              <KpiCard label="Économies estimées" value={`${stats.kpis.estimatedSavings.toFixed(2)} $`} accent="text-green-400" />
            </div>

            {/* Monthly Expenses Bar Chart */}
            <section className="bg-slate-800 rounded-xl p-5 mb-8">
              <h2 className="text-lg font-semibold mb-4">Dépenses mensuelles</h2>
              {stats.monthlyExpenses.length === 0 ? (
                <p className="text-slate-400 text-sm">Aucune donnée</p>
              ) : (
                <div className="flex items-end gap-2 h-40">
                  {(() => {
                    const max = Math.max(...stats.monthlyExpenses.map(m => m.total || 0), 1);
                    return stats.monthlyExpenses.map(m => (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-slate-400">{((m.total || 0)).toFixed(0)} $</span>
                        <div
                          className="w-full bg-blue-500 rounded-t-md min-h-[4px] transition-all"
                          style={{ height: `${((m.total || 0) / max) * 100}%` }}
                        />
                        <span className="text-xs text-slate-500">{m.month.slice(5)}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Top Products */}
              <section className="bg-slate-800 rounded-xl p-5">
                <h2 className="text-lg font-semibold mb-4">Top 10 produits</h2>
                <div className="space-y-2">
                  {stats.topProducts.map((p, i) => {
                    const max = stats.topProducts[0]?.order_count || 1;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-5">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{p.product}</div>
                          <div
                            className="h-1.5 bg-blue-500/60 rounded-full mt-1"
                            style={{ width: `${(p.order_count / max) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{p.order_count}x</span>
                      </div>
                    );
                  })}
                  {stats.topProducts.length === 0 && <p className="text-slate-400 text-sm">Aucune donnée</p>}
                </div>
              </section>

              {/* Supplier Distribution */}
              <section className="bg-slate-800 rounded-xl p-5">
                <h2 className="text-lg font-semibold mb-4">Distribution par fournisseur</h2>
                <div className="space-y-2">
                  {(() => {
                    const total = stats.supplierDistribution.reduce((s, d) => s + d.order_count, 0) || 1;
                    return stats.supplierDistribution.map((d, i) => {
                      const pct = Math.round((d.order_count / total) * 100);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full shrink-0 ${SUPPLIER_COLORS[d.supplier] || 'bg-slate-500'}`} />
                          <span className="text-sm capitalize flex-1">{d.supplier}</span>
                          <div className="w-24">
                            <div
                              className={`h-2 rounded-full ${SUPPLIER_COLORS[d.supplier] || 'bg-slate-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                        </div>
                      );
                    });
                  })()}
                  {stats.supplierDistribution.length === 0 && <p className="text-slate-400 text-sm">Aucune donnée</p>}
                </div>
              </section>
            </div>
          </>
        )}

        {/* Excel Export */}
        {months.length > 0 && (
          <section className="bg-slate-800 rounded-xl p-5 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-green-400 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
              <div>
                <h2 className="font-semibold text-sm">Rapport mensuel Excel</h2>
                <p className="text-xs text-slate-400">Tableau détaillé + graphiques par fournisseur et chantier</p>
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                disabled={exporting}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
              >
                {months.map(m => (
                  <option key={m} value={m}>
                    {monthLabel(m).charAt(0).toUpperCase() + monthLabel(m).slice(1)}
                  </option>
                ))}
              </select>
              <button
                onClick={handleExport}
                disabled={exporting || !selectedMonth}
                className="bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition whitespace-nowrap flex items-center gap-2"
              >
                {exporting ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Génération...
                  </>
                ) : (
                  <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>Exporter Excel</>
                )}
              </button>
            </div>
            {exporting && (
              <p className="text-xs text-slate-400 mt-2 text-center">
                Génération des graphiques en cours... (15–30 secondes)
              </p>
            )}
            {exportError && (
              <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" /></svg>
                {exportError}
              </p>
            )}
          </section>
        )}

        {/* Budget des projets */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Budget des projets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sites.length === 0 && (
              <p className="text-slate-400 text-sm col-span-full text-center py-8">Aucun projet actif</p>
            )}
            {sites.map(site => {
              const hasBudget = site.budget_total != null && site.budget_total > 0;
              const p = hasBudget ? getPct(site.budget_committed, site.budget_total!) : 0;
              const remaining = hasBudget ? site.budget_total! - site.budget_committed : null;
              const isEditing = editingId === site.id;

              return (
                <div key={site.id} className="bg-slate-800 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{site.name}</h3>
                      {site.address && <p className="text-xs text-slate-400">{site.address}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {site.unseen_alerts > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {site.unseen_alerts}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setEditingId(site.id);
                          setEditValue(site.budget_total?.toString() ?? '');
                        }}
                        className="text-xs text-blue-400 hover:underline font-medium"
                      >
                        {hasBudget ? 'Modifier' : 'Définir le budget'}
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          placeholder="ex: 10000"
                          className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                          autoFocus
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      </div>
                      <button
                        onClick={() => handleSaveBudget(site.id)}
                        disabled={saving}
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? '...' : 'OK'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="border border-slate-600 px-3 py-2 rounded-xl text-sm hover:bg-slate-700"
                      >
                        X
                      </button>
                    </div>
                  )}

                  {hasBudget ? (
                    <>
                      <div className="w-full bg-slate-700 rounded-full h-3 mb-2 overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all ${budgetBarColor(p)}`}
                          style={{ width: `${Math.min(p, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">{fmt(site.budget_committed)} engagé</span>
                        <span className={`font-bold ${p >= 100 ? 'text-red-400' : p >= 80 ? 'text-orange-400' : p >= 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {Math.round(p)}%
                        </span>
                        <span className="text-slate-400">{fmt(site.budget_total!)} total</span>
                      </div>
                      <div className={`mt-1 text-xs font-medium ${remaining! < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {remaining! < 0
                          ? `Dépassé de ${fmt(Math.abs(remaining!))}`
                          : `Restant : ${fmt(remaining!)}`}
                      </div>
                    </>
                  ) : (
                    <div>
                      {site.budget_committed > 0 && (
                        <p className="text-sm text-slate-300 mb-1">{fmt(site.budget_committed)} engagé</p>
                      )}
                      <p className="text-sm text-slate-500 italic">Aucun budget défini</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Historique alertes */}
        {alerts.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              Historique des alertes
            </h2>
            <div className="space-y-2">
              {alerts.map(a => (
                <div
                  key={a.id}
                  className={`rounded-xl p-3 flex items-start gap-3 ${a.seen ? 'bg-slate-800/50' : 'bg-slate-800 border border-slate-700'}`}
                >
                  <span className="leading-none mt-0.5 flex-shrink-0">{alertIcon(a.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${a.seen ? 'text-slate-400' : 'text-white'}`}>
                      {a.message}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.job_site_name} · {alertLabel(a.type)} · {new Date(a.created_at).toLocaleDateString('fr-CA')}
                    </p>
                  </div>
                  {a.amount != null && (
                    <span className="text-sm font-semibold text-slate-300 flex-shrink-0">
                      {fmt(a.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5">
      <p className="text-sm text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent || 'text-white'}`}>{value}</p>
    </div>
  );
}
