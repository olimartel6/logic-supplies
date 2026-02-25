# Multi-Tenant Architecture — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformer Sparky en architecture multi-tenant avec isolation complète par compagnie, un compte superadmin unique, et filtrage `company_id` sur toutes les requêtes API.

**Architecture:** Single SQLite DB avec `company_id` sur chaque table de données. Helper `getTenantContext()` injecte automatiquement `company_id` dans chaque route. Superadmin seedé en DB au démarrage. Fresh start — l'utilisateur supprime `sparky.db` avant de lancer.

**Tech Stack:** Next.js 14 App Router, better-sqlite3, iron-session, TypeScript, bcryptjs, Tailwind CSS.

---

## ⚠️ Avant de commencer

**Supprimer le fichier DB existant :**
```bash
rm -f "/Users/oli/Downloads/project sparky/app/sparky.db"
```
Toutes les données existantes seront perdues. C'est intentionnel (fresh start).

---

## Task 1 : DB Schema — Réécriture complète avec multi-tenant

**Fichiers :**
- Modifier : `app/lib/db.ts`

**Remplacer intégralement la fonction `initDb(db)` et ajouter `seedCompanyDefaults` par ceci :**

```typescript
export function seedCompanyDefaults(db: Database.Database, companyId: number) {
  // company_settings par défaut
  db.prepare(`
    INSERT OR IGNORE INTO company_settings (company_id, supplier_preference, large_order_threshold)
    VALUES (?, 'cheapest', 2000)
  `).run(companyId);

  // Catégories Lumen
  const lumenCategories = [
    { name: 'Fils et câbles',           url: '/en/products/28-wire-cords-cables',       enabled: 1 },
    { name: 'Disjoncteurs et panneaux', url: '/en/products/20-power-distribution',       enabled: 1 },
    { name: 'Boîtes et conduits',       url: '/en/products/11-conduit-raceway-strut',    enabled: 1 },
    { name: 'Éclairage',                url: '/en/products/18-lighting',                 enabled: 0 },
    { name: 'Automatisation',           url: '/en/products/12-control-automation',       enabled: 0 },
    { name: 'Outils',                   url: '/en/products/25-tools-instruments',        enabled: 0 },
  ];
  for (const c of lumenCategories) {
    db.prepare(
      "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('lumen', ?, ?, ?, ?)"
    ).run(c.name, c.url, c.enabled, companyId);
  }

  // Catégories Canac
  const canacCategories = [
    { name: 'Fils et câbles',           url: '/fr/c/electricite-fils-et-cables',                  enabled: 1 },
    { name: 'Disjoncteurs et panneaux', url: '/fr/c/electricite-disjoncteurs-et-panneaux',         enabled: 1 },
    { name: 'Boîtes et conduits',       url: '/fr/c/electricite-boites-et-conduits',               enabled: 0 },
    { name: 'Interrupteurs et prises',  url: '/fr/c/electricite-interrupteurs-et-prises',          enabled: 0 },
    { name: 'Éclairage',                url: '/fr/c/eclairage',                                    enabled: 0 },
  ];
  for (const c of canacCategories) {
    db.prepare(
      "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('canac', ?, ?, ?, ?)"
    ).run(c.name, c.url, c.enabled, companyId);
  }

  // Catégories Home Depot
  const hdCategories = [
    { name: 'Fils et câbles',           url: '/fr/b/Électricité-Câbles-et-câblage/N-5yc1vZbmg1',       enabled: 1 },
    { name: 'Disjoncteurs et panneaux', url: '/fr/b/Électricité-Disjoncteurs/N-5yc1vZc86v',             enabled: 1 },
    { name: 'Boîtes électriques',       url: '/fr/b/Électricité-Boîtes-électriques/N-5yc1vZbmde',      enabled: 0 },
    { name: 'Interrupteurs et prises',  url: '/fr/b/Électricité-Prises-et-interrupteurs/N-5yc1vZc7md', enabled: 0 },
    { name: 'Éclairage',                url: '/fr/b/Éclairage/N-5yc1vZbq6g',                           enabled: 0 },
  ];
  for (const c of hdCategories) {
    db.prepare(
      "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('homedepot', ?, ?, ?, ?)"
    ).run(c.name, c.url, c.enabled, companyId);
  }

  // Catégories Guillevin
  const guillevinCategories = [
    { name: 'Fils et câbles',           url: '/collections/wire-cable',             enabled: 1 },
    { name: 'Disjoncteurs et panneaux', url: '/collections/breakers-load-centres',  enabled: 1 },
    { name: 'Boîtes et conduits',       url: '/collections/conduit-fittings-boxes', enabled: 0 },
    { name: 'Luminaires',               url: '/collections/lighting',               enabled: 0 },
    { name: 'Outils',                   url: '/collections/tools',                  enabled: 0 },
  ];
  for (const c of guillevinCategories) {
    db.prepare(
      "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('guillevin', ?, ?, ?, ?)"
    ).run(c.name, c.url, c.enabled, companyId);
  }
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subscription_status TEXT DEFAULT 'active'
        CHECK(subscription_status IN ('active', 'suspended', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('electrician', 'office', 'admin', 'superadmin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, company_id)
    );

    CREATE TABLE IF NOT EXISTS job_sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      address TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed')),
      budget_total REAL DEFAULT NULL,
      budget_committed REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      product TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      job_site_id INTEGER REFERENCES job_sites(id),
      electrician_id INTEGER REFERENCES users(id),
      urgency INTEGER DEFAULT 0,
      note TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      office_comment TEXT,
      supplier TEXT,
      decision_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      supplier TEXT NOT NULL DEFAULT 'lumen',
      username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      session_cookies TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      request_id INTEGER REFERENCES requests(id),
      supplier TEXT NOT NULL DEFAULT 'lumen',
      supplier_order_id TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','failed')),
      cancel_token TEXT UNIQUE,
      cancel_expires_at DATETIME,
      ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier TEXT NOT NULL DEFAULT 'lumen',
      sku TEXT,
      name TEXT NOT NULL,
      image_url TEXT,
      price REAL,
      unit TEXT,
      category TEXT,
      last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(supplier, sku)
    );

    CREATE TABLE IF NOT EXISTS supplier_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      supplier TEXT NOT NULL DEFAULT 'lumen',
      category_name TEXT NOT NULL,
      category_url TEXT NOT NULL,
      enabled INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
      supplier_preference TEXT NOT NULL DEFAULT 'cheapest'
        CHECK(supplier_preference IN ('cheapest', 'fastest')),
      lumen_rep_email TEXT,
      large_order_threshold REAL DEFAULT 2000,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budget_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      job_site_id INTEGER REFERENCES job_sites(id),
      type TEXT NOT NULL CHECK(type IN ('80_percent', '100_percent', 'large_order')),
      amount REAL,
      message TEXT,
      seen INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_order_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      request_id INTEGER REFERENCES requests(id),
      action TEXT NOT NULL CHECK(action IN ('preview', 'download', 'email_sent')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
    CREATE INDEX IF NOT EXISTS idx_job_sites_company ON job_sites(company_id);
    CREATE INDEX IF NOT EXISTS idx_requests_company ON requests(company_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_accounts_company ON supplier_accounts(company_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_categories_company ON supplier_categories(company_id);
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_company ON budget_alerts(company_id);
  `);

  // Seed unique superadmin (company_id IS NULL — cross-tenant)
  const superHash = bcrypt.hashSync('changeme123', 10);
  db.prepare(`
    INSERT OR IGNORE INTO users (company_id, name, email, password, role)
    VALUES (NULL, 'Super Admin', 'superadmin@sparky.app', ?, 'superadmin')
  `).run(superHash);
}
```

**Supprimer** les anciennes fonctions de seeding Lumen/Canac/HD/Guillevin/admin dans `initDb` (remplacées par `seedCompanyDefaults` + superadmin seed ci-dessus).

**Vérification :** `npx tsc --noEmit --skipLibCheck` → zéro erreur.

---

## Task 2 : Session + Tenant Middleware

**Fichiers :**
- Modifier : `app/lib/session.ts`
- Créer : `app/lib/tenant.ts`

### `app/lib/session.ts` — Ajouter `companyId`

Remplacer l'interface `SessionData` par :
```typescript
export interface SessionData {
  userId?: number;
  companyId?: number | null;
  name?: string;
  email?: string;
  role?: string;
}
```

### `app/lib/tenant.ts` — Nouveau fichier

```typescript
import { NextResponse } from 'next/server';
import { getSession } from './session';

