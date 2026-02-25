'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms || !acceptedPrivacy) return;
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }
    if (data.role === 'superadmin') {
      router.push('/superadmin');
    } else if (data.role === 'electrician') {
      router.push('/my-requests');
    } else {
      router.push('/approvals');
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms || !acceptedPrivacy) return;
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, adminName, adminEmail: email, adminPassword: password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }
    window.location.href = data.url;
  }

  const canSubmit = acceptedTerms && acceptedPrivacy && !loading;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="bg-[#091D4A] rounded-2xl px-6 py-5 flex items-center justify-center gap-4 shadow-lg">
            <img src="/logo-shield.svg" className="h-16 w-auto flex-shrink-0" alt="LogicSupplies" />
            <div>
              <div className="flex items-baseline leading-none">
                <span className="text-[2rem] font-extrabold text-white tracking-tight">Logic</span>
                <span className="text-[2rem] font-extrabold text-blue-400 tracking-tight">Supplies</span>
              </div>
              <p className="text-[0.65rem] text-slate-400 tracking-[0.18em] font-medium mt-1 uppercase">
                — Maîtrisez vos dépenses —
              </p>
            </div>
          </div>
        </div>
        <form onSubmit={mode === 'signin' ? handleLogin : handleSignUp} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${mode === 'signin' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${mode === 'signup' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Créer un compte
            </button>
          </div>

          {/* Sign-up only fields */}
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la compagnie</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Électrique ABC Inc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Votre nom</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={e => setAdminName(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jean Tremblay"
                />
              </div>
            </>
          )}

          {/* Shared fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ton@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {/* Legal checkboxes */}
          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={e => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                J&apos;accepte les{' '}
                <Link href="/conditions-dutilisation" target="_blank" className="text-blue-600 hover:underline font-medium">
                  Conditions d&apos;utilisation
                </Link>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={e => setAcceptedPrivacy(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                J&apos;accepte la{' '}
                <Link href="/politique-de-confidentialite" target="_blank" className="text-blue-600 hover:underline font-medium">
                  Politique de confidentialité
                </Link>
              </span>
            </label>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {loading
              ? (mode === 'signup' ? 'Redirection vers le paiement...' : 'Connexion...')
              : (mode === 'signup' ? 'Continuer vers le paiement →' : 'Se connecter')}
          </button>
        </form>
      </div>
    </div>
  );
}
