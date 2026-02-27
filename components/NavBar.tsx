'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavBarProps {
  role: string;
  name: string;
  inventoryEnabled?: boolean;
}

const IconPlus = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const IconClipboard = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2" />
  </svg>
);

const IconCheckBadge = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
  </svg>
);

const IconList = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

const IconGear = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const IconUsers = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
  </svg>
);

const IconChartBar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);

const IconBox = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
  </svg>
);

const IconCreditCard = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 21Z" />
  </svg>
);

export default function NavBar({ role, name, inventoryEnabled }: NavBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [unseenAlerts, setUnseenAlerts] = useState(0);

  const isElectrician = role === 'electrician';
  const isOfficeOrAdmin = role === 'office' || role === 'admin';

  useEffect(() => {
    if (isOfficeOrAdmin) {
      fetch('/api/budget')
        .then(r => r.json())
        .then(d => setUnseenAlerts(d.totalUnseen || 0))
        .catch(() => {});
    }
  }, [isOfficeOrAdmin]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  const linkClass = (path: string) =>
    `flex flex-col items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium transition-colors ${
      pathname === path ? 'text-yellow-400' : 'text-slate-400 hover:text-white'
    }`;

  return (
    <>
      {/* Top bar */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2.5">
          <img src="/logo-shield.svg" className="h-8 w-auto flex-shrink-0" alt="LogicSupplies" />
          <div className="flex flex-col leading-none gap-0.5">
            <span className="font-extrabold text-white text-sm tracking-wide">Logic</span>
            <span className="font-extrabold text-blue-400 text-sm tracking-wide">Supplies</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">{name}</span>
          <button onClick={logout} className="text-sm text-slate-400 hover:text-red-400 transition">
            Déconnexion
          </button>
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 px-2 py-3 z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.3)]">
        <div className="flex justify-around max-w-lg mx-auto">
          {isElectrician && (
            <>
              <button onClick={() => router.push('/new-request')} className={linkClass('/new-request')}>
                <IconPlus />
                <span>Nouvelle</span>
              </button>
              <button onClick={() => router.push('/my-requests')} className={linkClass('/my-requests')}>
                <IconClipboard />
                <span>Mes demandes</span>
              </button>
              {inventoryEnabled && (
                <button onClick={() => router.push('/inventory')} className={linkClass('/inventory')}>
                  <IconBox />
                  <span>Inventaire</span>
                </button>
              )}
              <button onClick={() => router.push('/profile')} className={linkClass('/profile')}>
                <IconGear />
                <span>Profil</span>
              </button>
            </>
          )}
          {isOfficeOrAdmin && (
            <>
              <button onClick={() => router.push('/approvals')} className={linkClass('/approvals')}>
                <IconCheckBadge />
                <span>Approbations</span>
              </button>
              <button onClick={() => router.push('/approvals?all=1')} className={linkClass('/approvals?all=1')}>
                <IconList />
                <span>Toutes</span>
              </button>
              <button onClick={() => router.push('/budget')} className={`${linkClass('/budget')} relative`}>
                <span className="relative">
                  <IconChartBar />
                  {unseenAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {unseenAlerts > 9 ? '9+' : unseenAlerts}
                    </span>
                  )}
                </span>
                <span>Budget</span>
              </button>
              {inventoryEnabled && (
                <button onClick={() => router.push('/inventory')} className={linkClass('/inventory')}>
                  <IconBox />
                  <span>Inventaire</span>
                </button>
              )}
            </>
          )}
          {role === 'admin' && (
            <button onClick={() => router.push('/admin')} className={linkClass('/admin')}>
              <IconUsers />
              <span>Admin</span>
            </button>
          )}

          {isOfficeOrAdmin && (
            <button onClick={() => router.push('/settings')} className={linkClass('/settings')}>
              <IconGear />
              <span>Paramètres</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
