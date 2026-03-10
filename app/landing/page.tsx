import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LogicSupplies — Simplifiez vos commandes de matériaux',
  description: 'La plateforme qui simplifie l\'approvisionnement pour les entreprises de construction du Québec.',
};

const APP_URL = 'https://logic-supplies-production.up.railway.app';

const suppliers = [
  'Lumen', 'Canac', 'Home Depot', 'Guillevin', 'JSV',
  'Westburne', 'Nedco', 'Futech', 'Deschênes', 'BMR', 'Rona',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* ── Navbar ── */}
      <nav className="bg-[#0f172a] sticky top-0 z-50 border-b border-slate-700/50">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/landing/logo.png" alt="LogicSupplies" className="h-10 w-10 rounded-lg" />
            <div>
              <span className="text-xl font-bold text-white">Logic</span>
              <span className="text-xl font-bold text-blue-400">Supplies</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#contact" className="text-sm text-slate-300 hover:text-white transition hidden sm:block">
              Nous contacter
            </a>
            <a href={`${APP_URL}/`} className="text-sm text-slate-300 hover:text-white transition hidden sm:block">
              Se connecter
            </a>
            <a href={`${APP_URL}/?mode=signup`} className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition">
              Commencer
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 relative">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm text-blue-300">Disponible maintenant</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
                Gérez vos commandes{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                  de matériaux
                </span>{' '}
                en un clic
              </h1>
              <p className="text-lg text-slate-300 mb-4 leading-relaxed max-w-lg">
                La plateforme tout-en-un qui simplifie l'approvisionnement pour les entreprises de construction du Québec — électriciens, plombiers, charpentiers, ferblantiers et plus.
              </p>
              <ul className="text-slate-400 mb-8 space-y-2 max-w-lg">
                <li className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Comparez les prix de 11 fournisseurs instantanément
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Commandes passées automatiquement après approbation
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Suivi des budgets, inventaire et chantiers
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href={`${APP_URL}/?mode=signup`} className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-4 rounded-xl text-center transition shadow-lg shadow-blue-500/25">
                  Créer un compte gratuit
                </a>
                <a href={`${APP_URL}/`} className="border border-slate-500 hover:border-slate-400 text-slate-300 hover:text-white font-semibold px-8 py-4 rounded-xl text-center transition">
                  Se connecter
                </a>
              </div>
            </div>
            <div className="relative hidden md:block">
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-2 shadow-2xl transform rotate-1 hover:rotate-0 transition duration-500">
                <img src="/landing/screenshot-dashboard.png" alt="Dashboard LogicSupplies" className="rounded-xl w-full" />
              </div>
              <div className="absolute -bottom-8 -left-8 w-44 bg-slate-800/80 rounded-2xl border border-slate-700/50 p-1.5 shadow-2xl transform -rotate-3 hover:rotate-0 transition duration-500">
                <img src="/landing/screenshot-dashboard-mobile.png" alt="App mobile" className="rounded-xl w-full" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Comment ça marche</h2>
            <p className="text-lg text-gray-500">How it works</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '1', title: 'Créez votre compte', titleEn: 'Create your account', desc: 'Inscrivez votre entreprise et invitez vos employés en quelques clics. Chaque membre reçoit son propre accès.' },
              { step: '2', title: 'Connectez vos fournisseurs', titleEn: 'Connect your suppliers', desc: 'Ajoutez vos comptes fournisseurs (Lumen, Canac, Home Depot, etc.) dans les paramètres. Vos identifiants sont chiffrés AES-256.' },
              { step: '3', title: 'Vos employés commandent', titleEn: 'Your employees order', desc: 'Vos employés font leurs demandes de matériel depuis le terrain. Le meilleur prix est trouvé automatiquement.' },
              { step: '4', title: 'Vous approuvez, on commande', titleEn: 'You approve, we order', desc: 'Approuvez les demandes en un clic. La commande est passée automatiquement chez le fournisseur le moins cher.' },
            ].map((s, i) => (
              <div key={i} className="relative">
                <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center text-xl font-bold mb-4">
                  {s.step}
                </div>
                {i < 3 && <div className="hidden md:block absolute top-6 left-14 w-[calc(100%-3rem)] h-0.5 bg-blue-200" />}
                <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                <p className="text-gray-400 text-xs mt-2 italic">{s.titleEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fonctionnalités principales ── */}
      <section className="py-20 md:py-28 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Fonctionnalités principales</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Tout ce dont une entreprise de construction a besoin pour gérer ses achats efficacement
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                ),
                title: 'Comparaison de prix automatique',
                desc: 'Pour chaque produit demandé, LogicSupplies compare les prix chez vos 11 fournisseurs connectés et sélectionne le meilleur offre. Économisez sans effort.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: 'Système d\'approbation',
                desc: 'Les employés soumettent des demandes de matériel. Les patrons reçoivent une notification, voient le prix et approuvent ou rejettent en un clic. Contrôle total des dépenses.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                ),
                title: 'Commande automatisée',
                desc: 'Dès qu\'une demande est approuvée, la commande est passée automatiquement sur le site du fournisseur. Pas besoin de se connecter manuellement à chaque site.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                ),
                title: 'Suivi budgétaire',
                desc: 'Visualisez vos dépenses par mois, par projet et par fournisseur. Exportez des rapports Excel détaillés. Gardez le contrôle de votre budget.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                ),
                title: 'Gestion d\'inventaire',
                desc: 'Suivez votre stock en temps réel. Scannez les codes-barres avec la caméra pour ajouter des articles. Gérez vos emplacements de stockage et vos chantiers.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                ),
                title: 'Messagerie d\'équipe',
                desc: 'Communiquez directement avec votre équipe dans l\'app. Envoyez des messages, partagez des infos sur les commandes et coordonnez vos achats.',
              },
            ].map((f, i) => (
              <div key={i} className="bg-white rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition group">
                <div className="w-14 h-14 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-500 group-hover:text-white transition">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                <p className="text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Personnalisable ── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-6">
                <span className="text-sm text-purple-600 font-medium">Sur mesure</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Personnalisable pour chaque compagnie</h2>
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                Chaque entreprise est différente. LogicSupplies s'adapte à vos besoins spécifiques — que vous soyez électricien, plombier, charpentier ou ferblantier.
              </p>
              <ul className="space-y-4 text-gray-600">
                <li className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span><strong>Vos fournisseurs</strong> — Connectez uniquement les fournisseurs que vous utilisez</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span><strong>Vos rôles</strong> — Configurez les permissions par employé (qui peut commander, qui approuve)</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span><strong>Vos chantiers</strong> — Organisez vos projets et budgets selon votre structure</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span><strong>Vos besoins</strong> — Besoin d'une fonctionnalité spécifique? Contactez-nous pour une solution adaptée</span>
                </li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: '⚡', title: 'Électricien', desc: 'Fil, disjoncteurs, panneaux, luminaires' },
                { icon: '🔧', title: 'Plombier', desc: 'Tuyaux, raccords, robinets, chauffe-eau' },
                { icon: '🪵', title: 'Charpentier', desc: 'Bois, clous, vis, quincaillerie' },
                { icon: '🏠', title: 'Ferblantier', desc: 'Tôle, gouttières, ventilation, solin' },
              ].map((t, i) => (
                <div key={i} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 text-center hover:shadow-md transition">
                  <span className="text-3xl mb-3 block">{t.icon}</span>
                  <h3 className="font-bold mb-1">{t.title}</h3>
                  <p className="text-sm text-gray-500">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Screenshots showcase ── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Une interface intuitive</h2>
            <p className="text-lg text-gray-500">Conçue pour le terrain — rapide, simple, efficace</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition">
                <img src="/landing/screenshot-dashboard.png" alt="Approbations" className="rounded-xl w-full" />
                <p className="text-center text-sm font-medium text-gray-600 mt-3 mb-1">
                  Tableau de bord — Approuvez les demandes en un clic
                </p>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition">
                <img src="/landing/screenshot-settings.png" alt="Paramètres" className="rounded-xl w-full" />
                <p className="text-center text-sm font-medium text-gray-600 mt-3 mb-1">
                  Paramètres — Fournisseurs, alertes, paiement, facturation
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition">
                <img src="/landing/screenshot-inventory.png" alt="Inventaire" className="rounded-xl w-full" />
                <p className="text-center text-sm font-medium text-gray-600 mt-3 mb-1">
                  Inventaire — Suivi des commandes et gestion du stock
                </p>
              </div>
              <div className="flex justify-center items-center gap-4 pt-4">
                <div className="w-48 bg-gray-50 rounded-2xl border border-gray-200 p-2 shadow-sm">
                  <img src="/landing/screenshot-login-mobile.png" alt="Login mobile" className="rounded-xl w-full" />
                  <p className="text-center text-xs font-medium text-gray-500 mt-2 mb-1">Connexion mobile</p>
                </div>
                <div className="w-48 bg-gray-50 rounded-2xl border border-gray-200 p-2 shadow-sm">
                  <img src="/landing/screenshot-dashboard-mobile.png" alt="Dashboard mobile" className="rounded-xl w-full" />
                  <p className="text-center text-xs font-medium text-gray-500 mt-2 mb-1">Dashboard mobile</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pour qui? ── */}
      <section className="py-20 md:py-28 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Conçu pour la construction</h2>
            <p className="text-lg text-gray-500">Built for construction companies</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="text-3xl mb-4">👷</div>
              <h3 className="text-xl font-bold mb-3">Pour les employés</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Faites vos demandes de matériel directement depuis le chantier
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Scannez les codes-barres pour identifier les produits
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Suivez le statut de vos demandes en temps réel
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Fonctionne hors-ligne sur les chantiers sans WiFi
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="text-3xl mb-4">📋</div>
              <h3 className="text-xl font-bold mb-3">Pour les patrons</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Approuvez ou rejetez les demandes avec le prix affiché
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Contrôlez les budgets par projet et par mois
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Exportez des rapports Excel pour la comptabilité
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Gérez les comptes fournisseurs et les méthodes de paiement
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Plus de fonctionnalités ── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Et bien plus encore</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '📱', title: 'App mobile native', desc: 'Bientôt disponible sur App Store et Google Play pour iOS et Android' },
              { icon: '📷', title: 'Scanner de codes-barres', desc: 'Identifiez vos produits en scannant le code-barre avec la caméra de votre téléphone' },
              { icon: '🏗️', title: 'Gestion de chantiers', desc: 'Créez des projets, assignez du matériel par chantier et suivez les coûts par projet' },
              { icon: '📊', title: 'Rapports Excel', desc: 'Exportez vos données avec comparaison de prix annuelle pour votre comptable' },
              { icon: '🔔', title: 'Notifications push', desc: 'Recevez des alertes en temps réel pour les nouvelles demandes et approbations' },
              { icon: '📶', title: 'Mode hors-ligne', desc: 'Accédez à vos données même sans internet grâce au cache intelligent (PWA)' },
              { icon: '🔒', title: 'Sécurité avancée', desc: 'Vos identifiants fournisseurs sont chiffrés AES-256. Connexion sécurisée avec cookies chiffrés' },
              { icon: '💬', title: 'Messagerie intégrée', desc: 'Communiquez avec votre équipe sans quitter l\'app. Messages lus/non-lus et notifications' },
            ].map((f, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-6 hover:bg-blue-50 transition border border-gray-100">
                <span className="text-2xl mb-3 block">{f.icon}</span>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Suppliers ── */}
      <section className="py-16 bg-slate-50 border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Connecté à vos fournisseurs</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              LogicSupplies se connecte directement aux sites de vos fournisseurs pour comparer les prix et passer les commandes automatiquement.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {suppliers.map((s) => (
              <div key={s} className="bg-white border border-gray-200 rounded-xl px-6 py-3 font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-600 transition shadow-sm">
                {s}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400 mt-6">
            + d'autres fournisseurs ajoutés régulièrement
          </p>
        </div>
      </section>

      {/* ── Multi-platform ── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <img src="/landing/logo.png" alt="LogicSupplies" className="w-24 h-24 mx-auto mb-8 rounded-2xl shadow-lg" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Disponible sur tous vos appareils
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Accédez à LogicSupplies depuis votre ordinateur, tablette ou téléphone.
            L'app fonctionne sur tous les navigateurs et bientôt en app native.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <div className="bg-gray-900 text-white rounded-xl px-6 py-3 flex items-center gap-3 opacity-70">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-wider opacity-70">Bientôt sur</p>
                <p className="text-sm font-semibold -mt-0.5">App Store</p>
              </div>
            </div>
            <div className="bg-gray-900 text-white rounded-xl px-6 py-3 flex items-center gap-3 opacity-70">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.18 23.76c.42.26.88.44 1.34.44.46 0 .93-.18 1.34-.44l8.33-4.88-3.2-2.74-7.81 7.62zm-.18-2.17V2.41c0-.31.07-.6.18-.87L11 9.62l-8 8v3.97zM20.16 10.33L17 8.49l-3.5 3.13 3.5 3L20.16 13.67c.7-.41 1.04-.89 1.04-1.67s-.34-1.26-1.04-1.67zM15.6 7.67L5.3.75C4.88.49 4.42.31 3.96.31c-.46 0-.92.18-1.34.44l9.87 9.63 3.11-2.71z" />
              </svg>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-wider opacity-70">Bientôt sur</p>
                <p className="text-sm font-semibold -mt-0.5">Google Play</p>
              </div>
            </div>
            <div className="bg-blue-600 text-white rounded-xl px-6 py-3 flex items-center gap-3">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-wider opacity-80">Disponible</p>
                <p className="text-sm font-semibold -mt-0.5">Web App</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="py-20 md:py-28 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Nous contacter</h2>
            <p className="text-lg text-gray-500">
              Une question? Besoin d'une démo? Envie de personnaliser l'app pour votre compagnie? Écrivez-nous.
            </p>
          </div>
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-bold text-lg mb-4">Contactez-nous par courriel</h3>
                <a href="mailto:info@logicsupplies.ca" className="text-blue-600 hover:text-blue-700 text-lg font-semibold transition">
                  info@logicsupplies.ca
                </a>
                <p className="text-gray-500 mt-4 leading-relaxed">
                  Nous répondons généralement en moins de 24 heures. Décrivez vos besoins et nous vous proposerons une solution adaptée.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg mb-4">Ce qu'on peut faire pour vous</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Démo personnalisée de la plateforme
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Configuration sur mesure pour votre entreprise
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Ajout de fournisseurs spécifiques à votre métier
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Support à l'intégration et formation
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] py-20 md:py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <img src="/landing/logo.png" alt="LogicSupplies" className="w-20 h-20 mx-auto mb-8 rounded-2xl shadow-lg" />
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Prêt à simplifier vos commandes?
          </h2>
          <p className="text-lg text-slate-300 mb-2">Ready to simplify your orders?</p>
          <p className="text-slate-400 mb-8 max-w-xl mx-auto">
            Créez votre compte gratuitement et connectez vos fournisseurs en quelques minutes.
            Aucune carte de crédit requise.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={`${APP_URL}/?mode=signup`} className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-semibold px-10 py-4 rounded-xl text-lg transition shadow-lg shadow-blue-500/25">
              Commencer maintenant — C'est gratuit
            </a>
            <a href={`${APP_URL}/`} className="inline-block border border-slate-500 hover:border-slate-400 text-slate-300 hover:text-white font-semibold px-10 py-4 rounded-xl text-lg transition">
              Se connecter
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#0f172a] border-t border-slate-800 py-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/landing/logo.png" alt="LogicSupplies" className="h-8 w-8 rounded-md" />
              <span className="text-lg font-bold text-white">Logic</span>
              <span className="text-lg font-bold text-blue-400">Supplies</span>
            </div>
            <div className="flex gap-6 text-sm text-slate-400">
              <a href={`${APP_URL}/conditions-dutilisation`} className="hover:text-white transition">
                Conditions d'utilisation
              </a>
              <a href={`${APP_URL}/politique-de-confidentialite`} className="hover:text-white transition">
                Politique de confidentialité
              </a>
            </div>
            <p className="text-sm text-slate-500">
              © 2026 LogicSupplies. Tous droits réservés.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
