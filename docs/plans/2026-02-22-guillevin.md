# Guillevin — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter Guillevin comme 4e fournisseur complet (catalogue + commande automatique) avec un thème noir dans les paramètres.

**Architecture:** Guillevin utilise Shopify. Le catalogue est importé via l'API JSON Shopify (`/collections/{handle}/products.json?limit=250&page=N`) après login Playwright. Le login suit une redirection vers `shopify.com/60111716441/account` (nouveau système Shopify Customer Accounts). L'ajout au panier se fait via le bouton "Add to cart" de la page produit Playwright. Même pattern que Canac partout ailleurs.

**Tech Stack:** Next.js 14, Playwright (déjà installé), better-sqlite3, TypeScript.

---

## Contexte codebase

- `app/lib/canac.ts` — modèle exact à suivre pour `guillevin.ts` (branches, login, test, price, order)
- `app/lib/canac-catalog.ts` — modèle pour `guillevin-catalog.ts`
- `app/lib/supplier-router.ts` — `SupplierKey`, `branchMap`, `placeOrder`, `selectCheapest`, `selectFastest`
- `app/lib/db.ts` — `initDb()` pour seeding des catégories
- `app/app/api/products/route.ts` — importe `LUMEN_BRANCHES`, `CANAC_BRANCHES`, `HOME_DEPOT_BRANCHES` pour le mode "plus proche"
- `app/app/settings/page.tsx` — composant `SupplierSection` réutilisable, thèmes `themes.blue` / `themes.orange`

## Thème Guillevin (noir)

```typescript
const themes = {
  // ... existants ...
  black: {
    bg: 'bg-gray-900',
    border: 'border-gray-700',
    heading: 'text-white',
    subtext: 'text-gray-300',
    checkboxAccent: 'accent-gray-300',
  },
};
```

Les boutons "Sauvegarder" / "Importer" auront la classe `bg-gray-700 hover:bg-gray-600 text-white`.

## Guillevin Shopify — notes techniques

- **Login URL :** `https://www.guillevin.com/account/login` → redirige vers `https://shopify.com/60111716441/account`
- **Formulaire Shopify Customer Accounts :** champ email (étape 1), puis mot de passe (étape 2) avec bouton "Continue"
- **Catalogue JSON :** `GET /collections/{handle}/products.json?limit=250&page=N` (requiert login pour les prix)
- **Structure JSON produit Shopify standard :**
  ```json
  {
    "products": [{
      "id": 123456,
      "title": "Fil THHN 12 AWG",
      "variants": [{ "sku": "THH-12-BLK", "price": "1.25" }],
      "images": [{ "src": "https://cdn.shopify.com/..." }]
    }]
  }
  ```
- **Panier :** naviguer vers page produit → cliquer bouton "Add to cart" → retourner `{ inCart: true }`
- **Cart URL :** `https://www.guillevin.com/cart`

---

## Task 1 : `app/lib/guillevin.ts` — Branches + Login + Test + Price + Order

**Fichiers :**
- Créer : `app/lib/guillevin.ts`

**Contenu complet à créer :**

