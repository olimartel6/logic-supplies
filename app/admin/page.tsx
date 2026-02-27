'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import AddressAutocomplete from '@/components/AddressAutocomplete';

interface User { id: number; name: string; email: string; role: string; auto_approve: number; }
interface JobSite { id: number; name: string; address: string; }
interface CurrentUser { name: string; role: string; inventoryEnabled?: boolean; }

export default function AdminPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [tab, setTab] = useState<'users' | 'sites'>('users');

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'electrician' });
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  // Job sites state
  const [sites, setSites] = useState<JobSite[]>([]);
  const [showSiteForm, setShowSiteForm] = useState(false);
  const [siteForm, setSiteForm] = useState({ name: '', address: '' });
  const [siteLoading, setSiteLoading] = useState(false);

  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => {
      if (!u) return;
      if (u.role !== 'admin') { router.push('/approvals'); return; }
      setCurrentUser(u);
    });
    loadUsers();
    loadSites();
  }, [router]);

  function loadUsers() {
    fetch('/api/users').then(r => r.json()).then(setUsers);
  }

  function loadSites() {
    fetch('/api/job-sites').then(r => r.json()).then(setSites);
  }

  async function handleDeleteUser(id: number) {
    if (!confirm('Supprimer cet employé ? Il ne pourra plus se connecter.')) return;
    setDeletingUserId(id);
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    loadUsers();
    setDeletingUserId(null);
  }

  async function handleToggleAutoApprove(id: number, current: number) {
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_approve: !current }),
    });
    loadUsers();
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setUserLoading(true);
    setUserError('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm),
    });
    const data = await res.json();
    if (!res.ok) { setUserError(data.error); setUserLoading(false); return; }
    setShowUserForm(false);
    setUserForm({ name: '', email: '', password: '', role: 'electrician' });
    loadUsers();
    setUserLoading(false);
  }

  async function handleCreateSite(e: React.FormEvent) {
    e.preventDefault();
    setSiteLoading(true);
    await fetch('/api/job-sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(siteForm),
    });
    setShowSiteForm(false);
    setSiteForm({ name: '', address: '' });
    loadSites();
    setSiteLoading(false);
  }

  async function handleDeleteSite(id: number) {
    if (!confirm('Archiver ce chantier ?')) return;
    await fetch(`/api/job-sites/${id}`, { method: 'DELETE' });
    loadSites();
  }

  const roleLabel: Record<string, string> = { electrician: 'Électricien', office: 'Bureau', admin: 'Admin' };
  const roleColor: Record<string, string> = { electrician: 'bg-blue-100 text-blue-800', office: 'bg-purple-100 text-purple-800', admin: 'bg-gray-100 text-gray-800' };

  if (!currentUser) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  return (
    <div className="pb-20">
      <NavBar role={currentUser.role} name={currentUser.name} inventoryEnabled={currentUser.inventoryEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-gray-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          Administration
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setTab('users')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${tab === 'users' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
          >
            Utilisateurs
          </button>
          <button
            onClick={() => setTab('sites')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${tab === 'sites' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
          >
            Chantiers
          </button>
        </div>

        {/* Users tab */}
        {tab === 'users' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">{users.length} utilisateur{users.length > 1 ? 's' : ''}</p>
              <button onClick={() => setShowUserForm(!showUserForm)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                + Ajouter
              </button>
            </div>

            {showUserForm && (
              <form onSubmit={handleCreateUser} className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">
                <h2 className="font-semibold text-gray-900">Nouvel utilisateur</h2>
                <input type="text" placeholder="Nom complet" required value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="email" placeholder="Email" required value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="password" placeholder="Mot de passe" required value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
<select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="electrician">Électricien</option>
                  <option value="office">Bureau</option>
                  <option value="admin">Admin</option>
                </select>
                {userError && <p className="text-red-500 text-sm">{userError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowUserForm(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium">Annuler</button>
                  <button type="submit" disabled={userLoading} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                    {userLoading ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{u.name}</p>
                      <p className="text-sm text-gray-500">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor[u.role]}`}>
                        {roleLabel[u.role]}
                      </span>
                      {u.role === 'electrician' && (
                        <button
                          onClick={() => handleToggleAutoApprove(u.id, u.auto_approve)}
                          title={u.auto_approve ? 'Auto-approuvé — cliquer pour désactiver' : 'Cliquer pour activer auto-approbation'}
                          className={`text-xs px-2 py-1 rounded-full font-medium transition ${
                            u.auto_approve
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                        >
                          {u.auto_approve ? 'Auto ✓' : 'Auto'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        disabled={deletingUserId === u.id}
                        className="text-gray-300 hover:text-red-500 transition disabled:opacity-40 p-1 rounded-lg hover:bg-red-50"
                        title="Supprimer"
                      >
                        {deletingUserId === u.id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Job sites tab */}
        {tab === 'sites' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">{sites.length} chantier{sites.length > 1 ? 's' : ''} actif{sites.length > 1 ? 's' : ''}</p>
              <button onClick={() => setShowSiteForm(!showSiteForm)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                + Ajouter
              </button>
            </div>

            {showSiteForm && (
              <form onSubmit={handleCreateSite} className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">
                <h2 className="font-semibold text-gray-900">Nouveau chantier</h2>
                <input type="text" placeholder="Nom du chantier *" required value={siteForm.name} onChange={e => setSiteForm({ ...siteForm, name: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <AddressAutocomplete
                  value={siteForm.address}
                  onChange={v => setSiteForm({ ...siteForm, address: v })}
                  placeholder="Adresse (optionnel)"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowSiteForm(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium">Annuler</button>
                  <button type="submit" disabled={siteLoading} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                    {siteLoading ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {sites.map(s => (
                <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      {s.address && <p className="text-sm text-gray-500">{s.address}</p>}
                    </div>
                    <button
                      onClick={() => handleDeleteSite(s.id)}
                      className="text-red-400 hover:text-red-600 text-sm font-medium transition"
                    >
                      Archiver
                    </button>
                  </div>
                </div>
              ))}
              {sites.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <p>Aucun chantier actif</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
