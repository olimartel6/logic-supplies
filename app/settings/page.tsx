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
interface Account { username: string; active: number; }
interface Category { id: number; category_name: string; category_url: string; enabled: number; }
interface CatalogStats { count: number; lastSync: string | null; }
interface ImportProgress { category: string; imported: number; total: number; done: boolean; error?: string; }

type SectionTheme = {
  bg: string;
  border: string;
  heading: string;
  subtext: string;
  checkboxAccent: string;
};

const themes: Record<string, SectionTheme> = {
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    heading: 'text-red-900',
    subtext: 'text-red-700',
    checkboxAccent: 'accent-red-600',
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    heading: 'text-blue-900',
    subtext: 'text-blue-700',
    checkboxAccent: 'accent-blue-600',
  },
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    heading: 'text-orange-900',
    subtext: 'text-orange-700',
    checkboxAccent: 'accent-orange-600',
  },
  gray: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    heading: 'text-gray-900',
    subtext: 'text-gray-700',
    checkboxAccent: 'accent-gray-600',
  },
};

function AccordionSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-3 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 text-gray-500 flex-shrink-0 flex items-center justify-center">{icon}</span>
          <span className="font-semibold text-gray-900">{title}</span>
        </div>
        <span className={`text-gray-400 text-lg transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function SupplierSection({
  supplierKey,
  label,
  showManualSession,
  theme,
  buttonClass = 'bg-blue-600 hover:bg-blue-700',
}: {
  supplierKey: 'canac' | 'homedepot' | 'guillevin';
  label: string;
  showManualSession?: boolean;
  theme: SectionTheme;
  buttonClass?: string;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [manualSession, setManualSession] = useState(false);
  const [manualSessionResult, setManualSessionResult] = useState<boolean | null>(null);
  const [manualSessionError, setManualSessionError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [enabledIds, setEnabledIds] = useState<number[]>([]);
  const [savingCats, setSavingCats] = useState(false);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress[]>([]);
  const [importDone, setImportDone] = useState(false);

  useEffect(() => {
    fetch(`/api/supplier/account?supplier=${supplierKey}`).then(r => r.json()).then((a: Account | null) => {
      if (a) { setAccount(a); setUsername(a.username); }
    });
    fetch(`/api/supplier/categories?supplier=${supplierKey}`).then(r => r.json()).then((cats: Category[]) => {
      setCategories(cats);
      setEnabledIds(cats.filter(c => c.enabled).map(c => c.id));
    });
    fetch(`/api/supplier/import?supplier=${supplierKey}`).then(r => r.json()).then(setStats);
  }, [supplierKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch('/api/supplier/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, supplier: supplierKey }),
    });
    setSaving(false);
    setSaved(true);
    setTestResult(null);
    fetch(`/api/supplier/account?supplier=${supplierKey}`).then(r => r.json()).then(setAccount);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    const res = await fetch('/api/supplier/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier: supplierKey }),
    });
    const data = await res.json();
    setTestResult(data.success);
    setTestError(data.error || null);
    setTesting(false);
    if (data.success) {
      handleImport();
    }
  }

  async function handleManualSession() {
    setManualSession(true);
    setManualSessionResult(null);
    setManualSessionError(null);
    const res = await fetch('/api/supplier/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier: supplierKey }),
    });
    const data = await res.json();
    setManualSessionResult(data.success);
    setManualSessionError(data.error || null);
    setManualSession(false);
    if (data.success) {
      setTestResult(null);
      handleImport();
    }
  }

  async function handleSaveCategories() {
    setSavingCats(true);
    await fetch('/api/supplier/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledIds, supplier: supplierKey }),
    });
    setSavingCats(false);
  }

  function toggleCategory(id: number) {
    setEnabledIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    setImportProgress([]);
    setImportDone(false);

    const res = await fetch(`/api/supplier/import?supplier=${supplierKey}`, { method: 'POST' });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) { setImporting(false); return; }

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) {
              setImportDone(true);
              if (data.stats) setStats(data.stats);
              if (data.error) {
                setImportProgress(prev => [...prev, { category: '⚠️ Erreur', imported: 0, total: 0, done: true, error: data.error }]);
              }
            } else {
              setImportProgress(prev => {
                const idx = prev.findIndex(p => p.category === data.category);
                if (idx >= 0) { const u = [...prev]; u[idx] = data; return u; }
                return [...prev, data];
              });
            }
          } catch { /* ignore */ }
        }
      }
    }
    setImporting(false);
  }

  const cardClass = `${theme.bg} rounded-2xl border ${theme.border} shadow-sm p-5 mb-4`;

  return (
    <>
      {/* Credentials */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
          </span>
          <div>
            <h2 className={`font-semibold ${theme.heading}`}>{label}</h2>
            <p className={`text-xs font-medium ${account ? 'text-green-600' : 'text-gray-400'}`}>
              {account ? '● Compte configuré' : '● Non connecté'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className={`block text-sm font-medium ${theme.subtext} mb-1`}>Nom d&apos;utilisateur {label}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="w-full border border-gray-300 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ton@email.com"
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${theme.subtext} mb-1`}>Mot de passe {label}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!account}
              className="w-full border border-gray-300 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={account ? '••••••• (laisser vide pour conserver)' : '••••••••'}
            />
          </div>
          {saved && <p className="text-green-600 text-sm">✅ Sauvegardé avec succès</p>}
          {testError && testResult === false && <p className="text-red-600 text-sm">❌ {testError}</p>}
          {manualSessionResult === true && <p className="text-green-600 text-sm">✅ Session enregistrée — connexion automatique activée</p>}
          {manualSessionError && manualSessionResult === false && <p className="text-red-600 text-sm">❌ {manualSessionError}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !account}
              className="flex-1 border border-gray-300 bg-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition"
            >
              {testing ? '⏳ Test...' : testResult === true ? '✅ Connecté' : testResult === false ? '❌ Échec' : 'Tester la connexion'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 ${buttonClass} text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition`}
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
          {showManualSession && account && (
            <div className="pt-2 border-t border-gray-200 mt-2">
              <p className="text-xs text-gray-500 mb-2">
                Home Depot bloque les connexions automatiques. Une fenêtre Chrome normale s&apos;ouvre — connectez-vous, puis <strong>fermez la fenêtre Chrome</strong> quand vous avez terminé.
              </p>
              <button
                type="button"
                onClick={handleManualSession}
                disabled={manualSession}
                className="w-full border border-orange-300 text-orange-700 bg-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-50 disabled:opacity-50 transition"
              >
                {manualSession ? '⏳ Chrome ouvert — connectez-vous puis fermez la fenêtre...' : '🔑 Connexion manuelle Home Depot (ouvre Chrome)'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Catalog import */}
      <div className={cardClass}>
        <h2 className={`font-semibold ${theme.heading} mb-1 flex items-center gap-2`}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>
          Catalogue produits {label}
        </h2>
        {stats && (
          <p className="text-xs text-gray-500 mb-4">
            {stats.count} produits importés
            {stats.lastSync ? ` · Dernière sync: ${new Date(stats.lastSync).toLocaleDateString('fr-CA')}` : ''}
          </p>
        )}
        {!stats && <p className="text-xs text-gray-400 mb-4">Aucun produit importé</p>}

        <p className={`text-sm font-medium ${theme.subtext} mb-2`}>Catégories à importer :</p>
        <div className="space-y-2 mb-4">
          {categories.map(cat => (
            <label key={cat.id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledIds.includes(cat.id)}
                onChange={() => toggleCategory(cat.id)}
                className={`w-4 h-4 rounded ${theme.checkboxAccent}`}
              />
              <span className="text-sm text-gray-800">{cat.category_name}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSaveCategories}
            disabled={savingCats}
            className="flex-1 border border-gray-300 bg-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition"
          >
            {savingCats ? 'Sauvegarde...' : 'Sauvegarder catégories'}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className={`flex-1 ${buttonClass} text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition`}
          >
            {importing ? '⏳ Import...' : 'Importer maintenant'}
          </button>
        </div>

        {importProgress.length > 0 && (
          <div className="mt-4 space-y-1">
            {importProgress.map(p => (
              <div key={p.category} className="text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">{p.category}</span>
                  <span className={p.done ? 'text-green-600 font-medium' : 'text-blue-500'}>
                    {p.done ? `✅ ${p.imported} produits` : `⏳ ${p.imported}...`}
                  </span>
                </div>
                {p.error && p.category === '⚠️ Erreur' && <p className="text-red-600 break-all mt-0.5">{p.error}</p>}
              </div>
            ))}
            {importDone && importProgress.reduce((s, p) => s + p.imported, 0) === 0 && (
              <p className="text-red-600 text-xs font-medium mt-2">⚠️ 0 produits importés — voir détails ci-dessus</p>
            )}
            {importDone && importProgress.reduce((s, p) => s + p.imported, 0) > 0 && (
              <p className="text-green-600 text-xs font-medium mt-2">
                ✅ Import terminé — {importProgress.reduce((s, p) => s + p.imported, 0)} produits au total
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [preference, setPreference] = useState<'cheapest' | 'fastest'>('cheapest');
  const [savingPreference, setSavingPreference] = useState(false);

  const [lumenRepEmail, setLumenRepEmail] = useState('');
  const [savingRepEmail, setSavingRepEmail] = useState(false);
  const [repEmailSaved, setRepEmailSaved] = useState(false);

  const [largeOrderThreshold, setLargeOrderThreshold] = useState('2000');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdSaved, setThresholdSaved] = useState(false);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [enabledIds, setEnabledIds] = useState<number[]>([]);
  const [savingCats, setSavingCats] = useState(false);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress[]>([]);
  const [importDone, setImportDone] = useState(false);

  const [billingLoading, setBillingLoading] = useState(false);

  // Accordion open/close state
  const [openSection, setOpenSection] = useState<string | null>(null);

  const router = useRouter();
  const lumenTheme = themes.red;

  function toggleSection(key: string) {
    setOpenSection(prev => prev === key ? null : key);
  }

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => {
      if (!u) return;
      if (u.role === 'electrician') { router.push('/my-requests'); return; }
      setUser(u);
      setInventoryEnabled(!!u.inventoryEnabled);
    });
    fetch('/api/supplier/account').then(r => r.json()).then((a: Account | null) => {
      if (a) { setAccount(a); setUsername(a.username); }
    });
    fetch('/api/supplier/categories').then(r => r.json()).then((cats: Category[]) => {
      setCategories(cats);
      setEnabledIds(cats.filter(c => c.enabled).map(c => c.id));
    });
    fetch('/api/supplier/import').then(r => r.json()).then(setStats);
    fetch('/api/supplier/preference').then(r => r.json()).then((data: { preference: 'cheapest' | 'fastest'; lumenRepEmail?: string; largeOrderThreshold?: number }) => {
      if (data?.preference) setPreference(data.preference);
      if (data?.lumenRepEmail !== undefined) setLumenRepEmail(data.lumenRepEmail);
      if (data?.largeOrderThreshold !== undefined) setLargeOrderThreshold(String(data.largeOrderThreshold));
    });
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch('/api/supplier/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    setSaving(false);
    setSaved(true);
    setTestResult(null);
    fetch('/api/supplier/account').then(r => r.json()).then(setAccount);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    const res = await fetch('/api/supplier/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier: 'lumen' }),
    });
    const data = await res.json();
    setTestResult(data.success);
    setTestError(data.error || null);
    setTesting(false);
    if (data.success) {
      handleImport();
    }
  }

  async function handleSaveCategories() {
    setSavingCats(true);
    await fetch('/api/supplier/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledIds }),
    });
    setSavingCats(false);
  }

  function toggleCategory(id: number) {
    setEnabledIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handlePreferenceChange(pref: 'cheapest' | 'fastest') {
    setPreference(pref);
    setSavingPreference(true);
    await fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preference: pref }),
    });
    setSavingPreference(false);
  }

  async function handleSaveThreshold(e: React.FormEvent) {
    e.preventDefault();
    setSavingThreshold(true);
    setThresholdSaved(false);
    await fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ largeOrderThreshold: parseFloat(largeOrderThreshold) }),
    });
    setSavingThreshold(false);
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 3000);
  }

  async function handleSaveRepEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingRepEmail(true);
    setRepEmailSaved(false);
    await fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lumenRepEmail }),
    });
    setSavingRepEmail(false);
    setRepEmailSaved(true);
    setTimeout(() => setRepEmailSaved(false), 3000);
  }

  async function handleInventoryToggle() {
    const next = !inventoryEnabled;
    setInventoryEnabled(next);
    await fetch('/api/inventory/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory_enabled: next }),
    });
  }

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    setImportProgress([]);
    setImportDone(false);

    const res = await fetch('/api/supplier/import', { method: 'POST' });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) { setImporting(false); return; }

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) {
              setImportDone(true);
              if (data.stats) setStats(data.stats);
              if (data.error) {
                setImportProgress(prev => [...prev, { category: '⚠️ Erreur', imported: 0, total: 0, done: true, error: data.error }]);
              }
            } else {
              setImportProgress(prev => {
                const idx = prev.findIndex(p => p.category === data.category);
                if (idx >= 0) { const u = [...prev]; u[idx] = data; return u; }
                return [...prev, data];
              });
            }
          } catch { /* ignore */ }
        }
      }
    }
    setImporting(false);
  }

  async function handleManageSubscription() {
    setBillingLoading(true);
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setBillingLoading(false);
    }
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  const statusConfig: Record<string, { label: string; color: string }> = {
    active: { label: 'Actif', color: 'bg-green-100 text-green-800' },
    suspended: { label: 'Suspendu', color: 'bg-red-100 text-red-800' },
    cancelled: { label: 'Annulé', color: 'bg-gray-100 text-gray-600' },
  };
  const billingStatus = statusConfig[user.subscriptionStatus ?? 'active'] ?? statusConfig.active;

  return (
    <div className="pb-20">
      <NavBar role={user.role} name={user.name} inventoryEnabled={inventoryEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-gray-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          Paramètres
        </h1>

        {/* ─── FOURNISSEURS ─── */}
        <AccordionSection
          title="Fournisseurs"
          icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>}
          isOpen={openSection === 'fournisseur'}
          onToggle={() => toggleSection('fournisseur')}
        >
          {/* Supplier preference */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-500 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>
              Sélection automatique du fournisseur
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Lorsqu&apos;une demande est approuvée, Sparky choisit automatiquement le meilleur fournisseur.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePreferenceChange('cheapest')}
                disabled={savingPreference}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                  preference === 'cheapest'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  Moins cher
                </span>
                <p className="text-xs font-normal mt-0.5 opacity-70">Compare les prix</p>
              </button>
              <button
                type="button"
                onClick={() => handlePreferenceChange('fastest')}
                disabled={savingPreference}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                  preference === 'fastest'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
                  Plus proche
                </span>
                <p className="text-xs font-normal mt-0.5 opacity-70">Succursale la plus proche</p>
              </button>
            </div>
            {savingPreference && <p className="text-xs text-gray-400 mt-2 text-center">Sauvegarde...</p>}
          </div>

          {/* ─── LUMEN ─── */}
          <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2 px-1">Lumen</p>

          {/* Lumen credentials */}
          <div className={`${lumenTheme.bg} rounded-2xl border ${lumenTheme.border} shadow-sm p-5 mb-4`}>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-red-700"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
              </span>
              <div>
                <h2 className={`font-semibold ${lumenTheme.heading}`}>Lumen — Compte</h2>
                <p className={`text-xs font-medium ${account ? 'text-green-600' : 'text-gray-400'}`}>
                  {account ? '● Compte configuré' : '● Non connecté'}
                </p>
              </div>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className={`block text-sm font-medium ${lumenTheme.subtext} mb-1`}>Nom d&apos;utilisateur Lumen</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="ton@email.com"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${lumenTheme.subtext} mb-1`}>Mot de passe Lumen</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required={!account}
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder={account ? '••••••• (laisser vide pour conserver)' : '••••••••'}
                />
              </div>
              {saved && <p className="text-green-600 text-sm">✅ Sauvegardé avec succès</p>}
              {testError && testResult === false && <p className="text-red-600 text-sm">❌ {testError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !account}
                  className="flex-1 border border-gray-300 bg-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition"
                >
                  {testing ? '⏳ Test...' : testResult === true ? '✅ Connecté' : testResult === false ? '❌ Échec' : 'Tester la connexion'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </form>
          </div>

          {/* Lumen rep email */}
          <div className={`${lumenTheme.bg} rounded-2xl border ${lumenTheme.border} shadow-sm p-5 mb-4`}>
            <h2 className={`font-semibold ${lumenTheme.heading} mb-1 flex items-center gap-2`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
              Représentant Lumen
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Email du représentant Lumen pour l&apos;envoi des bons de commande PDF.
            </p>
            <form onSubmit={handleSaveRepEmail} className="flex gap-2">
              <input
                type="email"
                value={lumenRepEmail}
                onChange={e => { setLumenRepEmail(e.target.value); setRepEmailSaved(false); }}
                placeholder="representant@lumen.ca"
                className="flex-1 border border-gray-300 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <button
                type="submit"
                disabled={savingRepEmail}
                className="bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition whitespace-nowrap"
              >
                {savingRepEmail ? '...' : repEmailSaved ? '✅' : 'Sauvegarder'}
              </button>
            </form>
          </div>

          {/* Lumen catalog */}
          <div className={`${lumenTheme.bg} rounded-2xl border ${lumenTheme.border} shadow-sm p-5 mb-6`}>
            <h2 className={`font-semibold ${lumenTheme.heading} mb-1 flex items-center gap-2`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>
              Catalogue produits Lumen
            </h2>
            {stats && (
              <p className="text-xs text-gray-500 mb-4">
                {stats.count} produits importés
                {stats.lastSync ? ` · Dernière sync: ${new Date(stats.lastSync).toLocaleDateString('fr-CA')}` : ''}
              </p>
            )}
            {!stats && <p className="text-xs text-gray-400 mb-4">Aucun produit importé</p>}
            <p className={`text-sm font-medium ${lumenTheme.subtext} mb-2`}>Catégories à importer :</p>
            <div className="space-y-2 mb-4">
              {categories.map(cat => (
                <label key={cat.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledIds.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    className={`w-4 h-4 rounded ${lumenTheme.checkboxAccent}`}
                  />
                  <span className="text-sm text-gray-800">{cat.category_name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveCategories}
                disabled={savingCats}
                className="flex-1 border border-gray-300 bg-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition"
              >
                {savingCats ? 'Sauvegarde...' : 'Sauvegarder catégories'}
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
              >
                {importing ? '⏳ Import...' : 'Importer maintenant'}
              </button>
            </div>
            {importProgress.length > 0 && (
              <div className="mt-4 space-y-1">
                {importProgress.map(p => (
                  <div key={p.category} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">{p.category}</span>
                      <span className={p.done ? 'text-green-600 font-medium' : 'text-blue-500'}>
                        {p.done ? `✅ ${p.imported} produits` : `⏳ ${p.imported}...`}
                      </span>
                    </div>
                    {p.error && p.category === '⚠️ Erreur' && <p className="text-red-600 break-all mt-0.5">{p.error}</p>}
                  </div>
                ))}
                {importDone && importProgress.reduce((sum, p) => sum + p.imported, 0) === 0 && (
                  <p className="text-red-600 text-xs font-medium mt-2">⚠️ 0 produits importés — voir détails ci-dessus</p>
                )}
                {importDone && importProgress.reduce((sum, p) => sum + p.imported, 0) > 0 && (
                  <p className="text-green-600 text-xs font-medium mt-2">
                    ✅ Import terminé — {importProgress.reduce((sum, p) => sum + p.imported, 0)} produits au total
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ─── CANAC ─── */}
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2 px-1">Canac</p>
          <SupplierSection supplierKey="canac" label="Canac" theme={themes.blue} />

          {/* ─── HOME DEPOT ─── */}
          <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2 mt-2 px-1">Home Depot</p>
          <SupplierSection supplierKey="homedepot" label="Home Depot" showManualSession theme={themes.orange} />

          {/* ─── GUILLEVIN ─── */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 mt-2 px-1">Guillevin</p>
          <SupplierSection supplierKey="guillevin" label="Guillevin" theme={themes.gray} />
        </AccordionSection>

        {/* ─── ALERTES ─── */}
        <AccordionSection
          title="Alertes"
          icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>}
          isOpen={openSection === 'alertes'}
          onToggle={() => toggleSection('alertes')}
        >
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-amber-500 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              Seuil d&apos;alerte grande commande
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Une alerte est envoyée quand une commande dépasse ce montant.
            </p>
            <form onSubmit={handleSaveThreshold} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={largeOrderThreshold}
                  onChange={e => { setLargeOrderThreshold(e.target.value); setThresholdSaved(false); }}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8 bg-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              </div>
              <button
                type="submit"
                disabled={savingThreshold}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
              >
                {savingThreshold ? '...' : thresholdSaved ? '✅' : 'Sauvegarder'}
              </button>
            </form>
          </div>
        </AccordionSection>

        {/* ─── GESTION INVENTAIRE ─── */}
        <AccordionSection
          title="Gestion inventaire"
          icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>}
          isOpen={openSection === 'inventaire'}
          onToggle={() => toggleSection('inventaire')}
        >
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-500 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                  Gestion de l&apos;inventaire
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Activer le module de scan et de suivi des stocks</p>
              </div>
              <button
                type="button"
                onClick={handleInventoryToggle}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  inventoryEnabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    inventoryEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </AccordionSection>

        {/* ─── FACTURATION ─── */}
        <AccordionSection
          title="Facturation"
          icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 21Z" /></svg>}
          isOpen={openSection === 'facturation'}
          onToggle={() => toggleSection('facturation')}
        >
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-4">Abonnement Sparky</h2>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600">Statut</span>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${billingStatus.color}`}>
                {billingStatus.label}
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
                disabled={billingLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {billingLoading ? 'Redirection...' : 'Gérer mon abonnement'}
              </button>
            )}

            <p className="text-xs text-gray-400 text-center mt-3">
              Pour toute question, contactez support@sparky.app
            </p>
          </div>
        </AccordionSection>

      </div>
    </div>
  );
}
