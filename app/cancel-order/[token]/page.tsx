'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function CancelOrderPage() {
  const { token } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/supplier/cancel/${token}`).then(r => r.json()).then(data => {
      if (data.error) { setError(data.error); }
      else { setOrder(data.order); setExpired(data.expired); }
      setLoading(false);
    });
  }, [token]);

  async function handleCancel() {
    setCancelling(true);
    const res = await fetch(`/api/supplier/cancel/${token}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) { setCancelled(true); }
    else { setError(data.error || "Erreur lors de l'annulation"); }
    setCancelling(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Chargement...</p></div>;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <div className="text-4xl mb-4">⚡</div>
        <h1 className="font-bold text-gray-900 text-lg mb-6">logicSupplies — Annulation de commande</h1>

        {cancelled && (
          <>
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-green-700">Commande annulée avec succès</p>
          </>
        )}

        {expired && !cancelled && (
          <>
            <div className="text-4xl mb-3">⏰</div>
            <p className="font-semibold text-gray-900">Délai dépassé</p>
            <p className="text-sm text-gray-500 mt-2">Le délai d&apos;annulation de 2 heures est écoulé. Contactez Lumen directement.</p>
          </>
        )}

        {error && !cancelled && (
          <>
            <div className="text-4xl mb-3">❌</div>
            <p className="text-red-600 font-medium">{error}</p>
          </>
        )}

        {order && !expired && !cancelled && !error && (
          <>
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left text-sm space-y-2">
              <p><span className="text-gray-500">Produit:</span> <span className="font-medium">{order.product}</span></p>
              <p><span className="text-gray-500">Quantité:</span> <span className="font-medium">{order.quantity} {order.unit}</span></p>
              <p><span className="text-gray-500">Commande Lumen:</span> <span className="font-medium">#{order.supplier_order_id}</span></p>
            </div>
            <p className="text-sm text-gray-500 mb-4">Voulez-vous annuler cette commande Lumen ?</p>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full bg-red-600 text-white py-3 rounded-2xl font-semibold hover:bg-red-700 disabled:opacity-50 transition"
            >
              {cancelling ? '⏳ Annulation en cours...' : "❌ Confirmer l'annulation"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
