'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';

interface Request {
  id: number;
  product: string;
  quantity: number;
  unit: string;
  job_site_name: string;
  urgency: number;
  note: string;
  status: string;
  office_comment: string;
  created_at: string;
}

interface User {
  name: string;
  role: string;
  inventoryEnabled?: boolean;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approuvé', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejeté', color: 'bg-red-100 text-red-800' },
};

export default function MyRequestsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => {
      if (!u) return;
      if (u.role !== 'electrician') { router.push('/approvals'); return; }
      setUser(u);
    });
    fetch('/api/requests').then(r => r.json()).then(setRequests);
  }, [router]);

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  return (
    <div className="pb-20">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Mes demandes</h1>
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
            <p>Aucune demande pour l&apos;instant</p>
            <button onClick={() => router.push('/new-request')} className="mt-4 text-blue-600 font-medium">
              Créer ma première demande →
            </button>
          </div>
        )}

        <div className="space-y-3">
          {requests.map(r => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-left hover:border-blue-300 hover:shadow-md transition"
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
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusConfig[r.status]?.color}`}>
                  {statusConfig[r.status]?.label}
                </span>
              </div>
            </button>
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
              <div className="flex justify-between"><span className="text-gray-500">Chantier</span><span>{selected.job_site_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Urgent</span><span className={selected.urgency ? 'text-red-600 font-medium flex items-center gap-1' : ''}>{selected.urgency ? (<><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>Oui</>) : 'Non'}</span></div>
              {selected.note && <div><span className="text-gray-500">Note</span><p className="mt-1">{selected.note}</p></div>}
              {selected.office_comment && (
                <div className="bg-red-50 rounded-xl p-3">
                  <p className="text-xs text-red-600 font-medium">Commentaire du bureau</p>
                  <p className="mt-1 text-red-800">{selected.office_comment}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