```typescript
import { chromium } from 'playwright';
import type { LumenOrderResult, ConnectionResult } from './lumen';
import type { Branch } from './canac';

export const GUILLEVIN_BRANCHES: Branch[] = [
  { name: 'Guillevin Montréal (St-Laurent)', lat: 45.5017, lng: -73.6800 },
  { name: 'Guillevin Laval',                 lat: 45.5756, lng: -73.7019 },
  { name: 'Guillevin Longueuil',             lat: 45.5292, lng: -73.5100 },
  { name: 'Guillevin Québec',                lat: 46.8100, lng: -71.2500 },
  { name: 'Guillevin Sherbrooke',            lat: 45.3799, lng: -71.9000 },
  { name: 'Guillevin Gatineau',              lat: 45.4765, lng: -75.7013 },
  { name: 'Guillevin Trois-Rivières',        lat: 46.3432, lng: -72.5477 },
  { name: 'Guillevin Drummondville',         lat: 45.8747, lng: -72.4763 },
  { name: 'Guillevin Saint-Hyacinthe',       lat: 45.6285, lng: -72.9572 },
  { name: 'Guillevin Saguenay',              lat: 48.4275, lng: -71.0543 },
];

async function createGuillevinPage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    (window as any).chrome = { runtime: {} };
  });
  return context.newPage();
}

// Guillevin uses Shopify Customer Accounts (redirects to shopify.com/60111716441/account).
// Flow: enter email → Continue → enter password → Submit → redirect back to guillevin.com
async function loginToGuillevin(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.guillevin.com/account/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2000);

  // Shopify Customer Accounts — step 1: email field
  const emailField = page.locator('input[type="email"], input[name="email"], input[id*="email"]').first();
  await emailField.waitFor({ timeout: 10000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  // Click "Continue" to proceed to password step
  const continueBtn = page.locator(
    'button[type="submit"], button:has-text("Continue"), button:has-text("Continuer")'
  ).first();
  await continueBtn.waitFor({ timeout: 5000 });
  await continueBtn.click();
  await page.waitForTimeout(1500);

  // Step 2: password field (may appear on same page or after transition)
  const passwordField = page.locator('input[type="password"]').first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  // Wait until we land back on guillevin.com (leaving shopify.com)
  await page.waitForFunction(
    () => window.location.hostname.includes('guillevin.com'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return url.includes('guillevin.com') && !url.includes('login');
}

export async function testGuillevinConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await createGuillevinPage(browser);
    const loggedIn = await loginToGuillevin(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Guillevin invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getGuillevinPrice(
  username: string,
  password: string,
  product: string
): Promise<number | null> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await createGuillevinPage(browser);
    const loggedIn = await loginToGuillevin(page, username, password);
    if (!loggedIn) return null;

    // Use Shopify search
    await page.goto(
      `https://www.guillevin.com/search?type=product&q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    // Look for first price element on results page
    const priceEl = page.locator('[class*="price"]:not([class*="compare"])').first();
    if (await priceEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await priceEl.textContent().catch(() => '');
      const match = text?.match(/[\d]+[.,][\d]{2}/);
      if (match) return parseFloat(match[0].replace(',', '.'));
    }
    return null;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

