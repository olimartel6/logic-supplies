'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { useLang, useT } from '@/lib/LanguageContext';
import type { Lang } from '@/lib/i18n';

interface User {
  name: string;
  role: string;
  inventoryEnabled?: boolean;
  subscriptionStatus?: string;
  superadminCreated?: boolean;
}
interface Account { username: string; active: number; }
interface SupplierVisibility { supplier: string; visible: boolean; }

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
  green: {
    bg: 'bg-lime-50',
    border: 'border-lime-200',
    heading: 'text-lime-900',
    subtext: 'text-lime-700',
    checkboxAccent: 'accent-lime-600',
  },
  cyan: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    heading: 'text-cyan-900',
    subtext: 'text-cyan-700',
    checkboxAccent: 'accent-cyan-600',
  },
  yellow: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    heading: 'text-yellow-900',
    subtext: 'text-yellow-700',
    checkboxAccent: 'accent-yellow-600',
  },
  pink: {
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    heading: 'text-pink-900',
    subtext: 'text-pink-700',
    checkboxAccent: 'accent-pink-600',
  },
  indigo: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    heading: 'text-indigo-900',
    subtext: 'text-indigo-700',
    checkboxAccent: 'accent-indigo-600',
  },
  teal: {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    heading: 'text-teal-900',
    subtext: 'text-teal-700',
    checkboxAccent: 'accent-teal-600',
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    heading: 'text-purple-900',
    subtext: 'text-purple-700',
    checkboxAccent: 'accent-purple-600',
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
  visible = false,
  toggling = false,
  onToggleVisible,
}: {
  supplierKey: string;
  label: string;
  showManualSession?: boolean;
  theme: SectionTheme;
  buttonClass?: string;
  visible?: boolean;
  toggling?: boolean;
  onToggleVisible?: (v: boolean) => void;
}) {
  const t = useT();
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

  useEffect(() => {
    fetch(`/api/supplier/account?supplier=${supplierKey}`).then(r => r.json()).then((a: Account | null) => {
      if (a) { setAccount(a); setUsername(a.username); }
    });
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
  }

  const cardClass = `${theme.bg} rounded-2xl border ${theme.border} shadow-sm p-5 mb-4`;

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-3 mb-4">
        <span className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
        </span>
        <div className="flex-1">
          <h2 className={`font-semibold ${theme.heading}`}>{label}</h2>
          <p className={`text-xs font-medium ${account ? 'text-green-600' : 'text-gray-400'}`}>
            {account ? '● Compte configuré' : '● Non connecté'}
          </p>
        </div>
        {onToggleVisible && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400">Catalogue</span>
            <button
              type="button"
              onClick={() => onToggleVisible(!visible)}
              disabled={toggling}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${visible ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${visible ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        )}
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
            {saving ? t('saving') : 'Sauvegarder'}
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
  );
}

export default function SettingsPage() {
  const { setLang } = useLang();
  const t = useT();
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
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  const [supplierVisibility, setSupplierVisibility] = useState<SupplierVisibility[]>([]);
  const [togglingSupplier, setTogglingSupplier] = useState<string | null>(null);

  const [billingLoading, setBillingLoading] = useState(false);

  // Paiement
  const [payment, setPayment] = useState<{ configured: boolean; card_holder?: string; card_last4?: string; card_expiry?: string } | null>(null);
  const [paymentForm, setPaymentForm] = useState({ card_holder: '', card_number: '', card_expiry: '', card_cvv: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // Adresse bureau + livraison par défaut
  const [officeAddress, setOfficeAddress] = useState('');
  const [defaultDelivery, setDefaultDelivery] = useState<'office' | 'jobsite'>('office');
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliverySaved, setDeliverySaved] = useState(false);

  // Marketing
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [savingReviewUrl, setSavingReviewUrl] = useState(false);
  const [reviewUrlSaved, setReviewUrlSaved] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoSaved, setLogoSaved] = useState(false);

  // Test orders
  const [testProduct, setTestProduct] = useState('Fil 14/2 NMD90 150m');
  const [testSupplier, setTestSupplier] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [_testPolling, _setTestPolling] = useState(false); // unused, kept for compat

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
      if (u.role === 'worker') { router.push('/my-requests'); return; }
      setLang((u.language as Lang) || 'fr');
      setUser(u);
      setInventoryEnabled(!!u.inventoryEnabled);
    });
    fetch('/api/supplier/account').then(r => r.json()).then((a: Account | null) => {
      if (a) { setAccount(a); setUsername(a.username); }
    });
    fetch('/api/supplier/visibility').then(r => r.json()).then(setSupplierVisibility);
    fetch('/api/supplier/preference').then(r => r.json()).then((data: { preference: 'cheapest' | 'fastest'; lumenRepEmail?: string; largeOrderThreshold?: number; officeAddress?: string; defaultDelivery?: 'office' | 'jobsite'; googleReviewUrl?: string; companyLogoUrl?: string; marketingEnabled?: boolean }) => {
      if (data?.preference) setPreference(data.preference);
      if (data?.lumenRepEmail !== undefined) setLumenRepEmail(data.lumenRepEmail);
      if (data?.largeOrderThreshold !== undefined) setLargeOrderThreshold(String(data.largeOrderThreshold));
      if (data?.officeAddress !== undefined) setOfficeAddress(data.officeAddress);
      if (data?.defaultDelivery !== undefined) setDefaultDelivery(data.defaultDelivery);
      if (data?.googleReviewUrl !== undefined) setGoogleReviewUrl(data.googleReviewUrl);
      if (data?.companyLogoUrl !== undefined) setCompanyLogoUrl(data.companyLogoUrl);
      if (data?.marketingEnabled !== undefined) setMarketingEnabled(data.marketingEnabled);
    });
    fetch('/api/settings/payment').then(r => r.json()).then(setPayment).catch(() => {});
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
  }

  async function handleToggleVisibility(supplier: string, visible: boolean) {
    setTogglingSupplier(supplier);
    setSupplierVisibility(prev =>
      prev.map(v => v.supplier === supplier ? { ...v, visible } : v)
    );
    await fetch('/api/supplier/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier, visible }),
    });
    setTogglingSupplier(null);
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

  async function handleMarketingToggle() {
    const next = !marketingEnabled;
    setMarketingEnabled(next);
    await fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketingEnabled: next }),
    });
  }

  async function handleSavePayment(e: React.FormEvent) {
    e.preventDefault();
    setSavingPayment(true);
    setPaymentSaved(false);
    const res = await fetch('/api/settings/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentForm),
    });
    if (res.ok) {
      setPaymentSaved(true);
      setPaymentForm(f => ({ ...f, card_number: '', card_cvv: '' }));
      fetch('/api/settings/payment').then(r => r.json()).then(setPayment);
      setTimeout(() => setPaymentSaved(false), 3000);
    }
    setSavingPayment(false);
  }

  async function handleDeletePayment() {
    setDeletingPayment(true);
    await fetch('/api/settings/payment', { method: 'DELETE' });
    setPayment({ configured: false });
    setDeletingPayment(false);
  }

  async function handleSaveDelivery(e: React.FormEvent) {
    e.preventDefault();
    setSavingDelivery(true);
    setDeliverySaved(false);
    await fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officeAddress, defaultDelivery }),
    });
    setSavingDelivery(false);
    setDeliverySaved(true);
    setTimeout(() => setDeliverySaved(false), 3000);
  }

  async function handleSaveReviewUrl(e: React.FormEvent) {
    e.preventDefault();
    setSavingReviewUrl(true);
    setReviewUrlSaved(false);
    await fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleReviewUrl }),
    });
    setSavingReviewUrl(false);
    setReviewUrlSaved(true);
    setTimeout(() => setReviewUrlSaved(false), 3000);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoSaved(false);
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;
    await fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyLogoUrl: dataUri }),
    });
    setCompanyLogoUrl(dataUri);
    setUploadingLogo(false);
    setLogoSaved(true);
    setTimeout(() => setLogoSaved(false), 3000);
    e.target.value = '';
  }

  async function handleRunTest() {
    setTestRunning(true);
    setTestResults([]);
    try {
      const res = await fetch('/api/test-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: testProduct,
          supplier: testSupplier || undefined,
          quantity: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTestResults([{ error: data.error || 'Erreur' }]);
      } else {
        setTestResults([data.result]);
      }
    } catch {
      setTestResults([{ error: 'Erreur réseau' }]);
    } finally {
      setTestRunning(false);
    }
  }

  async function handleCleanTests() {
    await fetch('/api/test-order', { method: 'DELETE' }).catch(() => {});
    setTestResults([]);
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

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>{t('loading')}</p></div>;

  const statusConfig: Record<string, { label: string; color: string }> = {
    active: { label: 'Actif', color: 'bg-green-100 text-green-800' },
    suspended: { label: 'Suspendu', color: 'bg-red-100 text-red-800' },
    cancelled: { label: 'Annulé', color: 'bg-gray-100 text-gray-600' },
  };
  const billingStatus = statusConfig[user.subscriptionStatus ?? 'active'] ?? statusConfig.active;

  return (
    <div className="pb-20 md:pb-6 md:ml-56">
      <NavBar role={user.role} name={user.name} inventoryEnabled={inventoryEnabled} marketingEnabled={marketingEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6 md:max-w-none md:mx-0">
        <h1 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-gray-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          {t('settings_title')}
        </h1>

        {/* ─── PROFIL ─── */}
        <AccordionSection
          title={t('nav_profile')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>}
          isOpen={openSection === 'profil'}
          onToggle={() => toggleSection('profil')}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-500">{t('profile_title')} — {user.name}</p>
            <button
              type="button"
              onClick={() => router.push('/profile')}
              className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
              {t('nav_profile')}
            </button>
          </div>
        </AccordionSection>

        {/* ─── FOURNISSEURS ─── */}
        <AccordionSection
          title={t('suppliers_title')}
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
            {savingPreference && <p className="text-xs text-gray-400 mt-2 text-center">{t('saving')}</p>}
          </div>

          {/* ─── Supplier credential forms grid ─── */}
          <div className="md:grid md:grid-cols-2 md:gap-4">

          {/* ─── LUMEN ─── */}
          <div>
          <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2 px-1">Lumen</p>

          {/* Lumen credentials */}
          <div className={`${lumenTheme.bg} rounded-2xl border ${lumenTheme.border} shadow-sm p-5 mb-4`}>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-red-700"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
              </span>
              <div className="flex-1">
                <h2 className={`font-semibold ${lumenTheme.heading}`}>Lumen — Compte</h2>
                <p className={`text-xs font-medium ${account ? 'text-green-600' : 'text-gray-400'}`}>
                  {account ? '● Compte configuré' : '● Non connecté'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-400">Catalogue</span>
                <button
                  type="button"
                  onClick={() => handleToggleVisibility('lumen', !(supplierVisibility.find(v => v.supplier === 'lumen')?.visible ?? false))}
                  disabled={togglingSupplier === 'lumen'}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${(supplierVisibility.find(v => v.supplier === 'lumen')?.visible ?? false) ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${(supplierVisibility.find(v => v.supplier === 'lumen')?.visible ?? false) ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
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
                  {saving ? t('saving') : 'Sauvegarder'}
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
          </div>

          {/* ─── CANAC ─── */}
          <div>
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2 px-1">Canac</p>
          <SupplierSection
            supplierKey="canac"
            label="Canac"
            theme={themes.blue}
            visible={supplierVisibility.find(v => v.supplier === 'canac')?.visible ?? false}
            toggling={togglingSupplier === 'canac'}
            onToggleVisible={v => handleToggleVisibility('canac', v)}
          />
          </div>

          {/* ─── HOME DEPOT ─── */}
          <div>
          <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2 px-1">Home Depot</p>
          <SupplierSection
            supplierKey="homedepot"
            label="Home Depot"
            showManualSession
            theme={themes.orange}
            visible={supplierVisibility.find(v => v.supplier === 'homedepot')?.visible ?? false}
            toggling={togglingSupplier === 'homedepot'}
            onToggleVisible={v => handleToggleVisibility('homedepot', v)}
          />
          </div>

          {/* ─── GUILLEVIN ─── */}
          <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Guillevin</p>
          <SupplierSection
            supplierKey="guillevin"
            label="Guillevin"
            theme={themes.gray}
            visible={supplierVisibility.find(v => v.supplier === 'guillevin')?.visible ?? false}
            toggling={togglingSupplier === 'guillevin'}
            onToggleVisible={v => handleToggleVisibility('guillevin', v)}
          />
          </div>

          {/* ─── BMR ─── */}
          <div>
          <p className="text-xs font-bold text-lime-500 uppercase tracking-widest mb-2 px-1">BMR</p>
          <SupplierSection
            supplierKey="bmr"
            label="BMR"
            theme={themes.green}
            visible={supplierVisibility.find(v => v.supplier === 'bmr')?.visible ?? false}
            toggling={togglingSupplier === 'bmr'}
            onToggleVisible={v => handleToggleVisibility('bmr', v)}
          />
          </div>

          {/* ─── JSV ─── */}
          <div>
          <p className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-2 px-1">JSV</p>
          <SupplierSection
            supplierKey="jsv"
            label="JSV"
            theme={themes.yellow}
            visible={supplierVisibility.find(v => v.supplier === 'jsv')?.visible ?? false}
            toggling={togglingSupplier === 'jsv'}
            onToggleVisible={v => handleToggleVisibility('jsv', v)}
          />
          </div>

          {/* ─── WESTBURNE ─── */}
          <div>
          <p className="text-xs font-bold text-red-700 uppercase tracking-widest mb-2 px-1">Westburne</p>
          <SupplierSection
            supplierKey="westburne"
            label="Westburne"
            theme={themes.red}
            visible={supplierVisibility.find(v => v.supplier === 'westburne')?.visible ?? false}
            toggling={togglingSupplier === 'westburne'}
            onToggleVisible={v => handleToggleVisibility('westburne', v)}
          />
          </div>

          {/* ─── NEDCO ─── */}
          <div>
          <p className="text-xs font-bold text-pink-500 uppercase tracking-widest mb-2 px-1">Nedco</p>
          <SupplierSection
            supplierKey="nedco"
            label="Nedco"
            theme={themes.pink}
            visible={supplierVisibility.find(v => v.supplier === 'nedco')?.visible ?? false}
            toggling={togglingSupplier === 'nedco'}
            onToggleVisible={v => handleToggleVisibility('nedco', v)}
          />
          </div>

          {/* ─── FUTECH ─── */}
          <div>
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2 px-1">Futech</p>
          <SupplierSection
            supplierKey="futech"
            label="Futech"
            theme={themes.indigo}
            visible={supplierVisibility.find(v => v.supplier === 'futech')?.visible ?? false}
            toggling={togglingSupplier === 'futech'}
            onToggleVisible={v => handleToggleVisibility('futech', v)}
          />
          </div>

          {/* ─── DESCHÊNES ─── */}
          <div>
          <p className="text-xs font-bold text-teal-500 uppercase tracking-widest mb-2 px-1">Deschênes</p>
          <SupplierSection
            supplierKey="deschenes"
            label="Deschênes"
            theme={themes.teal}
            visible={supplierVisibility.find(v => v.supplier === 'deschenes')?.visible ?? false}
            toggling={togglingSupplier === 'deschenes'}
            onToggleVisible={v => handleToggleVisibility('deschenes', v)}
          />
          </div>

          {/* ─── RONA ─── */}
          <div>
          <p className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-2 px-1">Rona</p>
          <SupplierSection
            supplierKey="rona"
            label="Rona"
            theme={themes.purple}
            visible={supplierVisibility.find(v => v.supplier === 'rona')?.visible ?? false}
            toggling={togglingSupplier === 'rona'}
            onToggleVisible={v => handleToggleVisibility('rona', v)}
          />
          </div>

          </div>
          {/* end supplier credential forms grid */}
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

        {/* ─── MARKETING ─── */}
        <AccordionSection
          title="Marketing"
          icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" /></svg>}
          isOpen={openSection === 'marketing'}
          onToggle={() => toggleSection('marketing')}
        >
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Activer Marketing</h2>
                <p className="text-xs text-gray-500">Affiche l&apos;onglet Marketing dans la navigation</p>
              </div>
              <button onClick={handleMarketingToggle} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${marketingEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${marketingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-yellow-500 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
              Avis Google
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Lien vers votre page d&apos;avis Google. Utilisé pour demander des avis aux clients après un projet complété.
            </p>
            <form onSubmit={handleSaveReviewUrl} className="flex gap-2">
              <input
                type="url"
                value={googleReviewUrl}
                onChange={e => { setGoogleReviewUrl(e.target.value); setReviewUrlSaved(false); }}
                placeholder="https://g.page/r/..."
                className="flex-1 border border-gray-300 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={savingReviewUrl}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
              >
                {savingReviewUrl ? '...' : reviewUrlSaved ? '✅' : 'Sauvegarder'}
              </button>
            </form>
          </div>

          {/* Logo compagnie */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mt-3">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-blue-500 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" /></svg>
              Logo de la compagnie
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Votre logo sera affiché sur les montages Instagram générés.
            </p>
            {companyLogoUrl && (
              <div className="mb-3 flex items-center gap-3">
                <img src={companyLogoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white" />
                <span className="text-xs text-green-600 font-medium">Logo configuré</span>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/supplier/preference', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ companyLogoUrl: '' }),
                    });
                    setCompanyLogoUrl('');
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium ml-auto"
                >
                  Supprimer
                </button>
              </div>
            )}
            <label className="block">
              <span className="inline-flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition">
                {uploadingLogo ? 'Envoi...' : logoSaved ? 'Logo sauvegardé' : companyLogoUrl ? 'Changer le logo' : 'Importer un logo'}
              </span>
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
            </label>
          </div>
        </AccordionSection>

        {/* ─── Moyen de paiement ─── */}
        <AccordionSection
          title={t('payment_methods')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 21Z" /></svg>}
          isOpen={paymentOpen}
          onToggle={() => setPaymentOpen(o => !o)}
        >
          {payment?.configured ? (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">{payment.card_holder}</p>
                <p className="text-xs text-green-600 font-mono">•••• •••• •••• {payment.card_last4} · {payment.card_expiry}</p>
              </div>
              <button
                onClick={handleDeletePayment}
                disabled={deletingPayment}
                className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
              >
                {deletingPayment ? '...' : 'Supprimer'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic mb-4">Aucune carte configurée.</p>
          )}

          <form onSubmit={handleSavePayment} className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {payment?.configured ? 'Modifier la carte' : 'Ajouter une carte'}
            </p>
            <input
              type="text"
              placeholder="Nom sur la carte"
              value={paymentForm.card_holder}
              onChange={e => setPaymentForm(f => ({ ...f, card_holder: e.target.value }))}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <input
              type="text"
              placeholder="Numéro de carte (16 chiffres)"
              value={paymentForm.card_number}
              onChange={e => setPaymentForm(f => ({ ...f, card_number: e.target.value }))}
              required
              maxLength={19}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="MM/YY"
                value={paymentForm.card_expiry}
                onChange={e => setPaymentForm(f => ({ ...f, card_expiry: e.target.value }))}
                required
                maxLength={5}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <input
                type="password"
                placeholder="CVV"
                value={paymentForm.card_cvv}
                onChange={e => setPaymentForm(f => ({ ...f, card_cvv: e.target.value }))}
                required
                maxLength={4}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <button
              type="submit"
              disabled={savingPayment}
              className="w-full bg-yellow-400 text-slate-900 font-semibold py-2.5 rounded-xl text-sm hover:bg-yellow-300 disabled:opacity-50 transition"
            >
              {savingPayment ? t('saving') : paymentSaved ? '✅ ' + t('saved') : 'Sauvegarder la carte'}
            </button>
          </form>

          {/* Adresse du bureau + livraison par défaut */}
          <div className="mt-6 border-t border-gray-100 pt-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Adresse bureau</p>
            <form onSubmit={handleSaveDelivery} className="space-y-3">
              <input
                type="text"
                placeholder="Adresse du bureau (ex: 123 rue Principale, Montréal, QC)"
                value={officeAddress}
                onChange={e => setOfficeAddress(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <div>
                <p className="text-xs text-gray-500 mb-2">Livraison par défaut</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDefaultDelivery('office')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${defaultDelivery === 'office' ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    Bureau
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultDelivery('jobsite')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${defaultDelivery === 'jobsite' ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    Chantier
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={savingDelivery}
                className="w-full bg-gray-900 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-700 disabled:opacity-50 transition"
              >
                {savingDelivery ? t('saving') : deliverySaved ? '✅ ' + t('saved') : 'Sauvegarder'}
              </button>
            </form>
          </div>
        </AccordionSection>

        {/* ─── TESTER LES COMMANDES (admin only) ─── */}
        {user.role === 'admin' && (
          <AccordionSection
            title="Tester les commandes"
            icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>}
            isOpen={openSection === 'test-commandes'}
            onToggle={() => toggleSection('test-commandes')}
          >
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 space-y-4">
              <p className="text-sm text-purple-700">
                Lance une commande simulée (dry-run) pour tester le flow complet sans acheter.
              </p>

              <div>
                <label className="block text-sm font-medium text-purple-900 mb-1">Produit</label>
                <input
                  type="text"
                  value={testProduct}
                  onChange={e => setTestProduct(e.target.value)}
                  className="w-full rounded-lg border border-purple-200 px-3 py-2 text-sm"
                  placeholder="Fil 14/2 NMD90 150m"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-purple-900 mb-1">Fournisseur</label>
                <select
                  value={testSupplier}
                  onChange={e => setTestSupplier(e.target.value)}
                  className="w-full rounded-lg border border-purple-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Automatique (le moins cher)</option>
                  <option value="lumen">Lumen</option>
                  <option value="canac">Canac</option>
                  <option value="homedepot">Home Depot</option>
                  <option value="guillevin">Guillevin</option>
                  <option value="jsv">JSV</option>
                  <option value="westburne">Westburne</option>
                  <option value="nedco">Nedco</option>
                  <option value="futech">Futech</option>
                  <option value="deschenes">Deschênes</option>
                  <option value="bmr">BMR</option>
                  <option value="rona">Rona</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleRunTest}
                  disabled={testRunning || !testProduct.trim()}
                  className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 transition text-sm"
                >
                  {testRunning ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Test en cours...
                    </span>
                  ) : 'Lancer le test'}
                </button>
                {testResults.length > 0 && (
                  <button
                    onClick={handleCleanTests}
                    className="px-4 py-2.5 rounded-xl border border-purple-200 text-purple-700 text-sm hover:bg-purple-100 transition"
                  >
                    Nettoyer
                  </button>
                )}
              </div>

              {/* Résultats */}
              {testResults.length > 0 && (
                <div className="space-y-3 mt-2">
                  {testResults.map((r: any, i: number) => (
                    <div key={i} className="bg-white rounded-lg border border-purple-100 p-3 text-sm space-y-1">
                      {r.error ? (
                        <p className="text-red-600 font-medium">{r.error}</p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-purple-900">{r.product} x{r.quantity}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              r.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {r.success ? 'Succès' : 'Échoué'}
                            </span>
                          </div>
                          <p className="text-gray-600">
                            Fournisseur: <span className="font-medium capitalize">{r.supplier}</span>
                            {r.orderId && <> — #{r.orderId}</>}
                          </p>
                          {r.log?.length > 0 && (
                            <div className="text-xs text-gray-500 space-y-0.5 mt-1 bg-gray-50 rounded p-2">
                              {r.log.map((line: string, j: number) => (
                                <p key={j}>{line}</p>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AccordionSection>
        )}

        {/* ─── FACTURATION ─── */}
        <AccordionSection
          title={t('billing_title')}
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