export interface TenantContext {
  userId: number;
  companyId: number | null;
  role: string;
}

type TenantResult = TenantContext | { error: ReturnType<typeof NextResponse.json> };

export async function getTenantContext(): Promise<TenantResult> {
  const session = await getSession();
  if (!session.userId) {
    return { error: NextResponse.json({ error: 'Non connecté' }, { status: 401 }) };
  }
  return {
    userId: session.userId,
    companyId: session.companyId ?? null,
    role: session.role || '',
  };
}

export async function requireSuperAdmin(): Promise<TenantResult> {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx;
  if (ctx.role !== 'superadmin') {
    return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) };
  }
  return ctx;
}

export async function requireAdmin(): Promise<TenantResult> {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx;
  if (!['admin', 'superadmin'].includes(ctx.role)) {
    return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) };
  }
  return ctx;
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → zéro erreur.

---

## Task 3 : Login + Auth/Me

**Fichiers :**
- Modifier : `app/app/api/auth/login/route.ts`
- Modifier : `app/app/api/auth/me/route.ts`

### `app/app/api/auth/login/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const db = getDb();

  // 1. Chercher superadmin (company_id IS NULL)
  let user = db.prepare(
    "SELECT * FROM users WHERE email = ? AND company_id IS NULL AND role = 'superadmin'"
  ).get(email) as any;

  // 2. Si pas superadmin, chercher dans les compagnies actives
  if (!user) {
    user = db.prepare(`
      SELECT u.* FROM users u
      JOIN companies c ON u.company_id = c.id
      WHERE u.email = ? AND c.subscription_status = 'active'
      LIMIT 1
    `).get(email) as any;
  }

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return NextResponse.json({ error: 'Email ou mot de passe invalide' }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.companyId = user.company_id ?? null;
  session.name = user.name;
  session.email = user.email;
  session.role = user.role;
  await session.save();

  return NextResponse.json({ role: user.role });
}
```

### `app/app/api/auth/me/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }
  return NextResponse.json({
    id: session.userId,
    companyId: session.companyId,
    name: session.name,
    email: session.email,
    role: session.role,
  });
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → zéro erreur.

