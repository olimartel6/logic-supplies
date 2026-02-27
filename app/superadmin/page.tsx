'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Company {
  id: number;
  name: string;
  subscription_status: 'active' | 'suspended' | 'cancelled';
  created_at: string;
  user_count: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  superadmin_created: number;
}

interface CatalogAccount {
  supplier: string;
  username: string | null;
  configured: boolean;
}

interface CatalogStats {
  count: number;
  lastSync: string | null;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ companyName: '', adminEmail: '', adminPassword: '', adminName: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('99');
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceSaved, setPriceSaved] = useState(false);
  const [paymentLink, setPaymentLink] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [linkSaved, setLinkSaved] = useState(false);
  const [catalogAccounts, setCatalogAccounts] = useState<CatalogAccount[]>([]);
  const [catalogStats, setCatalogStats] = useState<Record<string, CatalogStats>>({});
  const [importingSupplier, setImportingSupplier] = useState<string | null>(null);
  const [importAllRunning, setImportAllRunning] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [configOpen, setConfigOpen] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, { username: string; password: string }>>({});
  const [savingAccount, setSavingAccount] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => {
      if (!u || u.role !== 'superadmin') { router.push('/'); return; }
      loadCompanies();
      loadCatalogData();
      fetch('/api/superadmin/pricing').then(r => r.json()).then((d: { monthly_price_cents: number; stripe_payment_link: string }) => {
        setMonthlyPrice(String(Math.round(d.monthly_price_cents / 100)));
        setPaymentLink(d.stripe_payment_link || '');
      });
    });
  }, [router]);

  async function loadCompanies() {
    setLoading(true);
    const res = await fetch('/api/superadmin/companies');
    const data = await res.json();
    setCompanies(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function loadCatalogData() {
    const [accountsRes, ...statsRes] = await Promise.all([
      fetch('/api/superadmin/catalog/account'),
      fetch('/api/superadmin/catalog/import?supplier=lumen'),
      fetch('/api/superadmin/catalog/import?supplier=canac'),
      fetch('/api/superadmin/catalog/import?supplier=homedepot'),
      fetch('/api/superadmin/catalog/import?supplier=guillevin'),
    ]);
    const accounts: CatalogAccount[] = await accountsRes.json();
    setCatalogAccounts(accounts);
    const suppliers = ['lumen', 'canac', 'homedepot', 'guillevin'];
    const stats: Record<string, CatalogStats> = {};
    for (let i = 0; i < suppliers.length; i++) {
      stats[suppliers[i]] = await statsRes[i].json();
    }
    setCatalogStats(stats);
  }

  async function saveCatalogAccount(supplier: string) {
    const f = configForm[supplier] || { username: '', password: '' };
    if (!f.username) {
      setAccountError('Le nom d\'utilisateur est requis');
      return;
    }
    setAccountError(null);
    setSavingAccount(supplier);
    try {
      const res = await fetch('/api/superadmin/catalog/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier, username: f.username, password: f.password || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAccountError(data.error || `Erreur ${res.status}`);
        return;
      }
      setConfigOpen(null);
      loadCatalogData();
    } catch (err: any) {
      setAccountError(err.message || 'Erreur réseau');
    } finally {
      setSavingAccount(null);
    }
  }

  async function startImport(supplier: string) {
    setImportingSupplier(supplier);
    setImportProgress('');
    setImportError(null);
    try {
      const res = await fetch(`/api/superadmin/catalog/import?supplier=${supplier}`, { method: 'POST' });
      if (!res.ok || !res.body) {
        setImportError(`Erreur ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.category) setImportProgress(`${supplier} — ${ev.category}`);
          if (ev.done) {
            if (ev.error) setImportError(`${supplier}: ${ev.error}`);
            setImportProgress('');
            setImportingSupplier(null);
            loadCatalogData();
          }
        }
      }
    } finally {
      setImportingSupplier(null);
      setImportProgress('');
    }
  }

  async function startImportAll() {
    setImportAllRunning(true);
    setImportProgress('');
    try {
      const res = await fetch('/api/superadmin/catalog/import-all', { method: 'POST' });
      if (!res.ok || !res.body) {
        setImportAllRunning(false);
        setImportProgress('');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.supplier && ev.category) setImportProgress(`${ev.supplier} — ${ev.category}`);
          if (ev.supplier && ev.started) setImportProgress(`${ev.supplier}...`);
          if (ev.done) {
            setImportProgress('');
            setImportAllRunning(false);
            loadCatalogData();
          }
        }
      }
    } finally {
      setImportAllRunning(false);
      setImportProgress('');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccess('');
    const res = await fetch('/api/superadmin/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setSuccess(`Compagnie créée ! ID: ${data.companyId}`);
      setForm({ companyName: '', adminEmail: '', adminPassword: '', adminName: '' });
      loadCompanies();
    } else {
      setError(data.error || 'Erreur');
    }
    setCreating(false);
  }

  async function handleSavePrice(e: React.FormEvent) {
    e.preventDefault();
    setSavingPrice(true);
    setPriceSaved(false);
    await fetch('/api/superadmin/pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_price_cents: Math.round(parseFloat(monthlyPrice) * 100) }),
    });
    setSavingPrice(false);
    setPriceSaved(true);
    setTimeout(() => setPriceSaved(false), 3000);
  }

  async function handleSaveLink(e: React.FormEvent) {
    e.preventDefault();
    setSavingLink(true);
    setLinkSaved(false);
    await fetch('/api/superadmin/pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stripe_payment_link: paymentLink.trim() }),
    });
    setSavingLink(false);
    setLinkSaved(true);
    setTimeout(() => setLinkSaved(false), 3000);
  }

  async function handleToggle(c: Company) {
    const newStatus = c.subscription_status === 'active' ? 'suspended' : 'active';
    await fetch(`/api/superadmin/companies/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription_status: newStatus }),
    });
    loadCompanies();
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Super Admin — logicSupplies</h1>
          <button
            onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => router.push('/'))}
            className="text-sm text-gray-400 hover:text-white"
          >
            Déconnexion
          </button>
        </div>

        {/* Créer une compagnie */}
        <div className="bg-gray-900 rounded-2xl p-6 mb-8 border border-gray-800">
          <h2 className="font-semibold text-lg mb-4">Nouvelle compagnie</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              placeholder="Nom de la compagnie"
              value={form.companyName}
              onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <input
              type="text"
              placeholder="Nom de l'admin (optionnel)"
              value={form.adminName}
              onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <input
              type="email"
              placeholder="Email admin"
              value={form.adminEmail}
              onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <input
              type="password"
              placeholder="Mot de passe admin"
              value={form.adminPassword}
              onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">{success}</p>}
            <button
              type="submit"
              disabled={creating}
              className="w-full bg-white text-gray-900 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-100 disabled:opacity-50 transition"
            >
              {creating ? 'Création...' : 'Créer la compagnie'}
            </button>
          </form>
        </div>

        {/* Pricing config */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 mb-6">
          <h2 className="font-semibold text-white mb-1">💳 Tarification</h2>
          <p className="text-xs text-gray-400 mb-4">Prix mensuel facturé à chaque nouvelle compagnie.</p>
          <form onSubmit={handleSavePrice} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min="1"
                step="1"
                value={monthlyPrice}
                onChange={e => { setMonthlyPrice(e.target.value); setPriceSaved(false); }}
                className="w-full border border-gray-600 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$/mois</span>
            </div>
            <button
              type="submit"
              disabled={savingPrice}
              className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
            >
              {savingPrice ? '...' : priceSaved ? '✅' : 'Sauvegarder'}
            </button>
          </form>
        </div>

        {/* Payment link config */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 mb-6">
          <h2 className="font-semibold text-white mb-1">🔗 Lien de paiement Stripe</h2>
          <p className="text-xs text-gray-400 mb-4">Lien Stripe utilisé lors de l'inscription. Trouvez-le dans Stripe → Payment Links.</p>
          <form onSubmit={handleSaveLink} className="flex gap-2">
            <input
              type="url"
              value={paymentLink}
              onChange={e => { setPaymentLink(e.target.value); setLinkSaved(false); }}
              placeholder="https://buy.stripe.com/..."
              className="flex-1 border border-gray-600 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={savingLink}
              className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
            >
              {savingLink ? '...' : linkSaved ? '✅' : 'Sauvegarder'}
            </button>
          </form>
        </div>

        {/* Liste des compagnies */}
        <h2 className="font-semibold text-lg mb-4">
          Compagnies ({companies.length})
        </h2>
        {loading ? (
          <p className="text-gray-400 text-sm">Chargement...</p>
        ) : companies.length === 0 ? (
          <p className="text-gray-500 text-sm italic">Aucune compagnie créée.</p>
        ) : (
          <div className="space-y-3">
            {companies.map(c => (
              <div key={c.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    {c.user_count} utilisateur{c.user_count > 1 ? 's' : ''} ·{' '}
                    {new Date(c.created_at).toLocaleDateString('fr-CA')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      c.subscription_status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : c.subscription_status === 'suspended'
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {c.subscription_status}
                    </span>
                    {c.superadmin_created ? (
                      <span className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full font-medium">Gratuit</span>
                    ) : c.stripe_customer_id ? (
                      <span className="text-xs text-gray-500 font-mono">cus_••••{c.stripe_customer_id.slice(-4)}</span>
                    ) : (
                      <span className="text-xs text-gray-600 italic">Pas de Stripe</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggle(c)}
                    className="text-xs text-gray-400 hover:text-white underline"
                  >
                    {c.subscription_status === 'active' ? 'Suspendre' : 'Réactiver'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Catalogues fournisseurs ─── */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Catalogues fournisseurs</h2>
            <button
              onClick={startImportAll}
              disabled={importAllRunning || importingSupplier !== null}
              className="bg-white text-gray-900 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-100 disabled:opacity-50 transition"
            >
              {importAllRunning ? '⏳ Import en cours...' : '⬆ Importer tous'}
            </button>
          </div>

          {(importAllRunning || importingSupplier) && importProgress && (
            <div className="mb-4 bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>{importProgress}</span>
              </div>
            </div>
          )}
          {importError && (
            <div className="mb-4 bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
              {importError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'lumen',      label: 'Lumen',       cls: 'bg-blue-900/40 text-blue-300 border-blue-800' },
              { key: 'canac',      label: 'Canac',       cls: 'bg-green-900/40 text-green-300 border-green-800' },
              { key: 'homedepot',  label: 'Home Depot',  cls: 'bg-orange-900/40 text-orange-300 border-orange-800' },
              { key: 'guillevin',  label: 'Guillevin',   cls: 'bg-purple-900/40 text-purple-300 border-purple-800' },
            ].map(s => {
              const acc = catalogAccounts.find(a => a.supplier === s.key);
              const stats = catalogStats[s.key];
              const isImporting = importingSupplier === s.key;
              const isOpen = configOpen === s.key;
              const cf = configForm[s.key] || { username: acc?.username ?? '', password: '' };
              return (
                <div key={s.key} className={`bg-gray-900 rounded-2xl border p-4 ${s.cls}`}>
                  <p className="font-semibold text-white text-sm mb-1">{s.label}</p>
                  {acc?.configured ? (
                    <p className="text-xs text-gray-400 mb-1">@{acc.username}</p>
                  ) : (
                    <p className="text-xs text-gray-500 italic mb-1">Non configuré</p>
                  )}
                  {stats && (
                    <p className="text-xs text-gray-400 mb-3">
                      {stats.count > 0
                        ? `${stats.count} produits · ${stats.lastSync ? new Date(stats.lastSync).toLocaleDateString('fr-CA') : '—'}`
                        : 'Aucun produit'}
                    </p>
                  )}

                  {!isOpen ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setConfigOpen(s.key);
                          setConfigForm(f => ({ ...f, [s.key]: { username: acc?.username ?? '', password: '' } }));
                        }}
                        className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-1.5 transition"
                      >
                        {acc?.configured ? 'Modifier' : 'Configurer'}
                      </button>
                      <button
                        onClick={() => startImport(s.key)}
                        disabled={!acc?.configured || isImporting || importAllRunning}
                        className="flex-1 text-xs bg-white text-gray-900 font-semibold rounded-lg py-1.5 hover:bg-gray-100 disabled:opacity-40 transition"
                      >
                        {isImporting ? '⏳' : 'Importer'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="Nom d'utilisateur"
                        value={cf.username}
                        onChange={e => setConfigForm(f => ({ ...f, [s.key]: { ...cf, username: e.target.value } }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30"
                      />
                      <input
                        type="password"
                        placeholder={acc?.configured ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}
                        value={cf.password}
                        onChange={e => setConfigForm(f => ({ ...f, [s.key]: { ...cf, password: e.target.value } }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30"
                      />
                      {accountError && (
                        <p className="text-xs text-red-400">{accountError}</p>
                      )}
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setConfigOpen(null); setAccountError(null); }}
                          className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-1.5 transition"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => saveCatalogAccount(s.key)}
                          disabled={savingAccount === s.key}
                          className="flex-1 text-xs bg-white text-gray-900 font-semibold rounded-lg py-1.5 hover:bg-gray-100 disabled:opacity-50 transition"
                        >
                          {savingAccount === s.key ? '...' : 'Sauvegarder'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
