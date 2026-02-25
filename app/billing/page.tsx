'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';

interface User {
  name: string;
  role: string;
  inventoryEnabled?: boolean;
  subscriptionStatus?: string;
  superadminCreated?: boolean;
}

export default function BillingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => {
      if (!u) return;
      if (u.role !== 'admin') { router.push('/approvals'); return; }
      setUser(u);
    });
  }, [router]);

  async function handleManageSubscription() {
    setLoading(true);
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setLoading(false);
    }
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    active: { label: 'Actif', color: 'bg-green-100 text-green-800' },
    suspended: { label: 'Suspendu', color: 'bg-red-100 text-red-800' },
    cancelled: { label: 'Annulé', color: 'bg-gray-100 text-gray-600' },
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  const status = statusConfig[user.subscriptionStatus ?? 'active'] ?? statusConfig.active;

  return (
    <div className="pb-20">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">💳 Facturation</h1>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Abonnement Sparky</h2>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-600">Statut</span>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${status.color}`}>
              {status.label}
            </span>
          </div>

          {user.superadminCreated ? (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-purple-800">Plan géré par l&apos;équipe Sparky</p>
              <p className="text-xs text-purple-600 mt-1">Votre accès est géré directement par Sparky.</p>
            </div>
          ) : (
            <button
              onClick={handleManageSubscription}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading ? 'Redirection...' : 'Gérer mon abonnement'}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          Pour toute question, contactez support@sparky.app
        </p>
      </div>
    </div>
  );
}
