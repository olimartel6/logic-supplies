# Favoris de produits — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre aux électriciens de mettre des produits en favoris et d'y accéder via un onglet dédié dans `/new-request` sans avoir à chercher.

**Architecture:** 3 couches — (1) nouvelle table SQLite `product_favorites`, (2) API REST `/api/favorites` (GET/POST/DELETE), (3) UI dans `new-request/page.tsx` avec onglets Favoris/Rechercher, étoile sur chaque carte produit, et grille de favoris.

**Tech Stack:** Next.js API Routes, better-sqlite3, React useState/useCallback, Tailwind CSS, TypeScript

---

### Task 1: Migration DB — table product_favorites

**Files:**
- Modify: `app/lib/db.ts` (dans la fonction `initDb`, à la fin du bloc `db.exec(...)`)

**Step 1: Lire le fichier pour trouver la fin du bloc db.exec**

La fonction `initDb` fait un `db.exec(` avec un long string SQL. Il faut ajouter la nouvelle table AVANT la fermeture du template literal (le `);` final). Le bloc se termine après les tables inventory.

**Step 2: Ajouter la table et son index**

Trouver la dernière table dans le bloc db.exec (autour de la table `inventory_logs`). Juste avant la fermeture du template literal, ajouter :

```sql
    CREATE TABLE IF NOT EXISTS product_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      supplier TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT,
      price REAL,
      unit TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, supplier, sku)
    );

    CREATE INDEX IF NOT EXISTS idx_product_favorites_user ON product_favorites(user_id);
```

**Step 3: Vérifier que TypeScript compile**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/db.ts && git commit -m "feat: add product_favorites table"
```

---

### Task 2: API Route — /api/favorites

**Files:**
- Create: `app/app/api/favorites/route.ts`

**Step 1: Créer le fichier**

Regarder un exemple d'API existant pour le pattern (ex: `app/app/api/requests/route.ts`). Il utilise `getTenantContext()` et `getDb()`.

Créer `app/app/api/favorites/route.ts` avec ce contenu exact :

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const favorites = db.prepare(
    'SELECT * FROM product_favorites WHERE user_id = ? ORDER BY created_at DESC'
  ).all(ctx.userId);

  return NextResponse.json(favorites);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const body = await req.json();
  const { supplier, sku, name, image_url, price, unit, category } = body;

  if (!supplier || !sku || !name) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO product_favorites
      (user_id, supplier, sku, name, image_url, price, unit, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ctx.userId, supplier, sku, name, image_url ?? null, price ?? null, unit ?? null, category ?? null);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const { supplier, sku } = await req.json();
  const db = getDb();
  db.prepare(
    'DELETE FROM product_favorites WHERE user_id = ? AND supplier = ? AND sku = ?'
  ).run(ctx.userId, supplier, sku);

  return NextResponse.json({ ok: true });
}
```

**Step 2: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 3: Tester l'API manuellement**

Le dev server tourne sur localhost:3000. Se connecter d'abord comme électricien, puis tester :
```bash
curl -s http://localhost:3000/api/favorites -b <session-cookie>
```
Attendu: `[]` (tableau vide)

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/api/favorites/route.ts && git commit -m "feat: add /api/favorites GET/POST/DELETE"
```

---

### Task 3: État React + fonctions dans new-request/page.tsx

**Files:**
- Modify: `app/app/new-request/page.tsx`

**Step 1: Ajouter les states**

Après les states existants (autour de la ligne 65, après `filterRef`), ajouter :

```typescript
  const [activeTab, setActiveTab] = useState<'favoris' | 'recherche'>('favoris');
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [favoriteSKUs, setFavoriteSKUs] = useState<Set<string>>(new Set());
```

**Step 2: Ajouter la fonction loadFavorites**

Après les states, avant `doSearch`, ajouter :

```typescript
  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch('/api/favorites');
      if (!res.ok) return;
      const data: Product[] = await res.json();
      setFavorites(data);
      setFavoriteSKUs(new Set(data.map(p => `${p.supplier}:${p.sku}`)));
    } catch {
      setFavorites([]);
    }
  }, []);
```

**Step 3: Appeler loadFavorites au chargement**

Trouver le premier `useEffect` (celui qui fetch `/api/auth/me`, `/api/job-sites`, `/api/supplier/preference`). À la fin du `.then` chain ou à la fin du useEffect body, ajouter :

```typescript
    loadFavorites();
```

Le useEffect a `[router]` comme dépendance — ajouter `loadFavorites` :
```typescript
  }, [router, loadFavorites]);
```

**Step 4: Ajouter la fonction toggleFavorite**

Après `loadFavorites`, ajouter :

```typescript
  async function toggleFavorite(p: Product) {
    const key = `${p.supplier}:${p.sku}`;
    const isFav = favoriteSKUs.has(key);
    await fetch('/api/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier: p.supplier, sku: p.sku, name: p.name, image_url: p.image_url, price: p.price, unit: p.unit, category: p.category }),
    });
    loadFavorites();
  }
```

**Step 5: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 6: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/new-request/page.tsx && git commit -m "feat: add favorites state, loadFavorites, toggleFavorite"
```

---

### Task 4: UI — Onglets + étoile sur cartes + grille de favoris

**Files:**
- Modify: `app/app/new-request/page.tsx`