export async function placeGuillevinOrder(
  username: string,
  password: string,
  product: string,
  quantity: number
): Promise<LumenOrderResult> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await createGuillevinPage(browser);
    const loggedIn = await loginToGuillevin(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Guillevin échoué' };

    // Search for product
    await page.goto(
      `https://www.guillevin.com/search?type=product&q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    // Click first product result
    const firstProduct = page.locator(
      'a[href*="/products/"], .product-card a, .card__heading a, h3 a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      // Set quantity if input is present
      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[class*="quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      // Add to cart
      const addToCartBtn = page.locator(
        'button[name="add"], button:has-text("Add to cart"), button:has-text("Ajouter au panier"), [data-add-to-cart]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Guillevin` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 2 : `app/lib/guillevin-catalog.ts` — Import catalogue via Shopify JSON API

**Fichiers :**
- Créer : `app/lib/guillevin-catalog.ts`

**Notes :**
Guillevin utilise Shopify. Son API JSON est à `/collections/{handle}/products.json?limit=250&page=N`.
- `page=N` est **1-indexé** (contrairement à Canac qui utilisait 0)
- `limit=250` est le maximum Shopify
- La réponse est `{ products: [{ id, title, variants: [{ sku, price }], images: [{ src }] }] }`
- Requiert une session login pour obtenir les prix

**Contenu complet à créer :**

```typescript
import { chromium } from 'playwright';
import { getDb } from './db';
import { decrypt } from './encrypt';

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

// Shopify JSON API — max 250 per page, 1-indexed pages
const GUILLEVIN_PAGE_SIZE = 250;

export async function importGuillevinCatalog(
  onProgress?: (p: ImportProgress) => void
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'guillevin' AND active = 1 LIMIT 1"
  ).get() as any;
  if (!account) return { total: 0, error: 'Aucun compte Guillevin configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'guillevin' AND enabled = 1"
  ).all() as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const password = decrypt(account.password_encrypted);

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('guillevin', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name,
      image_url = excluded.image_url,
      price = excluded.price,
      unit = excluded.unit,
      category = excluded.category,
      last_synced = CURRENT_TIMESTAMP
  `);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  let totalImported = 0;

  try {
    // Login to get authenticated session cookies
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'fr-CA',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();

    // Login
    await page.goto('https://www.guillevin.com/account/login', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const emailField = page.locator('input[type="email"], input[name="email"]').first();
    await emailField.waitFor({ timeout: 10000 });
    await emailField.type(account.username, { delay: 60 });
    await page.waitForTimeout(300);

    const continueBtn = page.locator('button[type="submit"]').first();
    await continueBtn.click();
    await page.waitForTimeout(1500);

    const passwordField = page.locator('input[type="password"]').first();
    await passwordField.waitFor({ timeout: 10000 });
    await passwordField.type(password, { delay: 60 });

    await page.locator('button[type="submit"]').first().click();
    await page.waitForFunction(
      () => window.location.hostname.includes('guillevin.com'),
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(1500);

    const loggedIn = page.url().includes('guillevin.com') && !page.url().includes('login');
    if (!loggedIn) return { total: 0, error: 'Login Guillevin échoué' };

    // Import each enabled category via Shopify JSON API
    for (const cat of categories) {
      let currentPage = 1; // Shopify pages are 1-indexed
      let categoryTotal = 0;
      let lastPageFingerprint = '';

      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://www.guillevin.com${cat.category_url}/products.json?limit=${GUILLEVIN_PAGE_SIZE}&page=${currentPage}`;

        let products: any[] = [];
        let fatalError = false;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await page.goto(url, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
            const body = await response?.text() || '{}';
            const json = JSON.parse(body);
            const shopifyProducts: any[] = json.products || [];

            for (const p of shopifyProducts) {
              const variant = p.variants?.[0];
              const sku = variant?.sku || String(p.id);
              const price = variant?.price ? parseFloat(variant.price) : null;
              const image_url = p.images?.[0]?.src || '';
              const name = p.title || '';
              if (name.length >= 3) {
                products.push({ sku, name, image_url, price, unit: 'units' });
              }
            }
            break;
          } catch {
            if (attempt === 0) {
              await page.waitForTimeout(2000);
            } else {
              fatalError = true;
            }
          }
        }

        if (fatalError) break;
        if (products.length === 0) break;

        // Detect if Shopify is returning same page (shouldn't happen but safety check)
        const fingerprint = products.slice(0, 3).map(p => p.sku).join('|');
        if (fingerprint === lastPageFingerprint) break;
        lastPageFingerprint = fingerprint;

        const insertMany = db.transaction((prods: any[]) => {
          for (const p of prods) {
            try {
              upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name);
            } catch { /* skip duplicates */ }
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({
          category: cat.category_name,
          imported: categoryTotal,
          total: categoryTotal,
          done: false,
        });

        // Shopify returns fewer than limit when last page
        if (products.length < GUILLEVIN_PAGE_SIZE) break;

        currentPage++;
        if (currentPage > 50) break; // safety cap
      }

      onProgress?.({
        category: cat.category_name,
        imported: categoryTotal,
        total: categoryTotal,
        done: true,
      });
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  } finally {
    await browser.close();
  }
}

export function getGuillevinCatalogStats() {
  const db = getDb();
  const count = (
    db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'guillevin'").get() as any
  ).count;
  const lastSync = (
    db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'guillevin'").get() as any
  ).last;
  return { count, lastSync };
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 3 : `app/lib/db.ts` — Seed catégories Guillevin

**Fichiers :**
- Modifier : `app/lib/db.ts`

**Dans `initDb()`, après le bloc de seed Home Depot (autour de la ligne 204), ajouter :**

```typescript
// Seed Guillevin categories (Shopify collection handles)
const guillevinCategories = [
  { name: 'Fils et câbles',           url: '/collections/wire-cable',             enabled: 1 },
  { name: 'Disjoncteurs et panneaux', url: '/collections/breakers-load-centres',  enabled: 1 },
  { name: 'Boîtes et conduits',       url: '/collections/conduit-fittings-boxes', enabled: 0 },
  { name: 'Luminaires',               url: '/collections/lighting',               enabled: 0 },
  { name: 'Outils',                   url: '/collections/tools',                  enabled: 0 },
];
const guillevinCatCount = (
  db.prepare("SELECT COUNT(*) as count FROM supplier_categories WHERE supplier = 'guillevin'").get() as { count: number }
).count;
if (guillevinCatCount === 0) {
  for (const c of guillevinCategories) {
    db.prepare(
      "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled) VALUES ('guillevin', ?, ?, ?)"
    ).run(c.name, c.url, c.enabled);
  }
}
```

**Important :** Les handles de collections (`wire-cable`, `breakers-load-centres`, etc.) sont des valeurs par défaut à valider sur guillevin.com. L'admin peut les ajuster dans les paramètres une fois que les vraies URLs sont connues. La section catégories dans les paramètres permet de voir et modifier les URLs.

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 4 : `app/lib/supplier-router.ts` — Ajouter Guillevin

**Fichiers :**
- Modifier : `app/lib/supplier-router.ts`

**Modifications à apporter :**

**1.** Ajouter l'import en haut du fichier :
```typescript
import { GUILLEVIN_BRANCHES, placeGuillevinOrder, getGuillevinPrice } from './guillevin';
```

**2.** Changer le type `SupplierKey` :
```typescript
// Avant :
type SupplierKey = 'lumen' | 'canac' | 'homedepot';
// Après :
type SupplierKey = 'lumen' | 'canac' | 'homedepot' | 'guillevin';
```

**3.** Mettre à jour `supplierLabel` :
```typescript
function supplierLabel(s: SupplierKey): string {
  return s === 'lumen' ? 'Lumen'
    : s === 'canac' ? 'Canac'
    : s === 'homedepot' ? 'Home Depot'
    : 'Guillevin';
}
```

**4.** Mettre à jour `placeOrder` :
```typescript
async function placeOrder(account: SupplierAccount, product: string, quantity: number): Promise<LumenOrderResult> {
  switch (account.supplier) {
    case 'lumen':     return placeLumenOrder(account.username, account.password, product, quantity);
    case 'canac':     return placeCanacOrder(account.username, account.password, product, quantity);
    case 'homedepot': return placeHomeDepotOrder(account.username, account.password, product, quantity);
    case 'guillevin': return placeGuillevinOrder(account.username, account.password, product, quantity);
  }
}
```

**5.** Mettre à jour `selectCheapest` (dans le bloc `priceChecks`) :
```typescript
// Après le else pour homedepot, ajouter :
else if (acc.supplier === 'guillevin') price = await getGuillevinPrice(acc.username, acc.password, product);
```

**6.** Mettre à jour `branchMap` dans `selectFastest` :
```typescript
const branchMap: Record<SupplierKey, Branch[]> = {
  lumen:     LUMEN_BRANCHES,
  canac:     CANAC_BRANCHES,
  homedepot: HOME_DEPOT_BRANCHES,
  guillevin: GUILLEVIN_BRANCHES,
};
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 5 : `app/app/api/products/route.ts` — Ajouter branches Guillevin

**Fichiers :**
- Modifier : `app/app/api/products/route.ts`

**1.** Ajouter l'import :
```typescript
import { GUILLEVIN_BRANCHES } from '@/lib/guillevin';
```

**2.** Dans `GET`, dans le bloc `if (preference === 'fastest')`, ajouter Guillevin au tableau `distances` :
```typescript
const distances = [
  { supplier: 'lumen',     dist: nearestDist(LUMEN_BRANCHES,     coords.lat, coords.lng) },
  { supplier: 'canac',     dist: nearestDist(CANAC_BRANCHES,     coords.lat, coords.lng) },
  { supplier: 'homedepot', dist: nearestDist(HOME_DEPOT_BRANCHES, coords.lat, coords.lng) },
  { supplier: 'guillevin', dist: nearestDist(GUILLEVIN_BRANCHES, coords.lat, coords.lng) },
];
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 6 : `app/app/api/supplier/import/route.ts` — Ajouter Guillevin

**Fichiers :**
- Modifier : `app/app/api/supplier/import/route.ts`

**1.** Ajouter l'import :
```typescript
import { importGuillevinCatalog, getGuillevinCatalogStats } from '@/lib/guillevin-catalog';
```

**2.** Dans `POST`, ajouter le cas Guillevin dans le bloc if/else :
```typescript
if (supplier === 'canac') {
  result = await importCanacCatalog((progress) => send(progress));
  stats = getCanacCatalogStats();
} else if (supplier === 'homedepot') {
  result = await importHomeDepotCatalog((progress) => send(progress));
  stats = getHomeDepotCatalogStats();
} else if (supplier === 'guillevin') {
  result = await importGuillevinCatalog((progress) => send(progress));
  stats = getGuillevinCatalogStats();
} else {
  result = await importLumenCatalog((progress) => send(progress));
  stats = getCatalogStats();
}
```

**3.** Dans `GET`, ajouter :
```typescript
if (supplier === 'guillevin') return NextResponse.json(getGuillevinCatalogStats());
```
(avant le `return NextResponse.json(getCatalogStats())` existant)

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 7 : `app/app/api/supplier/test/route.ts` — Ajouter test Guillevin

**Fichiers :**
- Modifier : `app/app/api/supplier/test/route.ts`

Lire le fichier d'abord pour voir le pattern exact. En général, il ressemble à :
```typescript
if (supplier === 'canac') { result = await testCanacConnection(...); }
else if (supplier === 'homedepot') { result = await testHomeDepotConnection(...); }
```

Ajouter :
```typescript
import { testGuillevinConnection } from '@/lib/guillevin';
// ...
else if (supplier === 'guillevin') {
  result = await testGuillevinConnection(account.username, password);
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 8 : `app/app/settings/page.tsx` — Section Guillevin (thème noir)

**Fichiers :**
- Modifier : `app/app/settings/page.tsx`

**1.** Ajouter le thème `black` dans l'objet `themes` :
```typescript
const themes: Record<string, SectionTheme> = {
  red: { ... },  // existant
  blue: { ... }, // existant
  orange: { ... }, // existant
  black: {
    bg: 'bg-gray-900',
    border: 'border-gray-700',
    heading: 'text-white',
    subtext: 'text-gray-300',
    checkboxAccent: 'accent-gray-300',
  },
};
```

**2.** Dans le composant `SupplierSection`, les boutons "Sauvegarder" et "Importer" utilisent `bg-blue-600`. Pour le thème noir, on a besoin d'override le style. Ajouter une prop `buttonClass` au composant avec une valeur par défaut :
```typescript
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
```

Remplacer dans le JSX toutes les occurrences de `bg-blue-600 ... hover:bg-blue-700` des boutons "Sauvegarder" et "Importer maintenant" par `${buttonClass}`.

**3.** À la fin de la page (après la section Home Depot), ajouter :
```tsx
{/* ─── GUILLEVIN (noir) ─── */}
<div className="mb-1 mt-2">
  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Guillevin</p>
</div>
<SupplierSection
  supplierKey="guillevin"
  label="Guillevin"
  theme={themes.black}
  buttonClass="bg-gray-700 hover:bg-gray-600"
/>
```

**4.** Mettre à jour le type `supplierKey` dans `SupplierSection` pour accepter `'guillevin'` :
```typescript
supplierKey: 'canac' | 'homedepot' | 'guillevin';
```

**5.** Dans `approvals/page.tsx`, mettre à jour partout où le supplier est affiché :
```typescript
const supLabel = sup === 'canac' ? 'Canac'
  : sup === 'homedepot' ? 'Home Depot'
  : sup === 'guillevin' ? 'Guillevin'
  : 'Lumen';
const cartUrl = sup === 'canac' ? 'https://www.canac.ca/panier'
  : sup === 'homedepot' ? 'https://www.homedepot.ca/checkout/cart'
  : sup === 'guillevin' ? 'https://www.guillevin.com/cart'
  : 'https://www.lumen.ca/en/cart';
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur. Redémarrer le serveur de dev et vérifier que la section Guillevin apparaît dans les paramètres avec un fond noir.

---

## Vérification end-to-end

1. `npx tsc --noEmit --skipLibCheck` → aucune erreur
2. Démarrer l'app : `npm run dev`
3. Aller dans Paramètres → voir section **Guillevin** en noir en bas de page
4. Saisir identifiants Guillevin → **Tester la connexion** → ✅ Connecté
5. **Sauvegarder catégories** → **Importer maintenant** → voir progression → produits importés
6. Aller dans **Nouvelle demande** → chercher "fil 12" → voir des résultats Guillevin
7. Approuver une demande avec un produit Guillevin → commande automatique placée
8. Dans la page Approbations → voir "🛒 Dans le panier" avec lien vers guillevin.com/cart

> **Note sur les collection handles :** Les URLs `/collections/wire-cable` etc. sont des valeurs initiales. Si elles retournent 0 produits, l'admin doit aller sur guillevin.com, naviguer dans les catégories, copier l'URL de la collection (ex: `/collections/fils-et-cables-acwu90`) et la coller dans le champ "URL" de la catégorie dans les paramètres Guillevin.
