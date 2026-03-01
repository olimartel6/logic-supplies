'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { useLang, useT } from '@/lib/LanguageContext';
import type { Lang } from '@/lib/i18n';

interface CurrentUser { id: number; name: string; email: string; role: string; inventoryEnabled?: boolean; }

export default function ProfilePage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const router = useRouter();

  // Email form
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Supplier preference
  const [preference, setPreference] = useState<'cheapest' | 'fastest'>('cheapest');
  const [prefSaved, setPrefSaved] = useState(false);

  const { lang, setLang } = useLang();
  const t = useT();
  const [langSaved, setLangSaved] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => {
      if (!u) return;
      setCurrentUser(u);
      setEmail(u.email);
      setLang((u.language as Lang) || 'fr');
    });
    fetch('/api/supplier/preference').then(r => r.json()).then((d: { preference: 'cheapest' | 'fastest' }) => {
      if (d?.preference) setPreference(d.preference);
    });
  }, [router]);

  function handlePreference(pref: 'cheapest' | 'fastest') {
    setPreference(pref);
    setPrefSaved(false);
    fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preference: pref }),
    }).then(() => { setPrefSaved(true); setTimeout(() => setPrefSaved(false), 2000); }).catch(() => {});
  }

  function handleLanguage(l: Lang) {
    setLang(l);
    setLangSaved(false);
    fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: l }),
    }).then(() => { setLangSaved(true); setTimeout(() => setLangSaved(false), 2000); }).catch(() => {});
  }

  async function handleEmailSave(e: React.FormEvent) {
    e.preventDefault();
    setEmailLoading(true);
    setEmailMsg(null);
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setEmailMsg(res.ok ? { ok: true, text: t('email_updated') } : { ok: false, text: data.error });
    setEmailLoading(false);
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setPwMsg({ ok: true, text: t('password_updated') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPwMsg({ ok: false, text: data.error });
    }
    setPwLoading(false);
  }

  if (!currentUser) return <div className="flex items-center justify-center min-h-screen"><p>{t('loading')}</p></div>;

  return (
    <div className="pb-20">
      <NavBar role={currentUser.role} name={currentUser.name} inventoryEnabled={currentUser.inventoryEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">{t('profile_title')}</h1>
        <p className="text-sm text-gray-500 mb-6">{currentUser.name}</p>

        {/* Préférence fournisseur — visible pour les électriciens */}
        {currentUser.role === 'electrician' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <h2 className="font-semibold text-gray-900 mb-1">{t('search_preference')}</h2>
            <p className="text-xs text-gray-500 mb-4">{t('search_preference_desc')}</p>
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              <button
                type="button"
                onClick={() => handlePreference('cheapest')}
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition ${
                  preference === 'cheapest' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {t('cheapest')}
              </button>
              <button
                type="button"
                onClick={() => handlePreference('fastest')}
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition border-l border-gray-200 ${
                  preference === 'fastest' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                </svg>
                {t('fastest')}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {preference === 'cheapest'
                ? t('cheapest_desc')
                : t('fastest_desc')}
            </p>
            {prefSaved && <p className="text-xs text-green-600 mt-1">{t('preference_saved')}</p>}
          </div>
        )}

        {/* Language */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-1">{t('language_label')}</h2>
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            {(['fr', 'en', 'es'] as Lang[]).map((l, i) => (
              <button
                key={l}
                type="button"
                onClick={() => handleLanguage(l)}
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
                  i > 0 ? 'border-l border-gray-200' : ''
                } ${lang === l ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {l === 'fr' ? 'Français' : l === 'en' ? 'English' : 'Español'}
              </button>
            ))}
          </div>
          {langSaved && <p className="text-xs text-green-600 mt-1">{t('language_saved')}</p>}
        </div>

        {/* Email */}
        <form onSubmit={handleEmailSave} className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 space-y-3">
          <h2 className="font-semibold text-gray-900">{t('email_address')}</h2>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ton@email.com"
          />
          {emailMsg && (
            <p className={`text-sm ${emailMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{emailMsg.text}</p>
          )}
          <button
            type="submit"
            disabled={emailLoading || email === currentUser.email}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition"
          >
            {emailLoading ? t('saving') : t('update_email')}
          </button>
        </form>

        {/* Password */}
        <form onSubmit={handlePasswordSave} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">{t('change_password')}</h2>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('current_password')}
          />
          <input
            type="password"
            required
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('new_password')}
          />
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('confirm_new_password')}
          />
          {pwMsg && (
            <p className={`text-sm ${pwMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{pwMsg.text}</p>
          )}
          <button
            type="submit"
            disabled={pwLoading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition"
          >
            {pwLoading ? t('saving') : t('update_password_btn')}
          </button>
        </form>
      </div>
    </div>
  );
}