**Step 1: Ajouter les onglets dans la sticky bar**

Trouver le bloc sticky bar (autour de la ligne 235) :
```tsx
          {query.length >= 2 && !pendingProduct && (
            <p className="text-center text-xs text-slate-400">
```

Juste AVANT ce bloc `{query.length >= 2 ...}`, ajouter les onglets :

```tsx
          {/* Onglets Favoris / Rechercher */}
          <div className="flex gap-1 bg-slate-700 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setActiveTab('favoris')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'favoris'
                  ? 'bg-yellow-400 text-slate-900'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ⭐ Favoris {favorites.length > 0 && `(${favorites.length})`}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recherche')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'recherche'
                  ? 'bg-yellow-400 text-slate-900'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              🔍 Rechercher
            </button>
          </div>
```

**Step 2: Conditionner la section résultats de recherche sur l'onglet actif**

Trouver (autour de la ligne 548) :
```tsx
        {/* ─── Résultats de recherche (masqués quand un produit est en cours de config) ─── */}
        {!pendingProduct && (
```

Changer en :
```tsx
        {/* ─── Résultats de recherche ─── */}
        {!pendingProduct && activeTab === 'recherche' && (
```

**Step 3: Ajouter l'étoile sur chaque carte produit dans les résultats**

Dans la grille de résultats, chaque carte est actuellement un `<button key={i} ...>`. Il faut l'envelopper dans un `<div className="relative">` et ajouter le bouton étoile comme sibling (PAS enfant du bouton carte).

Trouver :
```tsx
                <div className="grid grid-cols-2 gap-3">
                  {filteredResults.map((p, i) => {
                    const b = supplierBadge(p.supplier);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pickProduct(p)}
                        className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-yellow-300 active:scale-[0.98] transition-all flex flex-col"
                      >
```

Remplacer par :
```tsx
                <div className="grid grid-cols-2 gap-3">
                  {filteredResults.map((p, i) => {
                    const b = supplierBadge(p.supplier);
                    const isFav = favoriteSKUs.has(`${p.supplier}:${p.sku}`);
                    return (
                      <div key={i} className="relative">
                        <button
                          type="button"
                          onClick={() => pickProduct(p)}
                          className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-yellow-300 active:scale-[0.98] transition-all flex flex-col w-full"
                        >
```

Puis trouver la fermeture du `</button>` de la carte (juste avant le `);` du map). Ajouter le bouton étoile APRÈS le `</button>` de la carte mais AVANT la fermeture du nouveau `</div>` :

```tsx
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFavorite(p)}
                          className="absolute top-1.5 right-1.5 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 shadow-sm text-base leading-none hover:scale-110 transition-transform"
                          title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        >
                          {isFav ? '⭐' : '☆'}
                        </button>
                      </div>
```

**Step 4: Ajouter la grille de favoris**

Juste AVANT la section résultats de recherche (avant `{!pendingProduct && activeTab === 'recherche' && (`), ajouter :

```tsx
        {/* ─── Onglet Favoris ─── */}
        {!pendingProduct && activeTab === 'favoris' && (
          <>
            {favorites.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-3xl mb-3">⭐</p>
                <p className="font-medium text-gray-600">Aucun favori</p>
                <p className="text-sm mt-1">Allez dans Rechercher et appuyez sur ☆ pour ajouter un produit</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {favorites.map((p, i) => {
                  const b = supplierBadge(p.supplier);
                  return (
                    <div key={i} className="relative">
                      <button
                        type="button"
                        onClick={() => pickProduct(p)}
                        className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-yellow-300 active:scale-[0.98] transition-all flex flex-col w-full"
                      >
                        <div className="w-full bg-gray-50 flex items-center justify-center p-3" style={{ aspectRatio: '1' }}>
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-full h-full object-contain" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-10 h-10 text-gray-300">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                          )}
                        </div>
                        <div className="p-2.5 flex flex-col gap-1 flex-1">
                          <p className="text-xs font-medium text-gray-900 leading-snug line-clamp-2">{p.name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium self-start ${b.cls}`}>{b.label}</span>
                          {p.price != null ? (
                            <p className="text-sm font-bold text-gray-900 mt-auto">
                              {p.price.toFixed(2)} $
                              {p.unit !== 'units' && <span className="text-xs font-normal text-gray-400 ml-1">/{p.unit}</span>}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 italic mt-auto">Prix sur demande</p>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(p)}
                        className="absolute top-1.5 right-1.5 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 shadow-sm text-base leading-none hover:scale-110 transition-transform"
                        title="Retirer des favoris"
                      >
                        ⭐
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
```

**Step 5: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -30
```
Attendu: aucune erreur

**Step 6: Tester manuellement**

- Ouvrir http://localhost:3000/new-request
- L'onglet "⭐ Favoris" doit être actif par défaut avec le message "Aucun favori"
- Basculer sur "🔍 Rechercher", chercher "fil"
- Les cartes produits doivent avoir une ☆ en haut à droite
- Cliquer ☆ → devient ⭐, le compteur dans l'onglet Favoris augmente
- Basculer sur "⭐ Favoris" → le produit apparaît
- Cliquer ⭐ sur le favori → il disparaît

**Step 7: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/new-request/page.tsx && git commit -m "feat: add favorites tab, star button on product cards, favorites grid"
```