---

## Task 4 : Superadmin APIs

**Fichiers :**
- Créer : `app/app/api/superadmin/companies/route.ts`
- Créer : `app/app/api/superadmin/companies/[id]/route.ts`

### `app/app/api/superadmin/companies/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb, seedCompanyDefaults } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/tenant';
import bcrypt from 'bcryptjs';

export async function GET() {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const companies = db.prepare(`
    SELECT c.*, COUNT(u.id) as user_count
    FROM companies c
    LEFT JOIN users u ON u.company_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();

  return NextResponse.json(companies);
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const { companyName, adminEmail, adminPassword, adminName } = await req.json();

  if (!companyName || !adminEmail || !adminPassword) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const db = getDb();

  const createCompany = db.transaction(() => {
    // 1. Créer la compagnie
    const companyResult = db.prepare(
      'INSERT INTO companies (name) VALUES (?)'
    ).run(companyName);
    const companyId = companyResult.lastInsertRowid as number;

    // 2. Seeder les paramètres et catégories par défaut
    seedCompanyDefaults(db, companyId);

    // 3. Créer l'admin principal
    const hash = bcrypt.hashSync(adminPassword, 10);
    const userResult = db.prepare(
      "INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, 'admin')"
    ).run(companyId, adminName || adminEmail, adminEmail, hash);

    return { companyId, userId: userResult.lastInsertRowid };
  });

  try {
    const result = createCompany();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Email admin déjà utilisé dans cette compagnie' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

### `app/app/api/superadmin/companies/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/tenant';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const { id } = await params;
  const { subscription_status } = await req.json();

  if (!['active', 'suspended', 'cancelled'].includes(subscription_status)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    'UPDATE companies SET subscription_status = ? WHERE id = ?'
  ).run(subscription_status, id);

  return NextResponse.json({ ok: true });
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → zéro erreur.

---

## Task 5 : Superadmin UI — `/superadmin`

**Fichiers :**
- Créer : `app/app/superadmin/page.tsx`

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Company {
  id: number;
  name: string;
  subscription_status: 'active' | 'suspended' | 'cancelled';
  created_at: string;
  user_count: number;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ companyName: '', adminEmail: '', adminPassword: '', adminName: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => {
      if (!u || u.role !== 'superadmin') { router.push('/'); return; }
      loadCompanies();
    });
  }, [router]);

  async function loadCompanies() {
    setLoading(true);
    const res = await fetch('/api/superadmin/companies');
    const data = await res.json();
    setCompanies(Array.isArray(data) ? data : []);
    setLoading(false);
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
          <h1 className="text-2xl font-bold">Super Admin — Sparky</h1>
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
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    c.subscription_status === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : c.subscription_status === 'suspended'
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {c.subscription_status}
                  </span>
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
      </div>
    </div>
  );
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → zéro erreur. Démarrer l'app et aller sur `/superadmin` → connecté en tant que superadmin → page visible.

