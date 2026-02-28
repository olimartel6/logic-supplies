'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { Suspense } from 'react';

interface Request {
  id: number;
  product: string;
  quantity: number;
  unit: string;
  job_site_name: string;
  electrician_name: string;
  urgency: number;
  note: string;
  status: string;
  office_comment: string;
  created_at: string;
  lumen_order_status: string | null;
  lumen_order_id: string | null;
  supplier: string | null;
  order_supplier: string | null;
  unit_price: number | null;
}
interface User { name: string; role: string; inventoryEnabled?: boolean; }

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approuvé', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejeté', color: 'bg-red-100 text-red-800' },
};

function ApprovalsContent() {
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [largeOrderThreshold, setLargeOrderThreshold] = useState<number>(2000);
  const [deliveryOverride, setDeliveryOverride] = useState<'office' | 'jobsite' | null>(null);
  const [paymentConfigured, setPaymentConfigured] = useState(false);
  const [defaultDelivery, setDefaultDelivery] = useState<'office' | 'jobsite'>('office');

  // "Finaliser la commande" modal state
  const [orderModal, setOrderModal] = useState<Request | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  function closeOrderModal() {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setOrderModal(null);
    setPdfBlobUrl(null);
    setPdfLoading(false);
    setSendingEmail(false);
    setEmailSent(false);
    setSendError(null);
  }
  const router = useRouter();
  const searchParams = useSearchParams();
  const showAll = searchParams.get('all') === '1';

  const loadRequests = useCallback(async () => {
    const res = await fetch('/api/requests');
    const data = await res.json();
    setRequests(data);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => {
      if (!u) return;
      if (u.role === 'electrician') { router.push('/my-requests'); return; }
      setUser(u);
    });
    loadRequests();
    fetch('/api/supplier/preference').then(r => r.json()).then((d: { largeOrderThreshold?: number; defaultDelivery?: string }) => {
      if (d.largeOrderThreshold != null) setLargeOrderThreshold(d.largeOrderThreshold);
      if (d.defaultDelivery) {
        setDefaultDelivery(d.defaultDelivery as 'office' | 'jobsite');
        setDeliveryOverride(d.defaultDelivery as 'office' | 'jobsite');
      }
    }).catch(() => {});
    fetch('/api/settings/payment').then(r => r.json()).then((d: any) => setPaymentConfigured(d.configured)).catch(() => {});
  }, [router, loadRequests]);

  async function handleDelete(id: number) {
    if (!window.confirm('Supprimer cette demande ?')) return;
    setDeletingId(id);
    await fetch(`/api/requests/${id}`, { method: 'DELETE' });
    await loadRequests();
    setDeletingId(null);
  }

  async function handleDecision(status: 'approved' | 'rejected') {
    if (!selected) return;
    setLoading(true);
    const approvedRequest = selected;
    await fetch(`/api/requests/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, office_comment: comment, delivery_override: deliveryOverride }),
    });
    await loadRequests();
    setSelected(null);
    setComment('');
    setLoading(false);
    if (status === 'approved' && approvedRequest.supplier === 'lumen') {
      setOrderModal(approvedRequest);
    }
  }

  async function handlePreviewPdf() {
    if (!orderModal) return;
    setPdfLoading(true);
    const res = await fetch(`/api/purchase-order/${orderModal.id}`);
    if (!res.ok) { setPdfLoading(false); return; }
    const blob = await res.blob();
    setPdfBlobUrl(URL.createObjectURL(blob));
    setPdfLoading(false);
  }

  async function handleSendEmail() {
    if (!orderModal) return;
    setSendingEmail(true);
    setSendError(null);
    const res = await fetch(`/api/purchase-order/${orderModal.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send' }),
    });
    const data = await res.json();
    if (data.success) setEmailSent(true);
    else setSendError(data.error || 'Erreur inconnue');
    setSendingEmail(false);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  const displayed = showAll ? requests : requests.filter(r => r.status === 'pending');

  return (
    <div className="pb-20">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">
            {showAll ? 'Toutes les demandes' : 'En attente d\'approbation'}
          </h1>
          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
            {displayed.length}
          </span>
        </div>

        {displayed.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto mb-3 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
            <p>{showAll ? 'Aucune demande' : 'Aucune demande en attente'}</p>
          </div>
        )}

        <div className="space-y-3">
          {displayed.map(r => (
            <div
              key={r.id}
              onClick={() => { setSelected(r); setComment(''); }}
              className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-left hover:border-blue-300 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {r.urgency ? <span className="text-red-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg></span> : null}
                    <p className="font-semibold text-gray-900">{r.product}</p>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{r.quantity} {r.unit} · {r.job_site_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" /></svg>{r.electrician_name}</span>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('fr-CA')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusConfig[r.status]?.color}`}>
                    {statusConfig[r.status]?.label}
                  </span>
                  {showAll && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(r.id); }}
                      disabled={deletingId === r.id}
                      className="text-gray-300 hover:text-red-500 transition disabled:opacity-40 p-1 rounded-lg hover:bg-red-50"
                      title="Supprimer"
                    >
                      {deletingId === r.id
                        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* "Finaliser la commande" modal — triggered after approval */}
      {orderModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30 p-4" onClick={closeOrderModal}>
          <div
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* PDF fullscreen preview */}
            {pdfBlobUrl ? (
              <div className="flex flex-col h-[90vh]">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                  <button
                    onClick={() => { URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null); setEmailSent(false); setSendError(null); }}
                    className="text-blue-600 text-sm font-medium hover:underline"
                  >
                    ← Retour
                  </button>
                  <span className="text-sm font-semibold text-gray-800 flex-1 truncate">
                    Bon de commande — {orderModal.job_site_name}
                  </span>
                  <button onClick={closeOrderModal} className="text-gray-400 text-2xl leading-none">×</button>
                </div>
                <iframe
                  src={pdfBlobUrl}
                  className="flex-1 w-full border-0"
                  title="Bon de commande"
                />
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                  <a
                    href={pdfBlobUrl}
                    download={`bon-de-commande-PO-${orderModal.id}.pdf`}
                    className="flex-1 text-center border border-gray-300 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 inline mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    Télécharger le PDF
                  </a>
                  <button
                    onClick={handleSendEmail}
                    disabled={sendingEmail || emailSent}
                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
                  >
                    {sendingEmail ? 'Envoi...' : emailSent ? 'Email envoyé !' : <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 inline mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>Envoyer au rep Lumen</>}
                  </button>
                </div>
                {sendError && <p className="px-5 pb-3 text-red-600 text-xs">{sendError}</p>}
              </div>
            ) : (
              /* Main choice modal */
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Finaliser la commande</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Veuillez vérifier le bon de commande avant de l&apos;envoyer au fournisseur.
                    </p>
                  </div>
                  <button onClick={closeOrderModal} className="text-gray-400 text-2xl leading-none ml-3">×</button>
                </div>

                {/* Request summary */}
                <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-1">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                    {orderModal.product}<span className="font-normal text-gray-600"> — {orderModal.quantity} {orderModal.unit}</span>
                  </p>
                  <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
                    {orderModal.job_site_name}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="space-y-3 mb-5">
                  <button
                    onClick={handlePreviewPdf}
                    disabled={pdfLoading}
                    className="w-full border-2 border-blue-200 bg-blue-50 text-blue-700 py-3.5 rounded-2xl text-sm font-semibold hover:bg-blue-100 disabled:opacity-60 transition flex items-center justify-center gap-2"
                  >
                    {pdfLoading ? 'Génération du PDF...' : <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>Voir le bon de commande</>}
                  </button>
                  <button
                    onClick={handleSendEmail}
                    disabled={sendingEmail || emailSent}
                    className="w-full bg-blue-600 text-white py-3.5 rounded-2xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition flex items-center justify-center gap-2"
                  >
                    {sendingEmail ? 'Envoi en cours...' : emailSent ? 'Email envoyé !' : <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>Envoyer au représentant Lumen</>}
                  </button>
                  {sendError && <p className="text-red-600 text-xs px-1">{sendError}</p>}
                </div>

                {/* EDI future option */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-400 mb-2 text-center">Intégration à venir</p>
                  <button
                    disabled
                    title="Intégration EDI/PunchOut bientôt disponible"
                    className="w-full border border-gray-200 text-gray-400 py-3 rounded-2xl text-sm font-medium cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>
                    Commander automatiquement (EDI / PunchOut)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail / approval modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-20" onClick={() => { setSelected(null); }}>
          <div className="bg-white rounded-t-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex-1 overflow-y-auto p-6 pb-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                {selected.urgency && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-500 flex-shrink-0">
                    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                  </svg>
                )}
                {selected.product}
              </h2>
              <button onClick={() => { setSelected(null); }} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="space-y-3 text-sm mb-6">
              <div className="flex justify-between"><span className="text-gray-500">Électricien</span><span className="font-medium">{selected.electrician_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Quantité</span><span>{selected.quantity} {selected.unit}</span></div>
              {selected.unit_price != null && (
                <div className="flex justify-between items-center bg-green-50 border border-green-200 rounded-xl px-3 py-2 -mx-1">
                  <span className="text-gray-600 text-xs">Prix unitaire</span>
                  <span className="text-sm font-medium text-gray-700">{selected.unit_price.toFixed(2)} $</span>
                </div>
              )}
              {selected.unit_price != null && (
                <div className="flex justify-between items-center bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 -mx-1">
                  <span className="text-gray-700 font-semibold text-sm">Total estimé</span>
                  <span className="text-base font-bold text-blue-700">
                    {(selected.unit_price * selected.quantity).toFixed(2)} $
                    {selected.unit_price * selected.quantity > largeOrderThreshold && (
                      <span className="ml-2 text-xs font-medium text-amber-600 inline-flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>
                        Grande commande
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">Chantier</span><span>{selected.job_site_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Statut actuel</span><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[selected.status]?.color}`}>{statusConfig[selected.status]?.label}</span></div>
              {selected.note && <div><span className="text-gray-500">Note</span><p className="mt-1 text-gray-800">{selected.note}</p></div>}
              {selected.lumen_order_status && (() => {
                const sup = selected.order_supplier || selected.supplier || '';
                const supLabel = sup === 'canac' ? 'Canac' : sup === 'homedepot' ? 'Home Depot' : sup === 'guillevin' ? 'Guillevin' : 'Lumen';
                const cartUrl = sup === 'canac' ? 'https://www.canac.ca/panier' : sup === 'homedepot' ? 'https://www.homedepot.ca/checkout/cart' : sup === 'guillevin' ? 'https://www.guillevin.com/cart' : 'https://www.lumen.ca/en/cart';
                return (
                  <>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                      <span className="text-gray-500">{supLabel}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        selected.lumen_order_status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        selected.lumen_order_status === 'pending' ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {selected.lumen_order_status === 'confirmed' ? `Commandé #${selected.lumen_order_id}` :
                         selected.lumen_order_status === 'pending' ? 'Dans le panier' :
                         'Échec commande'}
                      </span>
                    </div>
                    {selected.lumen_order_status === 'pending' && (
                      <a href={cartUrl} target="_blank" rel="noreferrer"
                        className="block text-center text-sm text-orange-600 underline mt-1">
                        → Finaliser sur {supLabel === 'Home Depot' ? 'homedepot.ca' : supLabel === 'Canac' ? 'canac.ca' : 'lumen.ca'}
                      </a>
                    )}
                  </>
                );
              })()}
            </div>

            {selected.status === 'pending' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire (optionnel)</label>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="ex: Réduis à 3 boîtes, on en a en stock"
                    rows={2}
                  />
                </div>
                {paymentConfigured && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-1.5">Livraison</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDeliveryOverride('office')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition ${(deliveryOverride ?? defaultDelivery) === 'office' ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'border-gray-200 text-gray-500'}`}
                      >
                        Bureau
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryOverride('jobsite')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition ${(deliveryOverride ?? defaultDelivery) === 'jobsite' ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'border-gray-200 text-gray-500'}`}
                      >
                        Chantier
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Action buttons — outside scroll so always visible */}
          {selected.status === 'pending' && (
            <div className="flex gap-3 px-6 pb-6 pt-4 border-t border-gray-100 bg-white">
              <button
                onClick={() => handleDecision('rejected')}
                disabled={loading}
                className="flex-1 bg-red-50 text-red-600 border border-red-200 py-3 rounded-2xl font-semibold hover:bg-red-100 disabled:opacity-50 transition"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  Rejeter
                </span>
              </button>
              <button
                onClick={() => handleDecision('approved')}
                disabled={loading}
                className="flex-1 bg-green-600 text-white py-3 rounded-2xl font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  Approuver
                </span>
              </button>
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>}>
      <ApprovalsContent />
    </Suspense>
  );
}
