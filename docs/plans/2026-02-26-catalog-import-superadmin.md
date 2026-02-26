# Catalog Import Super Admin — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre au super admin d'importer le catalogue produits des 4 fournisseurs (Lumen, Canac, Home Depot, Guillevin) depuis une nouvelle section dans `/superadmin`, avec ses propres credentials et une progress bar en temps réel.

**Architecture:** 3 couches — (1) credentials super admin stockés dans `supplier_accounts` avec `company_id = 0` (SQLite n'enforce pas les FK par défaut), catégories seeded avec `seedSuperadminCategories()`, (2) 3 nouvelles API routes SSE sous `/api/superadmin/catalog/`, (3) nouvelle section "Catalogues fournisseurs" dans `app/superadmin/page.tsx` avec 4 cartes fournisseur + bouton global.

**Tech Stack:** Next.js API Routes, better-sqlite3, SSE (ReadableStream), React useState, Tailwind CSS, TypeScript, `@/lib/encrypt`, `requireSuperAdmin()`

---

### Task 1: DB — helper seedSuperadminCategories

**Files:**
- Modify: `app/lib/db.ts`

**Step 1: Lire le fichier pour trouver où ajouter la fonction**

Lire `app/lib/db.ts` autour de la ligne 96 (après `seedCompanyDefaults`).

**Step 2: Ajouter la fonction `seedSuperadminCategories`**

Juste après la fermeture de `seedCompanyDefaults` (après la ligne `seed();` et `}`), ajouter :

```typescript
export function seedSuperadminCategories(db: Database.Database) {
  // Utilise company_id = 0 comme sentinelle super admin
  // SQLite n'enforce pas les FK par défaut (pas de PRAGMA foreign_keys = ON)
  const seed = db.transaction(() => {
    const allCategories: Array<{ supplier: string; name: string; url: string }> = [
      // Lumen
      { supplier: 'lumen', name: 'Fils et câbles',           url: '/en/products/28-wire-cords-cables' },
      { supplier: 'lumen', name: 'Disjoncteurs et panneaux', url: '/en/products/20-power-distribution' },
      { supplier: 'lumen', name: 'Boîtes et conduits',       url: '/en/products/11-conduit-raceway-strut' },
      { supplier: 'lumen', name: 'Éclairage',                url: '/en/products/18-lighting' },
      { supplier: 'lumen', name: 'Automatisation',           url: '/en/products/12-control-automation' },
      { supplier: 'lumen', name: 'Outils',                   url: '/en/products/25-tools-instruments' },
      // Canac
      { supplier: 'canac', name: 'Fils et câbles',           url: '/canac/fr/2/c/EL25' },
      { supplier: 'canac', name: 'Disjoncteurs et panneaux', url: '/canac/fr/2/c/EL45' },
      { supplier: 'canac', name: 'Boîtes et conduits',       url: '/canac/fr/2/c/EL20' },
      { supplier: 'canac', name: 'Interrupteurs et prises',  url: '/canac/fr/2/c/EL55' },
      { supplier: 'canac', name: 'Éclairage',                url: '/canac/fr/2/c/EL35' },
      // Home Depot
      { supplier: 'homedepot', name: 'Fils et câbles',           url: '/fr/b/Électricité-Câbles-et-câblage/N-5yc1vZbmg1' },
      { supplier: 'homedepot', name: 'Disjoncteurs et panneaux', url: '/fr/b/Électricité-Disjoncteurs/N-5yc1vZc86v' },
      { supplier: 'homedepot', name: 'Boîtes électriques',       url: '/fr/b/Électricité-Boîtes-électriques/N-5yc1vZbmde' },
      { supplier: 'homedepot', name: 'Interrupteurs et prises',  url: '/fr/b/Électricité-Prises-et-interrupteurs/N-5yc1vZc7md' },
      { supplier: 'homedepot', name: 'Éclairage',                url: '/fr/b/Éclairage/N-5yc1vZbq6g' },
      // Guillevin
      { supplier: 'guillevin', name: 'Fils et câbles',           url: '/collections/wire-cable' },
      { supplier: 'guillevin', name: 'Disjoncteurs et panneaux', url: '/collections/breakers-load-centres' },
      { supplier: 'guillevin', name: 'Boîtes et conduits',       url: '/collections/conduit-fittings-boxes' },
      { supplier: 'guillevin', name: 'Luminaires',               url: '/collections/lighting' },
      { supplier: 'guillevin', name: 'Outils',                   url: '/collections/tools' },
    ];
    for (const c of allCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES (?, ?, ?, 1, 0)"
      ).run(c.supplier, c.name, c.url);
    }
  });
  seed();
}
```

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/db.ts && git commit -m "feat: add seedSuperadminCategories helper (company_id=0)"
```

---

### Task 2: API — gestion des comptes fournisseur super admin

**Files:**
- Create: `app/app/api/superadmin/catalog/account/route.ts`

**Step 1: Regarder un exemple d'API superadmin existant pour le pattern**

Lire `app/app/api/superadmin/companies/route.ts` pour le pattern `requireSuperAdmin()`.

**Step 2: Créer le fichier**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb, seedSuperadminCategories } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/tenant';
import { encrypt } from '@/lib/encrypt';

const SUPERADMIN_COMPANY_ID = 0;
const SUPPLIERS = ['lumen', 'canac', 'homedepot', 'guillevin'] as const;

export async function GET() {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const accounts = SUPPLIERS.map(supplier => {
    const acc = db.prepare(
      'SELECT id, supplier, username, active FROM supplier_accounts WHERE supplier = ? AND company_id = ? LIMIT 1'
    ).get(supplier, SUPERADMIN_COMPANY_ID) as { id: number; supplier: string; username: string; active: number } | undefined;
    return { supplier, username: acc?.username ?? null, configured: !!acc };
  });

  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const { supplier, username, password } = await req.json();
  if (!supplier || !username || !SUPPLIERS.includes(supplier)) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM supplier_accounts WHERE supplier = ? AND company_id = ? LIMIT 1'
  ).get(supplier, SUPERADMIN_COMPANY_ID) as { id: number } | undefined;

  if (existing) {
    if (password) {
      db.prepare('UPDATE supplier_accounts SET username = ?, password_encrypted = ?, active = 1 WHERE id = ?')
        .run(username, encrypt(password), existing.id);
    } else {
      db.prepare('UPDATE supplier_accounts SET username = ?, active = 1 WHERE id = ?')
        .run(username, existing.id);
    }
  } else {
    if (!password) {
      return NextResponse.json({ error: 'Mot de passe requis pour le premier enregistrement' }, { status: 400 });
    }
    db.prepare('INSERT INTO supplier_accounts (supplier, username, password_encrypted, company_id) VALUES (?, ?, ?, ?)')
      .run(supplier, username, encrypt(password), SUPERADMIN_COMPANY_ID);
    // Seeder les catégories super admin si pas encore fait
    seedSuperadminCategories(db);
  }

  return NextResponse.json({ ok: true });
}
```

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/api/superadmin/catalog/account/route.ts && git commit -m "feat: add /api/superadmin/catalog/account GET/POST"
```

---

### Task 3: API — import SSE pour un fournisseur

**Files:**
- Create: `app/app/api/superadmin/catalog/import/route.ts`

**Step 1: Regarder le pattern SSE existant**

Lire `app/app/api/supplier/import/route.ts` pour comprendre le pattern ReadableStream + SSE.

**Step 2: Créer le fichier**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/tenant';
import { importLumenCatalog, getCatalogStats } from '@/lib/lumen-catalog';
import { importCanacCatalog, getCanacCatalogStats } from '@/lib/canac-catalog';
import { importHomeDepotCatalog, getHomeDepotCatalogStats } from '@/lib/homedepot-catalog';
import { importGuillevinCatalog, getGuillevinCatalogStats } from '@/lib/guillevin-catalog';

const SUPERADMIN_COMPANY_ID = 0;

export async function GET(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';
  if (supplier === 'canac') return NextResponse.json(getCanacCatalogStats());
  if (supplier === 'homedepot') return NextResponse.json(getHomeDepotCatalogStats());
  if (supplier === 'guillevin') return NextResponse.json(getGuillevinCatalogStats());
  return NextResponse.json(getCatalogStats());
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let result: { total: number; error?: string };
        let stats: { count: number; lastSync: string | null };

        if (supplier === 'canac') {
          result = await importCanacCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getCanacCatalogStats();
        } else if (supplier === 'homedepot') {
          result = await importHomeDepotCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getHomeDepotCatalogStats();
        } else if (supplier === 'guillevin') {
          result = await importGuillevinCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getGuillevinCatalogStats();
        } else {
          result = await importLumenCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getCatalogStats();
        }

        send({ done: true, total: result.total, stats, error: result.error });
      } catch (err: any) {
        send({ done: true, total: 0, error: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/api/superadmin/catalog/import/route.ts && git commit -m "feat: add /api/superadmin/catalog/import GET/POST (SSE)"
```

---

### Task 4: API — import-all (SSE, 4 fournisseurs en séquence)

**Files:**
- Create: `app/app/api/superadmin/catalog/import-all/route.ts`

**Step 1: Créer le fichier**

```typescript
import { requireSuperAdmin } from '@/lib/tenant';
import { importLumenCatalog, getCatalogStats } from '@/lib/lumen-catalog';
import { importCanacCatalog, getCanacCatalogStats } from '@/lib/canac-catalog';
import { importHomeDepotCatalog, getHomeDepotCatalogStats } from '@/lib/homedepot-catalog';
import { importGuillevinCatalog, getGuillevinCatalogStats } from '@/lib/guillevin-catalog';

const SUPERADMIN_COMPANY_ID = 0;
const SUPPLIERS = ['lumen', 'canac', 'homedepot', 'guillevin'] as const;

export async function POST() {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let grandTotal = 0;
      const errors: string[] = [];

      for (const supplier of SUPPLIERS) {
        send({ supplier, started: true });
        try {
          let result: { total: number; error?: string };
          let stats: { count: number; lastSync: string | null };

          if (supplier === 'canac') {
            result = await importCanacCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
            stats = getCanacCatalogStats();
          } else if (supplier === 'homedepot') {
            result = await importHomeDepotCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
            stats = getHomeDepotCatalogStats();
          } else if (supplier === 'guillevin') {
            result = await importGuillevinCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
            stats = getGuillevinCatalogStats();
          } else {
            result = await importLumenCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
            stats = getCatalogStats();
          }

          grandTotal += result.total;
          if (result.error) errors.push(`${supplier}: ${result.error}`);
          send({ supplier, supplierDone: true, total: result.total, stats });
        } catch (err: any) {
          errors.push(`${supplier}: ${err.message}`);
          send({ supplier, supplierDone: true, total: 0, error: err.message });
        }
      }

      send({ done: true, grandTotal, errors: errors.length > 0 ? errors : undefined });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

**Step 2: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 3: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/api/superadmin/catalog/import-all/route.ts && git commit -m "feat: add /api/superadmin/catalog/import-all POST (SSE, 4 suppliers)"
```

---

### Task 5: UI — section Catalogues fournisseurs dans superadmin/page.tsx

**Files:**
- Modify: `app/app/superadmin/page.tsx`

**Step 1: Lire le fichier en entier**

Lire `app/app/superadmin/page.tsx` pour comprendre la structure existante.

**Step 2: Ajouter les types et états**

Après les interfaces existantes (après `interface Company { ... }`), ajouter :

```typescript
interface CatalogAccount {
  supplier: string;
  username: string | null;
  configured: boolean;
}

interface CatalogStats {
  count: number;
  lastSync: string | null;
}
```

Après les états existants (après `const [linkSaved, setLinkSaved] = useState(false);`), ajouter :

```typescript
  const [catalogAccounts, setCatalogAccounts] = useState<CatalogAccount[]>([]);
  const [catalogStats, setCatalogStats] = useState<Record<string, CatalogStats>>({});
  const [importingSupplier, setImportingSupplier] = useState<string | null>(null);
  const [importAllRunning, setImportAllRunning] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [configOpen, setConfigOpen] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, { username: string; password: string }>>({});
  const [savingAccount, setSavingAccount] = useState<string | null>(null);
```

**Step 3: Ajouter la fonction loadCatalogData**

Après `loadCompanies`, ajouter :

```typescript
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
```

**Step 4: Appeler loadCatalogData dans le useEffect**

Trouver dans le `useEffect` la ligne :
```typescript
      loadCompanies();
```
Ajouter juste après :
```typescript
      loadCatalogData();
```

**Step 5: Ajouter saveCatalogAccount**

Après `loadCatalogData`, ajouter :

```typescript
  async function saveCatalogAccount(supplier: string) {
    const f = configForm[supplier] || { username: '', password: '' };
    if (!f.username) return;
    setSavingAccount(supplier);
    await fetch('/api/superadmin/catalog/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier, username: f.username, password: f.password || undefined }),
    });
    setSavingAccount(null);
    setConfigOpen(null);
    loadCatalogData();
  }
```

**Step 6: Ajouter startImport**

Après `saveCatalogAccount`, ajouter :

```typescript
  async function startImport(supplier: string) {
    setImportingSupplier(supplier);
    setImportProgress('');
    const res = await fetch(`/api/superadmin/catalog/import?supplier=${supplier}`, { method: 'POST' });
    const reader = res.body!.getReader();
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
          setImportProgress('');
          setImportingSupplier(null);
          loadCatalogData();
        }
      }
    }
  }
```

**Step 7: Ajouter startImportAll**

Après `startImport`, ajouter :

```typescript
  async function startImportAll() {
    setImportAllRunning(true);
    setImportProgress('');
    const res = await fetch('/api/superadmin/catalog/import-all', { method: 'POST' });
    const reader = res.body!.getReader();
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
  }
```

**Step 8: Ajouter la section UI dans le JSX**

Juste avant la fermeture `</div>` finale du composant (avant `</div>` qui ferme `<div className="max-w-2xl mx-auto">`), ajouter :

```tsx
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
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setConfigOpen(null)}
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
```

**Step 9: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -30
```
Attendu: aucune erreur

**Step 10: Tester manuellement**

- Ouvrir http://localhost:3000/superadmin
- La section "Catalogues fournisseurs" doit apparaître en bas
- 4 cartes avec "Non configuré" si aucun compte n'est sauvegardé
- Cliquer "Configurer" sur Lumen → form username/password s'ouvre
- Sauvegarder → carte affiche le username
- Bouton "Importer" devient actif
- Cliquer "Importer" → progress bar apparaît avec le nom de la catégorie en cours

**Step 11: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/superadmin/page.tsx && git commit -m "feat: add catalog import section to superadmin dashboard"
```