---

## Task 6 : Routes de données — job-sites, requests, users, products

**Fichiers :**
- Modifier : `app/app/api/job-sites/route.ts`
- Modifier : `app/app/api/job-sites/[id]/route.ts`
- Modifier : `app/app/api/requests/route.ts`
- Modifier : `app/app/api/requests/[id]/route.ts`
- Modifier : `app/app/api/users/route.ts`
- Modifier : `app/app/api/products/route.ts`

**Lire chaque fichier avant de modifier.** Appliquer le pattern suivant dans CHAQUE route :

### Pattern universel

```typescript
// 1. Remplacer getSession() par getTenantContext()
import { getTenantContext } from '@/lib/tenant';

const ctx = await getTenantContext();
if ('error' in ctx) return ctx.error;

// 2. Ajouter company_id à TOUTES les queries SELECT/INSERT/UPDATE/DELETE
// SELECT → WHERE company_id = ctx.companyId
// INSERT → inclure company_id = ctx.companyId
// UPDATE/DELETE → AND company_id = ctx.companyId (protection cross-tenant)
```

### `app/app/api/job-sites/route.ts` — Réécrire :

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  const sites = db.prepare(
    "SELECT * FROM job_sites WHERE company_id = ? AND status = 'active' ORDER BY name"
  ).all(ctx.companyId);
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const { name, address } = await req.json();
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO job_sites (company_id, name, address) VALUES (?, ?, ?)'
  ).run(ctx.companyId, name, address || '');
  return NextResponse.json({ id: result.lastInsertRowid });
}
```

### `app/app/api/job-sites/[id]/route.ts` — Lire le fichier, puis :
- Ajouter `AND company_id = ctx.companyId` à tous les SELECT/UPDATE/DELETE
- Vérifier que le site appartient bien à la compagnie avant toute modification

### `app/app/api/requests/route.ts` — Lire le fichier, puis :
- GET electricien : ajouter `AND r.company_id = ?` et `AND j.company_id = ?`
- GET office/admin : ajouter `WHERE r.company_id = ?`
- POST : ajouter `company_id = ctx.companyId` dans l'INSERT
- POST email aux office users : filtrer `WHERE role IN ('office','admin') AND company_id = ?`

### `app/app/api/requests/[id]/route.ts` — Lire le fichier, puis :
- Toutes les queries sur `requests` : ajouter `AND company_id = ?`
- Query `company_settings` : `WHERE company_id = ctx.companyId` (au lieu de `WHERE id = 1`)
- Query office users pour email : `AND company_id = ctx.companyId`
- `supplier_orders` INSERT : ajouter `company_id = ctx.companyId`
- `budget_alerts` INSERT : ajouter `company_id = ctx.companyId`

### `app/app/api/users/route.ts` — Réécrire :

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import bcrypt from 'bcryptjs';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const db = getDb();
  const users = db.prepare(
    'SELECT id, name, email, role, created_at FROM users WHERE company_id = ? ORDER BY name'
  ).all(ctx.companyId);
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const { name, email, password, role } = await req.json();
  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(
      'INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)'
    ).run(ctx.companyId, name, email, hash, role);
    return NextResponse.json({ id: result.lastInsertRowid });
  } catch {
    return NextResponse.json({ error: 'Email déjà utilisé dans cette compagnie' }, { status: 400 });
  }
}
```

### `app/app/api/products/route.ts` — Lire le fichier, puis :
- Remplacer `WHERE id = 1` par `WHERE company_id = ?` pour la query `company_settings`
- Passer `ctx.companyId` comme paramètre

**Vérification :** `npx tsc --noEmit --skipLibCheck` → zéro erreur.

---

## Task 7 : Routes budget

**Fichiers :**
- Modifier : `app/app/api/budget/route.ts`
- Modifier : `app/app/api/budget/[id]/route.ts`
- Modifier : `app/app/api/budget/alerts/route.ts`
- Modifier : `app/app/api/budget/alerts/seen/route.ts`
- Modifier : `app/app/api/budget/export/route.ts`

