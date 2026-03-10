'use client';
import { useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import { useAuth } from '@/lib/useAuth';

interface Stats {
  monthlyExpenses: { month: string; total: number }[];
  topProducts: { product: string; supplier: string; order_count: number; total_quantity: number }[];
  supplierDistribution: { supplier: string; order_count: number }[];
  kpis: { ordersThisMonth: number; pendingRequests: number; estimatedSavings: number };
}

const SUPPLIER_COLORS: Record<string, string> = {
  lumen: 'bg-blue-500', canac: 'bg-red-500', homedepot: 'bg-orange-500',
  guillevin: 'bg-green-500', jsv: 'bg-purple-500', westburne: 'bg-cyan-500',
  nedco: 'bg-pink-500', futech: 'bg-amber-500', deschenes: 'bg-teal-500',
  bmr: 'bg-yellow-500', rona: 'bg-indigo-500', inconnu: 'bg-slate-500',
};

export default function DashboardPage() {
  const user = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!user) return null;
  if (user.role === 'electrician') return <p className="p-8 text-white">Non autorisé</p>;

  return (
    <div className="min-h-screen bg-slate-900 text-white md:ml-56">
      <NavBar role={user.role} name={user.name} />
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
