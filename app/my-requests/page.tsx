'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { useLang, useT } from '@/lib/LanguageContext';
import type { Lang } from '@/lib/i18n';

interface Request {
  id: number;
  product: string;
  quantity: number;
  unit: string;
  job_site_id: number | null;
  job_site_name: string;
  urgency: number;
  note: string;
  status: string;
  office_comment: string;
  created_at: string;
  tracking_status: string | null;
  picked_up_by: number | null;
  picked_up_by_name: string | null;
  picked_up_at: string | null;
  picked_up_job_site_name: string | null;
  supplier_modified_by: string | null;
}

interface User {
  name: string;
  role: string;
  inventoryEnabled?: boolean;
  marketingEnabled?: boolean;
}

export default function MyRequestsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const router = useRouter();
  const { setLang } = useLang();
  const t = useT();

  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: t('status_pending'), color: 'bg-yellow-100 text-yellow-800' },
    approved: { label: t('status_approved'), color: 'bg-green-100 text-green-800' },
    rejected: { label: t('status_rejected'), color: 'bg-red-100 text-red-800' },
  };

  function loadRequests() {
    fetch('/api/requests').then(r => r.json()).then(data => setRequests(data.requests || data));
  }

  async function handlePickup(requestId: number, jobSiteId: number | null) {
    const res = await fetch(`/api/requests/${requestId}/pickup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_site_id: jobSiteId }),
    });
    if (res.ok) {
      loadRequests();
    }
  }

  useEffect(() => {
    fetch('/api/my-requests/init').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(data => {
      if (!data) return;
      if (data.user.role !== 'worker') { router.push('/approvals'); return; }
      setUser(data.user);
      setLang((data.user.language as Lang) || 'fr');
      setRequests(data.requests || []);
    });
  }, [router]);

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>{t('loading')}</p></div>;

  return (
    <div className="pb-20">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} marketingEnabled={user.marketingEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">{t('my_requests_title')}</h1>
          <button
            onClick={() => router.push('/new-request')}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
          >
            + Nouvelle
          </button>
        </div>

        {requests.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="flex justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-12 h-12 text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <p>{t('no_requests')}</p>
            <button onClick={() => router.push('/new-request')} className="mt-4 text-blue-600 font-medium">
              Créer ma première demande →
            </button>
          </div>
        )}

        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:border-blue-300 hover:shadow-md transition">
              <div
                onClick={() => setSelected(r)}
                className="cursor-pointer text-left"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                      {r.urgency && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-500 flex-shrink-0">
                          <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                        </svg>
                      )}
                      {r.product}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{r.quantity} {r.unit} · {r.job_site_name}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString('fr-CA')}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusConfig[r.status]?.color}`}>
                      {statusConfig[r.status]?.label}
                    </span>
                    {r.status === 'approved' && r.tracking_status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        r.tracking_status === 'ordered' ? 'bg-blue-100 text-blue-800' :
                        r.tracking_status === 'shipped' ? 'bg-purple-100 text-purple-800' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {r.tracking_status === 'ordered' ? '📦 Commandé' :
                         r.tracking_status === 'shipped' ? '🚚 Expédié' :
                         <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline-block align-text-bottom mr-0.5"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg> Reçu</>}
                      </span>
                    )}
                    {r.supplier_modified_by && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                        Modifié par {r.supplier_modified_by}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {r.status === 'approved' && (
                <button
                  onClick={() => router.push(`/new-request?reorder=1&product=${encodeURIComponent(r.product)}&quantity=${r.quantity}&unit=${encodeURIComponent(r.unit)}&job_site_id=${r.job_site_id || ''}`)}
                  className="mt-2 w-full text-center text-xs text-blue-600 border border-blue-200 rounded-xl py-1.5 hover:bg-blue-50 transition"
                >
                  Commander à nouveau
                </button>
              )}
              {r.status === 'approved' && r.tracking_status === 'received' && !r.picked_up_by && (
                <button
                  onClick={() => handlePickup(r.id, r.job_site_id)}
                  className="mt-2 w-full text-center text-sm text-emerald-700 border-2 border-emerald-200 bg-emerald-50 rounded-xl py-2.5 font-semibold hover:bg-emerald-100 transition"
                >
                  📦 Récupérer la commande
                </button>
              )}
              {r.picked_up_by && r.picked_up_at && (
                <p className="mt-2 text-xs text-gray-500">
                  ✅ Récupéré le {new Date(r.picked_up_at).toLocaleDateString('fr-CA')}
                  {r.picked_up_job_site_name && ` pour ${r.picked_up_job_site_name}`}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-20" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-t-3xl w-full p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{selected.product}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Statut</span><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[selected.status]?.color}`}>{statusConfig[selected.status]?.label}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Quantité</span><span>{selected.quantity} {selected.unit}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('job_site')}</span><span>{selected.job_site_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('urgency')}</span><span className={selected.urgency ? 'text-red-600 font-medium flex items-center gap-1' : ''}>{selected.urgency ? (<><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>Oui</>) : 'Non'}</span></div>
              {selected.note && <div><span className="text-gray-500">Note</span><p className="mt-1">{selected.note}</p></div>}
              {selected.office_comment && (
                <div className="bg-red-50 rounded-xl p-3">
                  <p className="text-xs text-red-600 font-medium">{t('office_comment')}</p>
                  <p className="mt-1 text-red-800">{selected.office_comment}</p>
                </div>
              )}
              {selected.status === 'approved' && selected.tracking_status && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Suivi</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    selected.tracking_status === 'ordered' ? 'bg-blue-100 text-blue-800' :
                    selected.tracking_status === 'shipped' ? 'bg-purple-100 text-purple-800' :
                    'bg-emerald-100 text-emerald-800'
                  }`}>
                    {selected.tracking_status === 'ordered' ? '📦 Commandé' :
                     selected.tracking_status === 'shipped' ? '🚚 Expédié' :
                     <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline-block align-text-bottom mr-0.5"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg> Reçu</>}
                  </span>
                </div>
              )}
              {selected.supplier_modified_by && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-700 font-medium">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline-block align-text-bottom mr-1"><path d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" /></svg>
                    Fournisseur modifié par {selected.supplier_modified_by}
                  </p>
                </div>
              )}
              {selected.picked_up_by && selected.picked_up_at && (
                <div className="bg-emerald-50 rounded-xl p-3">
                  <p className="text-xs text-emerald-700 font-medium">
                    ✅ Récupéré le {new Date(selected.picked_up_at).toLocaleDateString('fr-CA')}
                    {selected.picked_up_by_name && ` par ${selected.picked_up_by_name}`}
                    {selected.picked_up_job_site_name && ` pour ${selected.picked_up_job_site_name}`}
                  </p>
                </div>
              )}
              {selected.status === 'approved' && selected.tracking_status === 'received' && !selected.picked_up_by && (
                <button
                  onClick={() => { handlePickup(selected.id, selected.job_site_id); setSelected(null); }}
                  className="w-full text-center text-sm text-emerald-700 border-2 border-emerald-200 bg-emerald-50 rounded-xl py-2.5 font-semibold hover:bg-emerald-100 transition"
                >
                  📦 Récupérer la commande
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