**Lire chaque fichier. Appliquer le pattern universel (Task 6) :**

- `budget/route.ts` GET : `WHERE j.company_id = ?` et `WHERE a.company_id = ?`
- `budget/[id]/route.ts` PATCH : `WHERE id = ? AND company_id = ?`
- `budget/alerts/route.ts` GET : `WHERE company_id = ?`
- `budget/alerts/seen/route.ts` PATCH : `WHERE company_id = ?`
- `budget/export/route.ts` : toutes les queries filtrent par `company_id`

Dans chaque fichier, remplacer `getSession()` par `getTenantContext()` et ajouter `AND company_id = ctx.companyId` partout.

**Vérification :** `npx tsc --noEmit --skipLibCheck` → zéro erreur.

---

## Task 8 : Routes supplier

**Fichiers :**
- Modifier : `app/app/api/supplier/account/route.ts`
- Modifier : `app/app/api/supplier/categories/route.ts`
- Modifier : `app/app/api/supplier/preference/route.ts`
- Modifier : `app/app/api/supplier/import/route.ts`
- Modifier : `app/app/api/supplier/test/route.ts`
- Modifier : `app/app/api/supplier/session/route.ts`

**Lire chaque fichier. Appliquer le pattern universel :**

### `supplier/account/route.ts` :
- GET : `WHERE supplier = ? AND company_id = ?`
- POST : INSERT avec `company_id` / UPDATE vérifie `company_id`

### `supplier/categories/route.ts` :
- GET : `WHERE supplier = ? AND company_id = ?`
- POST/PATCH : inclure `company_id`

### `supplier/preference/route.ts` :
- GET : `WHERE company_id = ctx.companyId` (au lieu de `WHERE id = 1`)
- POST : `WHERE company_id = ctx.companyId`

### `supplier/import/route.ts` :
- Les fonctions d'import (importCanacCatalog, etc.) reçoivent les catégories depuis la DB
- S'assurer que les queries sur `supplier_accounts` et `supplier_categories` filtrent par `company_id`
- Lire le fichier et remplacer toutes les queries sans company_id

### `supplier/test/route.ts` :
- GET supplier account pour test : `WHERE supplier = ? AND company_id = ?`

### `supplier/session/route.ts` :
- GET/POST sur `supplier_accounts` : ajouter `AND company_id = ?`

**Vérification :** `npx tsc --noEmit --skipLibCheck` → zéro erreur.

---

## Task 9 : Routes restantes

**Fichiers :**
- Modifier : `app/app/api/purchase-order/[id]/route.ts`
- Modifier : `app/app/api/supplier/cancel/[token]/route.ts`

**Lire chaque fichier. Appliquer le pattern :**

### `purchase-order/[id]/route.ts` :
- GET request : `WHERE id = ? AND company_id = ?`
- POST log : INSERT avec `company_id`
- GET `company_settings` : `WHERE company_id = ctx.companyId`

### `supplier/cancel/[token]/route.ts` :
- Ce route utilise un `cancel_token` UUID (pas d'auth user)
- `supplier_orders` a maintenant un `company_id` — pas besoin de vérification ici car le token est unique
- Lire le fichier et vérifier s'il y a des queries sans company_id qui nécessitent correction

**Vérification finale :**
```bash
cd "/Users/oli/Downloads/project sparky/app"
npx tsc --noEmit --skipLibCheck 2>&1
```
Zéro erreur TypeScript. Démarrer l'app :
```bash
npm run dev
```
Aller sur `http://localhost:3000` → login avec `superadmin@sparky.app` / `changeme123` → redirect vers `/superadmin` → créer une première compagnie → se connecter avec l'admin créé → toutes les données sont isolées à cette compagnie.

---

## Notes importantes pour l'implémentation

1. **`sparky.db` doit être supprimé** avant le premier démarrage avec le nouveau code
2. **`canac-catalog.ts` et `guillevin-catalog.ts`** accèdent directement à la DB — leurs queries sur `supplier_accounts` et `supplier_categories` doivent être mises à jour pour filtrer par `company_id`. Ces fichiers sont appelés depuis `supplier/import/route.ts` qui connaît le `ctx.companyId`. Passer `companyId` en paramètre aux fonctions d'import.
3. **`supplier-router.ts`** accède à `supplier_accounts` — ajouter `company_id` à la query
4. **Mot de passe superadmin** : changer `changeme123` après le premier login (ou le paramétrer via env var `SUPERADMIN_PASSWORD`)
