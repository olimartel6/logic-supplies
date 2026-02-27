# 7 New Suppliers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 7 new suppliers (JSV, Westburne, Nedco, Futech, Deschênes, BMR, Rona) following the exact same pattern as the existing 4 suppliers.

**Architecture:** Each supplier gets `lib/<supplier>.ts` (BRANCHES array + testConnection + getPrice + placeOrder) and `lib/<supplier>-catalog.ts` (importCatalog + getCatalogStats). The supplier-router.ts SupplierKey union, db.ts category seeds, two API routes, and the superadmin UI card grid all need updating.

**Tech Stack:** TypeScript, Playwright via BrowserBase (`createBrowserbaseBrowser`), better-sqlite3, Next.js App Router SSE streams.

**Reference files to read before starting any task:**
- `lib/guillevin.ts` — Shopify login pattern (reuse for JSV)
- `lib/guillevin-catalog.ts` — Shopify products.json catalog pattern (reuse for JSV)
- `lib/canac.ts` — stealth page context helper pattern
- `lib/supplier-router.ts` — SupplierKey type and branchMap to extend
- `lib/db.ts` — seedCompanyDefaults + seedSuperadminCategories functions to extend
- `app/api/superadmin/catalog/import/route.ts` — add new supplier cases
- `app/api/superadmin/catalog/import-all/route.ts` — add new supplier cases
- `app/api/superadmin/catalog/account/route.ts` — SUPPLIERS array
- `app/superadmin/page.tsx` — supplier card grid

---

## Task 1: Infrastructure — db.ts category seeds + supplier-router.ts

**Files:**
- Modify: `lib/db.ts` (seedCompanyDefaults ~line 29, seedSuperadminCategories ~line 97)
- Modify: `lib/supplier-router.ts` (SupplierKey ~line 10, branchMap ~line 132, placeOrder ~line 64, selectCheapest ~line 79, selectFastest ~line 111, supplierLabel ~line 60)

### Step 1: Extend SupplierKey union in supplier-router.ts

In `lib/supplier-router.ts`, change line 10:
```typescript
// BEFORE
type SupplierKey = 'lumen' | 'canac' | 'homedepot' | 'guillevin';

// AFTER
type SupplierKey = 'lumen' | 'canac' | 'homedepot' | 'guillevin' | 'jsv' | 'westburne' | 'nedco' | 'futech' | 'deschenes' | 'bmr' | 'rona';
```

### Step 2: Add imports to supplier-router.ts

Add at the top of `lib/supplier-router.ts` after the guillevin import:
```typescript
import { JSV_BRANCHES, placeJsvOrder, getJsvPrice } from './jsv';
import { WESTBURNE_BRANCHES, placeWestburneOrder, getWestburnePrice } from './westburne';
import { NEDCO_BRANCHES, placeNedcoOrder, getNedcoPrice } from './nedco';
import { FUTECH_BRANCHES, placeFutechOrder, getFutechPrice } from './futech';
import { DESCHENES_BRANCHES, placeDeschemesOrder, getDeschenesPrice } from './deschenes';
import { BMR_BRANCHES, placeBmrOrder, getBmrPrice } from './bmr';
import { RONA_BRANCHES, placeRonaOrder, getRonaPrice } from './rona';
```

### Step 3: Update supplierLabel in supplier-router.ts

Replace the `supplierLabel` function body:
```typescript
function supplierLabel(s: SupplierKey): string {
  const labels: Record<SupplierKey, string> = {
    lumen: 'Lumen', canac: 'Canac', homedepot: 'Home Depot', guillevin: 'Guillevin',
    jsv: 'JSV', westburne: 'Westburne', nedco: 'Nedco', futech: 'Futech',
    deschenes: 'Deschênes', bmr: 'BMR', rona: 'Rona',
  };
  return labels[s] ?? s;
}
```

### Step 4: Update placeOrder switch in supplier-router.ts

Replace the `placeOrder` function:
```typescript
async function placeOrder(account: SupplierAccount, product: string, quantity: number, deliveryAddress?: string, payment?: PaymentInfo): Promise<LumenOrderResult> {
  switch (account.supplier) {
    case 'lumen':     return placeLumenOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'canac':     return placeCanacOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'homedepot': return placeHomeDepotOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'guillevin': return placeGuillevinOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'jsv':       return placeJsvOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'westburne': return placeWestburneOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'nedco':     return placeNedcoOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'futech':    return placeFutechOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'deschenes': return placeDeschemesOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'bmr':       return placeBmrOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'rona':      return placeRonaOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
  }
}
```

### Step 5: Update selectCheapest price checks in supplier-router.ts

Replace the price-check block inside `selectCheapest`:
```typescript
if (acc.supplier === 'lumen')     price = await getLumenPrice(acc.username, acc.password, product);
else if (acc.supplier === 'canac')     price = await getCanacPrice(acc.username, acc.password, product);
else if (acc.supplier === 'homedepot') price = await getHomeDepotPrice(acc.username, acc.password, product);
else if (acc.supplier === 'guillevin') price = await getGuillevinPrice(acc.username, acc.password, product);
else if (acc.supplier === 'jsv')       price = await getJsvPrice(acc.username, acc.password, product);
else if (acc.supplier === 'westburne') price = await getWestburnePrice(acc.username, acc.password, product);
else if (acc.supplier === 'nedco')     price = await getNedcoPrice(acc.username, acc.password, product);
else if (acc.supplier === 'futech')    price = await getFutechPrice(acc.username, acc.password, product);
else if (acc.supplier === 'deschenes') price = await getDeschenesPrice(acc.username, acc.password, product);
else if (acc.supplier === 'bmr')       price = await getBmrPrice(acc.username, acc.password, product);
else if (acc.supplier === 'rona')      price = await getRonaPrice(acc.username, acc.password, product);
```

### Step 6: Update branchMap in supplier-router.ts

Replace the `branchMap` constant inside `selectFastest`:
```typescript
const branchMap: Record<SupplierKey, Branch[]> = {
  lumen: LUMEN_BRANCHES, canac: CANAC_BRANCHES, homedepot: HOME_DEPOT_BRANCHES,
  guillevin: GUILLEVIN_BRANCHES, jsv: JSV_BRANCHES, westburne: WESTBURNE_BRANCHES,
  nedco: NEDCO_BRANCHES, futech: FUTECH_BRANCHES, deschenes: DESCHENES_BRANCHES,
  bmr: BMR_BRANCHES, rona: RONA_BRANCHES,
};
```

### Step 7: Add category seeds to seedCompanyDefaults in db.ts

After the guillevin categories block (around line 93), add:
```typescript
    // Catégories JSV
    const jsvCategories = [
      { name: 'Outils électriques',  url: '/collections/power-tools',          enabled: 1 },
      { name: 'Matériel électrique', url: '/collections/electrical',            enabled: 1 },
      { name: 'Sécurité',            url: '/collections/safety',                enabled: 0 },
      { name: 'Fixation',            url: '/collections/fasteners',             enabled: 0 },
    ];
    for (const c of jsvCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('jsv', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Westburne
    const westburneCategories = [
      { name: 'Fils et câbles',           url: '/cwr/c/WIRE/products?pageSize=100',     enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/cwr/c/BREAKERS/products?pageSize=100', enabled: 1 },
      { name: 'Boîtes et conduits',       url: '/cwr/c/CONDUIT/products?pageSize=100',  enabled: 0 },
      { name: 'Éclairage',                url: '/cwr/c/LIGHTING/products?pageSize=100', enabled: 0 },
    ];
    for (const c of westburneCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('westburne', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Nedco
    const nedcoCategories = [
      { name: 'Fils et câbles',           url: '/cnd/c/WIRE/products?pageSize=100',     enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/cnd/c/BREAKERS/products?pageSize=100', enabled: 1 },
      { name: 'Boîtes et conduits',       url: '/cnd/c/CONDUIT/products?pageSize=100',  enabled: 0 },
      { name: 'Éclairage',                url: '/cnd/c/LIGHTING/products?pageSize=100', enabled: 0 },
    ];
    for (const c of nedcoCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('nedco', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Futech
    const futechCategories = [
      { name: 'Distribution électrique', url: '/fr/c/distribution-electrique',  enabled: 1 },
      { name: 'Automatisation',          url: '/fr/c/automatisation',            enabled: 1 },
      { name: 'Éclairage',               url: '/fr/c/eclairage',                 enabled: 0 },
      { name: 'Outils',                  url: '/fr/c/outils',                    enabled: 0 },
    ];
    for (const c of futechCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('futech', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Deschênes
    const deschemesCategories = [
      { name: 'Électricité',       url: '/s/electricite',        enabled: 1 },
      { name: 'Plomberie',         url: '/s/plomberie',          enabled: 0 },
      { name: 'CVC',               url: '/s/cvc',                enabled: 0 },
    ];
    for (const c of deschemesCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('deschenes', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories BMR
    const bmrCategories = [
      { name: 'Électricité',             url: '/fr/electricite',              enabled: 1 },
      { name: 'Fils et câbles',          url: '/fr/electricite/fils-cables',  enabled: 1 },
      { name: 'Disjoncteurs',            url: '/fr/electricite/disjoncteurs', enabled: 0 },
      { name: 'Éclairage',               url: '/fr/electricite/eclairage',    enabled: 0 },
    ];
    for (const c of bmrCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('bmr', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Rona
    const ronaCategories = [
      { name: 'Électricité',             url: '/fr/electricite',                            enabled: 1 },
      { name: 'Fils et câbles',          url: '/fr/electricite/fils-et-cables',             enabled: 1 },
      { name: 'Disjoncteurs',            url: '/fr/electricite/disjoncteurs-et-panneaux',   enabled: 0 },
      { name: 'Éclairage',               url: '/fr/eclairage',                              enabled: 0 },
    ];
    for (const c of ronaCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('rona', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }
```

### Step 8: Add same categories to seedSuperadminCategories in db.ts

In the `allCategories` array inside `seedSuperadminCategories`, append after the guillevin entries:
```typescript
      // JSV
      { supplier: 'jsv', name: 'Outils électriques',  url: '/collections/power-tools' },
      { supplier: 'jsv', name: 'Matériel électrique', url: '/collections/electrical' },
      { supplier: 'jsv', name: 'Sécurité',            url: '/collections/safety' },
      { supplier: 'jsv', name: 'Fixation',            url: '/collections/fasteners' },
      // Westburne
      { supplier: 'westburne', name: 'Fils et câbles',           url: '/cwr/c/WIRE/products?pageSize=100' },
      { supplier: 'westburne', name: 'Disjoncteurs et panneaux', url: '/cwr/c/BREAKERS/products?pageSize=100' },
      { supplier: 'westburne', name: 'Boîtes et conduits',       url: '/cwr/c/CONDUIT/products?pageSize=100' },
      { supplier: 'westburne', name: 'Éclairage',                url: '/cwr/c/LIGHTING/products?pageSize=100' },
      // Nedco
      { supplier: 'nedco', name: 'Fils et câbles',           url: '/cnd/c/WIRE/products?pageSize=100' },
      { supplier: 'nedco', name: 'Disjoncteurs et panneaux', url: '/cnd/c/BREAKERS/products?pageSize=100' },
      { supplier: 'nedco', name: 'Boîtes et conduits',       url: '/cnd/c/CONDUIT/products?pageSize=100' },
      { supplier: 'nedco', name: 'Éclairage',                url: '/cnd/c/LIGHTING/products?pageSize=100' },
      // Futech
      { supplier: 'futech', name: 'Distribution électrique', url: '/fr/c/distribution-electrique' },
      { supplier: 'futech', name: 'Automatisation',          url: '/fr/c/automatisation' },
      { supplier: 'futech', name: 'Éclairage',               url: '/fr/c/eclairage' },
      { supplier: 'futech', name: 'Outils',                  url: '/fr/c/outils' },
      // Deschênes
      { supplier: 'deschenes', name: 'Électricité', url: '/s/electricite' },
      { supplier: 'deschenes', name: 'Plomberie',   url: '/s/plomberie' },
      { supplier: 'deschenes', name: 'CVC',         url: '/s/cvc' },
      // BMR
      { supplier: 'bmr', name: 'Électricité',    url: '/fr/electricite' },
      { supplier: 'bmr', name: 'Fils et câbles', url: '/fr/electricite/fils-cables' },
      { supplier: 'bmr', name: 'Disjoncteurs',   url: '/fr/electricite/disjoncteurs' },
      { supplier: 'bmr', name: 'Éclairage',      url: '/fr/electricite/eclairage' },
      // Rona
      { supplier: 'rona', name: 'Électricité',    url: '/fr/electricite' },
      { supplier: 'rona', name: 'Fils et câbles', url: '/fr/electricite/fils-et-cables' },
      { supplier: 'rona', name: 'Disjoncteurs',   url: '/fr/electricite/disjoncteurs-et-panneaux' },
      { supplier: 'rona', name: 'Éclairage',      url: '/fr/eclairage' },
```

### Step 9: Commit

```bash
git add lib/supplier-router.ts lib/db.ts
git commit -m "feat: extend SupplierKey + db category seeds for 7 new suppliers"
```

---

## Task 2: Groupe JSV — lib/jsv.ts + lib/jsv-catalog.ts

**Platform:** Shopify (same as Guillevin). Catalog via public `/products.json` API — no login needed. Order placement via Shopify cart.

**Files:**
- Create: `lib/jsv.ts`
- Create: `lib/jsv-catalog.ts`

### Step 1: Create lib/jsv.ts

```typescript
import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const JSV_BRANCHES: Branch[] = [
  { name: 'JSV Montréal',     address: '8785 Boul. Taschereau, Brossard, QC',        lat: 45.4604, lng: -73.4616 },
  { name: 'JSV Laval',        address: '3000 Boul. Le Carrefour, Laval, QC',          lat: 45.5756, lng: -73.7019 },
  { name: 'JSV Québec',       address: '2525 Boul. Laurier, Québec, QC',              lat: 46.7784, lng: -71.3052 },
  { name: 'JSV Sherbrooke',   address: '4785 Boul. Bourque, Sherbrooke, QC',          lat: 45.4042, lng: -71.8929 },
];

async function createJsvPage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToJsv(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://groupejsv.com/account/login', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input#customer_email',
    'input[name="customer[email]"]',
    'input[type="email"]',
    'input#username',
    'input[name="username"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input#customer_password',
    'input[name="customer[password]"]',
    'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.includes('/login') && !url.includes('/account/login');
}

export async function testJsvConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createJsvPage(browser);
    const loggedIn = await loginToJsv(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants JSV invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getJsvPrice(username: string, password: string, product: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://groupejsv.com/search/suggest.json?q=${encodeURIComponent(product)}&resources[type]=product&resources[limit]=5`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.resources?.results?.products ?? [];
    if (items.length === 0) return null;
    const price = items[0]?.price;
    if (!price) return null;
    // Shopify prices are in cents as strings
    return typeof price === 'number' ? price / 100 : parseFloat(String(price).replace(',', '.')) / 100;
  } catch {
    return null;
  }
}

export async function placeJsvOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createJsvPage(browser);
    const loggedIn = await loginToJsv(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login JSV échoué' };

    await page.goto(
      `https://groupejsv.com/search?type=product&q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[JSV] Searching for: ${product}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a[href*="/products/"], .product-card a, .card__heading a, h3 a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[class*="quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
      }

      const addToCartBtn = page.locator(
        'button[name="add"], button:has-text("Add to cart"), button:has-text("Ajouter au panier"), [data-add-to-cart]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[JSV] Added to cart: ${product}`);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur JSV` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
```

### Step 2: Create lib/jsv-catalog.ts

```typescript
import { getDb } from './db';

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

const JSV_PAGE_SIZE = 250;

export async function importJsvCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  // JSV is Shopify — products.json is public, no login needed
  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'jsv' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie JSV sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('jsv', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  let totalImported = 0;

  try {
    for (const cat of categories) {
      let currentPage = 1;
      let categoryTotal = 0;
      let lastFingerprint = '';

      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://groupejsv.com${cat.category_url}/products.json?limit=${JSV_PAGE_SIZE}&page=${currentPage}`;
        let products: any[] = [];
        let fatalError = false;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            const json = await res.json();
            const shopifyProducts: any[] = json.products || [];

            const parsed: any[] = [];
            for (const p of shopifyProducts) {
              const variant = p.variants?.[0];
              const sku = variant?.sku || String(p.id);
              const price = variant?.price ? parseFloat(variant.price) : null;
              const image_url = p.images?.[0]?.src || '';
              const name = p.title || '';
              if (name.length >= 3) {
                parsed.push({ sku, name, image_url, price, unit: 'unité' });
              }
            }
            products = parsed;
            break;
          } catch {
            if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
            else fatalError = true;
          }
        }

        if (fatalError || products.length === 0) break;

        const fingerprint = products.slice(0, 3).map(p => p.sku).join('|');
        if (fingerprint === lastFingerprint) break;
        lastFingerprint = fingerprint;

        const insertMany = db.transaction((prods: any[]) => {
          for (const p of prods) {
            try { upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name); } catch {}
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (products.length < JSV_PAGE_SIZE) break;
        currentPage++;
        if (currentPage > 50) break;
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  }
}

export function getJsvCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'jsv'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'jsv'").get() as any).last;
  return { count, lastSync };
}
```

### Step 3: Commit

```bash
git add lib/jsv.ts lib/jsv-catalog.ts
git commit -m "feat: add JSV supplier (Shopify)"
```

---

## Task 3: Westburne Électricité — lib/westburne.ts + lib/westburne-catalog.ts

**Platform:** Hybris/SAP Commerce Cloud (Rexel). Login at `/cwr/login`.

**Files:**
- Create: `lib/westburne.ts`
- Create: `lib/westburne-catalog.ts`

### Step 1: Create lib/westburne.ts

```typescript
import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const WESTBURNE_BRANCHES: Branch[] = [
  { name: 'Westburne Montréal (St-Laurent)',  address: '990 Rue Décarie, Saint-Laurent, QC',          lat: 45.5017, lng: -73.6800 },
  { name: 'Westburne Laval',                  address: '2440 Boul. Industriel, Laval, QC',             lat: 45.5756, lng: -73.7019 },
  { name: 'Westburne Longueuil',              address: '850 Rue Jolibois, Longueuil, QC',              lat: 45.5313, lng: -73.5180 },
  { name: 'Westburne Québec',                 address: '2970 Boul. Laurier, Québec, QC',               lat: 46.7784, lng: -71.3052 },
  { name: 'Westburne Sherbrooke',             address: '3440 Boul. Industriel, Sherbrooke, QC',        lat: 45.4042, lng: -71.8929 },
  { name: 'Westburne Gatineau',               address: '205 Boul. Saint-René E, Gatineau, QC',         lat: 45.4765, lng: -75.7013 },
  { name: 'Westburne Trois-Rivières',         address: '4025 Rue des Forges, Trois-Rivières, QC',      lat: 46.3432, lng: -72.5477 },
];

async function createWestburnePage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToWestburne(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.westburne.ca/cwr/login', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input#j_username',
    'input[name="j_username"]',
    'input[name="username"]',
    'input[type="email"]',
    'input[id*="email"]',
    'input[id*="user"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input#j_password',
    'input[name="j_password"]',
    'input[name="password"]',
    'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.includes('/login') && url.includes('westburne.ca');
}

export async function testWestburneConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createWestburnePage(browser);
    const loggedIn = await loginToWestburne(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Westburne invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getWestburnePrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createWestburnePage(browser);
    const loggedIn = await loginToWestburne(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.westburne.ca/cwr/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"]):not([class*="was"])').first();
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

export async function placeWestburneOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createWestburnePage(browser);
    const loggedIn = await loginToWestburne(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Westburne échoué' };

    await page.goto(
      `https://www.westburne.ca/cwr/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[Westburne] Searching for: ${product}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a.product-item__name, .product-name a, h3 a[href*="/p/"], .product-list__item a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="qty"], input[id*="qty"], input[class*="qty"], input[name="quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
      }

      const addToCartBtn = page.locator(
        'button:has-text("Add to Cart"), button:has-text("Ajouter au panier"), button[class*="add-to-cart"], .js-add-to-cart'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[Westburne] Added to cart: ${product}`);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Westburne` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
```

### Step 2: Create lib/westburne-catalog.ts

```typescript
import { createBrowserbaseBrowser } from './browser';
import { getDb } from './db';
import { decrypt } from './encrypt';

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

export async function importWestburneCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'westburne' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte Westburne configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'westburne' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const password = decrypt(account.password_encrypted);

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('westburne', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  const browser = await createBrowserbaseBrowser();
  let totalImported = 0;

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'fr-CA',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();

    // Login
    await page.goto('https://www.westburne.ca/cwr/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const emailField = page.locator([
      'input#j_username', 'input[name="j_username"]', 'input[name="username"]', 'input[type="email"]',
    ].join(', ')).first();
    await emailField.waitFor({ timeout: 15000 });
    await emailField.fill(account.username);
    await page.waitForTimeout(300);

    const passwordField = page.locator([
      'input#j_password', 'input[name="j_password"]', 'input[type="password"]',
    ].join(', ')).first();
    await passwordField.waitFor({ timeout: 10000 });
    await passwordField.fill(password);
    await page.waitForTimeout(300);

    await passwordField.press('Enter');
    await page.waitForFunction(
      () => !window.location.pathname.includes('/login'), { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(1500);

    if (page.url().includes('/login')) return { total: 0, error: 'Login Westburne échoué' };

    for (const cat of categories) {
      let pageNum = 0;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://www.westburne.ca${cat.category_url}&currentPage=${pageNum}`;
        let products: any[] = [];

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          products = await page.evaluate(() => {
            const items: any[] = [];
            const cards = document.querySelectorAll(
              '.product-item, .product-card, [class*="product-list-item"], article[class*="product"]'
            );
            for (const card of Array.from(cards)) {
              const nameEl = card.querySelector('a.product-item__name, .product-name, h3 a, h2 a');
              const name = nameEl?.textContent?.trim() || '';
              if (name.length < 3) continue;

              const imgEl = card.querySelector('img') as HTMLImageElement | null;
              const image_url = imgEl?.src || '';

              const skuEl = card.querySelector('[class*="code"], [class*="sku"], [class*="item-code"]');
              const sku = skuEl?.textContent?.trim() || name.slice(0, 40);

              const priceEl = card.querySelector('[class*="price"]:not([class*="old"]):not([class*="was"])');
              const priceText = priceEl?.textContent?.trim() || '';
              const priceMatch = priceText.match(/[\d]+[.,][\d]{2}/);
              const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : null;

              items.push({ name, sku, image_url, price, unit: 'unité' });
            }
            return items;
          });
        } catch {
          break;
        }

        if (products.length === 0) break;

        const insertMany = db.transaction((prods: any[]) => {
          for (const p of prods) {
            try { upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name); } catch {}
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (products.length < 20) break;
        pageNum++;
        if (pageNum > 50) break;
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  } finally {
    await browser.close();
  }
}

export function getWestburneCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'westburne'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'westburne'").get() as any).last;
  return { count, lastSync };
}
```

### Step 3: Commit

```bash
git add lib/westburne.ts lib/westburne-catalog.ts
git commit -m "feat: add Westburne supplier (Hybris/SAP)"
```

---

## Task 4: Nedco — lib/nedco.ts + lib/nedco-catalog.ts

**Platform:** Same Hybris/SAP platform as Westburne (both Rexel). Only differences: domain (`nedco.ca`), URL prefix (`/cnd/`).

**Files:**
- Create: `lib/nedco.ts`
- Create: `lib/nedco-catalog.ts`

### Step 1: Create lib/nedco.ts

Copy `lib/westburne.ts` and make these changes:
- `WESTBURNE_BRANCHES` → `NEDCO_BRANCHES` with nedco addresses
- All function names: replace `Westburne`/`westburne` with `Nedco`/`nedco`
- Login URL: `https://www.westburne.ca/cwr/login` → `https://www.nedco.ca/cnd/login`
- Search URL: `https://www.westburne.ca/cwr/search` → `https://www.nedco.ca/cnd/search`
- Error strings: replace 'Westburne' with 'Nedco'
- `url.includes('westburne.ca')` → `url.includes('nedco.ca')`

Full content:
```typescript
import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const NEDCO_BRANCHES: Branch[] = [
  { name: 'Nedco Montréal (St-Laurent)', address: '1000 Rue Décarie, Saint-Laurent, QC',     lat: 45.5017, lng: -73.6800 },
  { name: 'Nedco Laval',                 address: '2500 Boul. Industriel, Laval, QC',         lat: 45.5756, lng: -73.7019 },
  { name: 'Nedco Longueuil',             address: '900 Rue Jolibois, Longueuil, QC',          lat: 45.5313, lng: -73.5180 },
  { name: 'Nedco Québec',                address: '3000 Boul. Laurier, Québec, QC',            lat: 46.7784, lng: -71.3052 },
  { name: 'Nedco Sherbrooke',            address: '3500 Boul. Industriel, Sherbrooke, QC',    lat: 45.4042, lng: -71.8929 },
  { name: 'Nedco Gatineau',              address: '200 Boul. Saint-René E, Gatineau, QC',     lat: 45.4765, lng: -75.7013 },
  { name: 'Nedco Trois-Rivières',        address: '4050 Rue des Forges, Trois-Rivières, QC',  lat: 46.3432, lng: -72.5477 },
];

async function createNedcoPage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToNedco(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.nedco.ca/cnd/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input#j_username', 'input[name="j_username"]', 'input[name="username"]', 'input[type="email"]', 'input[id*="user"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input#j_password', 'input[name="j_password"]', 'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.includes('/login') && url.includes('nedco.ca');
}

export async function testNedcoConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createNedcoPage(browser);
    const loggedIn = await loginToNedco(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Nedco invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getNedcoPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createNedcoPage(browser);
    const loggedIn = await loginToNedco(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.nedco.ca/cnd/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"]):not([class*="was"])').first();
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

export async function placeNedcoOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createNedcoPage(browser);
    const loggedIn = await loginToNedco(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Nedco échoué' };

    await page.goto(
      `https://www.nedco.ca/cnd/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a.product-item__name, .product-name a, h3 a[href*="/p/"], .product-list__item a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator('input[name="qty"], input[id*="qty"], input[name="quantity"]').first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
      }

      const addToCartBtn = page.locator(
        'button:has-text("Add to Cart"), button:has-text("Ajouter au panier"), button[class*="add-to-cart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Nedco` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
```

### Step 2: Create lib/nedco-catalog.ts

Exact same as `lib/westburne-catalog.ts` with these substitutions:
- `'westburne'` → `'nedco'` (supplier string values)
- `westburne.ca/cwr` → `nedco.ca/cnd`
- `importWestburneCatalog` → `importNedcoCatalog`
- `getWestburneCatalogStats` → `getNedcoCatalogStats`
- Error messages: 'Westburne' → 'Nedco'

### Step 3: Commit

```bash
git add lib/nedco.ts lib/nedco-catalog.ts
git commit -m "feat: add Nedco supplier (Hybris/SAP, Rexel)"
```

---

## Task 5: Futech — lib/futech.ts + lib/futech-catalog.ts

**Platform:** Custom ASP.NET. Login at `/fr/Account/Login`. Playwright handles CSRF tokens automatically.

**Files:**
- Create: `lib/futech.ts`
- Create: `lib/futech-catalog.ts`

### Step 1: Create lib/futech.ts

```typescript
import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const FUTECH_BRANCHES: Branch[] = [
  { name: 'Futech Québec',           address: '2985 Boul. Hamel, Québec, QC',                  lat: 46.8139, lng: -71.2080 },
  { name: 'Futech Montréal',         address: '5600 Boul. Métropolitain E, Montréal, QC',      lat: 45.5942, lng: -73.5550 },
  { name: 'Futech Sherbrooke',       address: '3200 Boul. Industriel, Sherbrooke, QC',         lat: 45.4042, lng: -71.8929 },
  { name: 'Futech Trois-Rivières',   address: '4200 Boul. des Forges, Trois-Rivières, QC',     lat: 46.3432, lng: -72.5477 },
];

async function createFutechPage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToFutech(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://shop.futech.ca/fr/Account/Login', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input[name="Email"]',
    'input[id="Email"]',
    'input[type="email"]',
    'input[name="username"]',
    'input[id*="email"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input[name="Password"]',
    'input[id="Password"]',
    'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.toLowerCase().includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.toLowerCase().includes('/login') && url.includes('futech.ca');
}

export async function testFutechConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createFutechPage(browser);
    const loggedIn = await loginToFutech(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Futech invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getFutechPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createFutechPage(browser);
    const loggedIn = await loginToFutech(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://shop.futech.ca/fr/search?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"])').first();
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

export async function placeFutechOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createFutechPage(browser);
    const loggedIn = await loginToFutech(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Futech échoué' };

    await page.goto(
      `https://shop.futech.ca/fr/search?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a[href*="/fr/p/"], a[href*="/fr/Product"], .product-item a, .product-name a, h3 a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[name="Quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
      }

      const addToCartBtn = page.locator(
        'button[type="submit"]:has-text("Ajouter"), button:has-text("Add to Cart"), button[id*="addtocart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Futech` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
```

### Step 2: Create lib/futech-catalog.ts

Same structure as `westburne-catalog.ts`. Key differences:
- supplier: `'futech'`
- Login URL: `https://shop.futech.ca/fr/Account/Login`
- Login form: `input[name="Email"]` / `input[name="Password"]`
- Category URL base: `https://shop.futech.ca`
- Success check: `page.url().includes('futech.ca') && !page.url().toLowerCase().includes('/login')`
- Product scraping selectors: `'.product-item, .product-card, [class*="product-item"]'`

```typescript
import { createBrowserbaseBrowser } from './browser';
import { getDb } from './db';
import { decrypt } from './encrypt';
import type { ImportProgress } from './westburne-catalog';
export type { ImportProgress };

export async function importFutechCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'futech' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte Futech configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'futech' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const password = decrypt(account.password_encrypted);

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('futech', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  const browser = await createBrowserbaseBrowser();
  let totalImported = 0;

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'fr-CA',
    });
    await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const page = await context.newPage();

    await page.goto('https://shop.futech.ca/fr/Account/Login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const emailField = page.locator(['input[name="Email"]', 'input[type="email"]'].join(', ')).first();
    await emailField.waitFor({ timeout: 15000 });
    await emailField.fill(account.username);
    const passwordField = page.locator(['input[name="Password"]', 'input[type="password"]'].join(', ')).first();
    await passwordField.waitFor({ timeout: 10000 });
    await passwordField.fill(password);
    await passwordField.press('Enter');
    await page.waitForFunction(() => !window.location.pathname.toLowerCase().includes('/login'), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    if (page.url().toLowerCase().includes('/login')) return { total: 0, error: 'Login Futech échoué' };

    for (const cat of categories) {
      let pageNum = 1;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://shop.futech.ca${cat.category_url}?page=${pageNum}`;
        let products: any[] = [];

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          products = await page.evaluate(() => {
            const items: any[] = [];
            const cards = document.querySelectorAll('.product-item, .product-card, [class*="product-item"], li[class*="item"]');
            for (const card of Array.from(cards)) {
              const nameEl = card.querySelector('a[href*="/fr/p/"], .product-name a, h3 a, h2 a, .name a');
              const name = nameEl?.textContent?.trim() || '';
              if (name.length < 3) continue;
              const imgEl = card.querySelector('img') as HTMLImageElement | null;
              const image_url = imgEl?.src || '';
              const skuEl = card.querySelector('[class*="sku"], [class*="code"], [data-sku]');
              const sku = skuEl?.textContent?.trim() || (nameEl as HTMLAnchorElement)?.href?.split('/').pop() || name.slice(0, 40);
              const priceEl = card.querySelector('[class*="price"]:not([class*="old"])');
              const priceText = priceEl?.textContent?.trim() || '';
              const priceMatch = priceText.match(/[\d]+[.,][\d]{2}/);
              const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : null;
              items.push({ name, sku, image_url, price, unit: 'unité' });
            }
            return items;
          });
        } catch { break; }

        if (products.length === 0) break;

        db.transaction((prods: any[]) => {
          for (const p of prods) {
            try { upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name); } catch {}
          }
        })(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (products.length < 20) break;
        pageNum++;
        if (pageNum > 50) break;
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  } finally {
    await browser.close();
  }
}

export function getFutechCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'futech'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'futech'").get() as any).last;
  return { count, lastSync };
}
```

### Step 3: Commit

```bash
git add lib/futech.ts lib/futech-catalog.ts
git commit -m "feat: add Futech supplier (ASP.NET)"
```

---

## Task 6: Deschênes — lib/deschenes.ts + lib/deschenes-catalog.ts

**Platform:** Salesforce Commerce Cloud (SFCC). Login at `/s/login` or similar SFCC standard path.

**Files:**
- Create: `lib/deschenes.ts`
- Create: `lib/deschenes-catalog.ts`

### Step 1: Create lib/deschenes.ts

```typescript
import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const DESCHENES_BRANCHES: Branch[] = [
  { name: 'Deschênes Québec',         address: '2300 Boul. Hamel, Québec, QC',               lat: 46.8139, lng: -71.2080 },
  { name: 'Deschênes Montréal',       address: '7575 Boul. Métropolitain E, Montréal, QC',   lat: 45.5942, lng: -73.5550 },
  { name: 'Deschênes Laval',          address: '3300 Boul. de la Concorde E, Laval, QC',     lat: 45.5756, lng: -73.7019 },
  { name: 'Deschênes Sherbrooke',     address: '3600 Boul. Industriel, Sherbrooke, QC',      lat: 45.4042, lng: -71.8929 },
  { name: 'Deschênes Trois-Rivières', address: '4100 Boul. des Forges, Trois-Rivières, QC',  lat: 46.3432, lng: -72.5477 },
  { name: 'Deschênes Gatineau',       address: '180 Boul. Saint-René E, Gatineau, QC',       lat: 45.4765, lng: -75.7013 },
];

async function createDeschenesPage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToDeschenes(page: any, username: string, password: string): Promise<boolean> {
  // SFCC login — try /s/?action=Login first, then /s/login
  await page.goto('https://www.deschenes.qc.ca/s/login?language=fr', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input[name="loginEmail"]',
    'input[id="loginEmail"]',
    'input[name="username"]',
    'input[type="email"]',
    'input[id*="email"]',
    'input[id*="user"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input[name="loginPassword"]',
    'input[id="loginPassword"]',
    'input[name="password"]',
    'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.toLowerCase().includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.toLowerCase().includes('/login') && url.includes('deschenes.qc.ca');
}

export async function testDeschemesConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createDeschenesPage(browser);
    const loggedIn = await loginToDeschenes(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Deschênes invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getDeschenesPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createDeschenesPage(browser);
    const loggedIn = await loginToDeschenes(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.deschenes.qc.ca/s/search?q=${encodeURIComponent(product)}&language=fr`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"]):not([class*="strike"])').first();
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

export async function placeDeschemesOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createDeschenesPage(browser);
    const loggedIn = await loginToDeschenes(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Deschênes échoué' };

    await page.goto(
      `https://www.deschenes.qc.ca/s/search?q=${encodeURIComponent(product)}&language=fr`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a[href*="/s/"] .product-name, .product-tile a, h3 a, .tile-body a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator('input[name="quantity"], input[id*="quantity"]').first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
      }

      const addToCartBtn = page.locator(
        'button:has-text("Ajouter au panier"), button:has-text("Add to Cart"), button[class*="add-to-cart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Deschênes` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
```

### Step 2: Create lib/deschenes-catalog.ts

Same structure as `futech-catalog.ts`. Key differences:
- supplier: `'deschenes'`
- Login URL: `https://www.deschenes.qc.ca/s/login?language=fr`
- Login selectors: `input[name="loginEmail"]` / `input[name="loginPassword"]`
- Category URL base: `https://www.deschenes.qc.ca`
- Success check: `!page.url().toLowerCase().includes('/login') && page.url().includes('deschenes')`
- Export function: `importDeschenessCatalog` / `getDeschenessCatalogStats`

The function structure is identical to `futech-catalog.ts`. Just substitute the supplier key, domain, and login form selectors throughout.

### Step 3: Commit

```bash
git add lib/deschenes.ts lib/deschenes-catalog.ts
git commit -m "feat: add Deschênes supplier (Salesforce Commerce Cloud)"
```

---

## Task 7: BMR — lib/bmr.ts + lib/bmr-catalog.ts

**Platform:** Magento 2. Login at `/fr/customer/account/login/`.

**Files:**
- Create: `lib/bmr.ts`
- Create: `lib/bmr-catalog.ts`

### Step 1: Create lib/bmr.ts

```typescript
import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const BMR_BRANCHES: Branch[] = [
  { name: 'BMR Montréal (St-Léonard)', address: '5500 Rue Jarry E, Montréal, QC',             lat: 45.5942, lng: -73.5590 },
  { name: 'BMR Laval',                 address: '4475 Autoroute 440 O, Laval, QC',             lat: 45.5700, lng: -73.7600 },
  { name: 'BMR Longueuil',             address: '3640 Chemin Chambly, Longueuil, QC',          lat: 45.5155, lng: -73.4856 },
  { name: 'BMR Québec',                address: '2625 Boul. Wilfrid-Hamel, Québec, QC',        lat: 46.8108, lng: -71.3250 },
  { name: 'BMR Sherbrooke',            address: '4200 Boul. Portland, Sherbrooke, QC',         lat: 45.4025, lng: -71.8929 },
  { name: 'BMR Gatineau',              address: '820 Boul. Maloney E, Gatineau, QC',            lat: 45.4620, lng: -75.7050 },
  { name: 'BMR Trois-Rivières',        address: '4525 Boul. Jean-XXIII, Trois-Rivières, QC',   lat: 46.3400, lng: -72.5850 },
  { name: 'BMR Drummondville',         address: '1495 Boul. Lemire, Drummondville, QC',        lat: 45.8747, lng: -72.4900 },
];

async function createBmrPage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToBmr(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.bmr.ca/fr/customer/account/login/', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  // Dismiss any cookie/GDPR banner
  const cookieBtn = page.locator(
    'button:has-text("Accepter"), button:has-text("Accept"), #onetrust-accept-btn-handler'
  ).first();
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }

  const emailField = page.locator([
    'input#email',
    'input[name="login[username]"]',
    'input[autocomplete="email"]',
    'input[type="email"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input#pass',
    'input[name="login[password]"]',
    'input[autocomplete="current-password"]',
    'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.includes('/login') && url.includes('bmr.ca');
}

export async function testBmrConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createBmrPage(browser);
    const loggedIn = await loginToBmr(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants BMR invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getBmrPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createBmrPage(browser);
    const loggedIn = await loginToBmr(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.bmr.ca/fr/search/?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('.price .price, [data-price-type="finalPrice"] .price, .price-wrapper .price').first();
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

export async function placeBmrOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createBmrPage(browser);
    const loggedIn = await loginToBmr(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login BMR échoué' };

    await page.goto(
      `https://www.bmr.ca/fr/search/?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a.product-item-link, .product-name a, h3 a[href*="/fr/"]'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator('input#qty, input[name="qty"], input[title*="qty"]').first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
      }

      const addToCartBtn = page.locator(
        'button#product-addtocart-button, button:has-text("Ajouter au panier"), button[class*="tocart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur BMR` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
```

### Step 2: Create lib/bmr-catalog.ts

Same structure as `futech-catalog.ts`. Key differences:
- supplier: `'bmr'`
- Login URL + selectors: same as `loginToBmr` above
- Category URL base: `https://www.bmr.ca`
- Product scraping selectors for Magento 2: `.product-item, .product-item-info, .item.product.product-item`
- Name: `.product-item-link, .product-name a`
- SKU: `[data-sku], .sku .value, [itemprop="sku"]`
- Price: `[data-price-type="finalPrice"] .price`
- Image: `.product-image-photo`
- Export: `importBmrCatalog` / `getBmrCatalogStats`

### Step 3: Commit

```bash
git add lib/bmr.ts lib/bmr-catalog.ts
git commit -m "feat: add BMR supplier (Magento 2)"
```

---

## Task 8: Rona — lib/rona.ts + lib/rona-catalog.ts

**Platform:** IBM WebSphere Commerce backend with Next.js frontend. Login via WCS form POST.

**Files:**
- Create: `lib/rona.ts`
- Create: `lib/rona-catalog.ts`

### Step 1: Create lib/rona.ts

```typescript
import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const RONA_BRANCHES: Branch[] = [
  { name: 'Rona Montréal (Côte-des-Neiges)', address: '6700 Boul. Décarie, Montréal, QC',          lat: 45.4943, lng: -73.6313 },
  { name: 'Rona Laval',                       address: '3098 Boul. le Carrefour, Laval, QC',         lat: 45.5756, lng: -73.7400 },
  { name: 'Rona Longueuil',                   address: '3050 Boul. de Rome, Brossard, QC',           lat: 45.4604, lng: -73.4800 },
  { name: 'Rona Québec (Ste-Foy)',             address: '3175 Boul. Hochelaga, Québec, QC',           lat: 46.7784, lng: -71.3200 },
  { name: 'Rona Sherbrooke',                  address: '4255 Boul. Portland, Sherbrooke, QC',        lat: 45.3980, lng: -71.8929 },
  { name: 'Rona Gatineau',                    address: '705 Boul. de la Gappe, Gatineau, QC',        lat: 45.4765, lng: -75.7400 },
  { name: 'Rona Trois-Rivières',              address: '4995 Boul. Gene-H.-Kruger, Trois-Rivières, QC', lat: 46.3432, lng: -72.5100 },
  { name: 'Rona Drummondville',               address: '1500 Boul. Lemire, Drummondville, QC',       lat: 45.8747, lng: -72.4900 },
];

async function createRonaPage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToRona(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.rona.ca/fr/connexion', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Dismiss cookie banner
  const cookieBtn = page.locator(
    '#onetrust-accept-btn-handler, button:has-text("Accepter tout"), button:has-text("Accept All")'
  ).first();
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }

  const emailField = page.locator([
    'input[name="email"]',
    'input[id="email"]',
    'input[type="email"]',
    'input[id*="logon"]',
    'input[name="logonId"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input[name="password"]',
    'input[id="password"]',
    'input[type="password"]',
    'input[name="logonPassword"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.includes('/connexion') && !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(2000);

  const url = page.url();
  return !url.includes('/connexion') && !url.includes('/login') && url.includes('rona.ca');
}

export async function testRonaConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createRonaPage(browser);
    const loggedIn = await loginToRona(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Rona invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getRonaPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createRonaPage(browser);
    const loggedIn = await loginToRona(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.rona.ca/fr/search?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(3000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"]):not([class*="was"]):not([class*="strike"])').first();
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

export async function placeRonaOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createRonaPage(browser);
    const loggedIn = await loginToRona(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Rona échoué' };

    await page.goto(
      `https://www.rona.ca/fr/search?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(3000);

    const firstProduct = page.locator(
      'a[class*="product-name"], a[href*="/fr/p/"], .product-card a, h3 a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[aria-label*="quantit"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
      }

      const addToCartBtn = page.locator(
        'button:has-text("Ajouter au panier"), button:has-text("Add to Cart"), button[data-test*="add-to-cart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Rona` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
```

### Step 2: Create lib/rona-catalog.ts

Same structure as the other catalog files. Key differences:
- supplier: `'rona'`
- Login URL: `https://www.rona.ca/fr/connexion` with cookie dismiss
- Login selectors: `input[name="email"]` / `input[name="password"]` / `input[name="logonId"]` / `input[name="logonPassword"]`
- Category URL base: `https://www.rona.ca`
- Product selectors: `article[class*="product"], .product-card, [class*="product-tile"]`
- Name: `a[class*="product-name"], .product-name`
- Image: `img[class*="product"]`
- SKU: `[class*="sku"], [data-sku]`
- Price: `[class*="price"]:not([class*="old"])`
- Pagination: check for next page button `button[aria-label*="suivant"], a[aria-label*="Next"]`
- Export: `importRonaCatalog` / `getRonaCatalogStats`

### Step 3: Commit

```bash
git add lib/rona.ts lib/rona-catalog.ts
git commit -m "feat: add Rona supplier (IBM WebSphere + Next.js)"
```

---

## Task 9: API Routes

**Files:**
- Modify: `app/api/superadmin/catalog/account/route.ts`
- Modify: `app/api/superadmin/catalog/import/route.ts`
- Modify: `app/api/superadmin/catalog/import-all/route.ts`

### Step 1: Update account/route.ts

Change the SUPPLIERS constant (line 7) and add the test-connection imports:

```typescript
// BEFORE
const SUPPLIERS = ['lumen', 'canac', 'homedepot', 'guillevin'] as const;

// AFTER
const SUPPLIERS = ['lumen', 'canac', 'homedepot', 'guillevin', 'jsv', 'westburne', 'nedco', 'futech', 'deschenes', 'bmr', 'rona'] as const;
```

### Step 2: Update import/route.ts

Add imports at the top:
```typescript
import { importJsvCatalog, getJsvCatalogStats } from '@/lib/jsv-catalog';
import { importWestburneCatalog, getWestburneCatalogStats } from '@/lib/westburne-catalog';
import { importNedcoCatalog, getNedcoCatalogStats } from '@/lib/nedco-catalog';
import { importFutechCatalog, getFutechCatalogStats } from '@/lib/futech-catalog';
import { importDeschenessCatalog, getDeschenessCatalogStats } from '@/lib/deschenes-catalog';
import { importBmrCatalog, getBmrCatalogStats } from '@/lib/bmr-catalog';
import { importRonaCatalog, getRonaCatalogStats } from '@/lib/rona-catalog';
```

In the GET handler, add after the guillevin case:
```typescript
if (supplier === 'jsv')       return NextResponse.json(getJsvCatalogStats());
if (supplier === 'westburne') return NextResponse.json(getWestburneCatalogStats());
if (supplier === 'nedco')     return NextResponse.json(getNedcoCatalogStats());
if (supplier === 'futech')    return NextResponse.json(getFutechCatalogStats());
if (supplier === 'deschenes') return NextResponse.json(getDeschenessCatalogStats());
if (supplier === 'bmr')       return NextResponse.json(getBmrCatalogStats());
if (supplier === 'rona')      return NextResponse.json(getRonaCatalogStats());
```

In the POST handler's `if` chain, add after guillevin:
```typescript
} else if (supplier === 'jsv') {
  result = await importJsvCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
  stats = getJsvCatalogStats();
} else if (supplier === 'westburne') {
  result = await importWestburneCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
  stats = getWestburneCatalogStats();
} else if (supplier === 'nedco') {
  result = await importNedcoCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
  stats = getNedcoCatalogStats();
} else if (supplier === 'futech') {
  result = await importFutechCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
  stats = getFutechCatalogStats();
} else if (supplier === 'deschenes') {
  result = await importDeschenessCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
  stats = getDeschenessCatalogStats();
} else if (supplier === 'bmr') {
  result = await importBmrCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
  stats = getBmrCatalogStats();
} else if (supplier === 'rona') {
  result = await importRonaCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
  stats = getRonaCatalogStats();
```

### Step 3: Update import-all/route.ts

Add the same imports as Step 2 above.

Change SUPPLIERS constant:
```typescript
const SUPPLIERS = ['lumen', 'canac', 'homedepot', 'guillevin', 'jsv', 'westburne', 'nedco', 'futech', 'deschenes', 'bmr', 'rona'] as const;
```

Add new supplier cases to the `if` chain inside the loop (after guillevin):
```typescript
} else if (supplier === 'jsv') {
  result = await importJsvCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
  stats = getJsvCatalogStats();
} else if (supplier === 'westburne') {
  result = await importWestburneCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
  stats = getWestburneCatalogStats();
} else if (supplier === 'nedco') {
  result = await importNedcoCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
  stats = getNedcoCatalogStats();
} else if (supplier === 'futech') {
  result = await importFutechCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
  stats = getFutechCatalogStats();
} else if (supplier === 'deschenes') {
  result = await importDeschenessCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
  stats = getDeschenessCatalogStats();
} else if (supplier === 'bmr') {
  result = await importBmrCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
  stats = getBmrCatalogStats();
} else if (supplier === 'rona') {
  result = await importRonaCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
  stats = getRonaCatalogStats();
```

### Step 4: Commit

```bash
git add app/api/superadmin/catalog/account/route.ts app/api/superadmin/catalog/import/route.ts app/api/superadmin/catalog/import-all/route.ts
git commit -m "feat: add 7 new suppliers to catalog API routes"
```

---

## Task 10: Superadmin UI

**File:** `app/superadmin/page.tsx`

### Step 1: Update loadCatalogData function

The `loadCatalogData` function fetches stats for each supplier. Add the 7 new suppliers:

```typescript
async function loadCatalogData() {
  const [accountsRes, ...statsRes] = await Promise.all([
    fetch('/api/superadmin/catalog/account'),
    fetch('/api/superadmin/catalog/import?supplier=lumen'),
    fetch('/api/superadmin/catalog/import?supplier=canac'),
    fetch('/api/superadmin/catalog/import?supplier=homedepot'),
    fetch('/api/superadmin/catalog/import?supplier=guillevin'),
    fetch('/api/superadmin/catalog/import?supplier=jsv'),
    fetch('/api/superadmin/catalog/import?supplier=westburne'),
    fetch('/api/superadmin/catalog/import?supplier=nedco'),
    fetch('/api/superadmin/catalog/import?supplier=futech'),
    fetch('/api/superadmin/catalog/import?supplier=deschenes'),
    fetch('/api/superadmin/catalog/import?supplier=bmr'),
    fetch('/api/superadmin/catalog/import?supplier=rona'),
  ]);
  const accounts: CatalogAccount[] = await accountsRes.json();
  setCatalogAccounts(accounts);
  const suppliers = ['lumen', 'canac', 'homedepot', 'guillevin', 'jsv', 'westburne', 'nedco', 'futech', 'deschenes', 'bmr', 'rona'];
  const stats: Record<string, CatalogStats> = {};
  for (let i = 0; i < suppliers.length; i++) {
    stats[suppliers[i]] = await statsRes[i].json();
  }
  setCatalogStats(stats);
}
```

### Step 2: Update supplier card grid

The current grid is `grid-cols-2`. With 11 suppliers it becomes unwieldy. Change to accommodate more suppliers while keeping the same card component pattern.

Replace the grid section (the array map starting with `[{ key: 'lumen', ... }]`):

```typescript
<div className="grid grid-cols-2 gap-3">
  {[
    { key: 'lumen',     label: 'Lumen',       cls: 'bg-blue-900/40 text-blue-300 border-blue-800' },
    { key: 'canac',     label: 'Canac',       cls: 'bg-green-900/40 text-green-300 border-green-800' },
    { key: 'homedepot', label: 'Home Depot',  cls: 'bg-orange-900/40 text-orange-300 border-orange-800' },
    { key: 'guillevin', label: 'Guillevin',   cls: 'bg-purple-900/40 text-purple-300 border-purple-800' },
    { key: 'jsv',       label: 'JSV',         cls: 'bg-yellow-900/40 text-yellow-300 border-yellow-800' },
    { key: 'westburne', label: 'Westburne',   cls: 'bg-red-900/40 text-red-300 border-red-800' },
    { key: 'nedco',     label: 'Nedco',       cls: 'bg-pink-900/40 text-pink-300 border-pink-800' },
    { key: 'futech',    label: 'Futech',      cls: 'bg-indigo-900/40 text-indigo-300 border-indigo-800' },
    { key: 'deschenes', label: 'Deschênes',   cls: 'bg-teal-900/40 text-teal-300 border-teal-800' },
    { key: 'bmr',       label: 'BMR',         cls: 'bg-lime-900/40 text-lime-300 border-lime-800' },
    { key: 'rona',      label: 'Rona',        cls: 'bg-cyan-900/40 text-cyan-300 border-cyan-800' },
  ].map(s => {
    // ... same card render logic as before, no changes needed inside ...
  })}
</div>
```

### Step 3: Commit

```bash
git add app/superadmin/page.tsx
git commit -m "feat: add 7 new supplier cards to superadmin catalog UI"
```

---

## Verification

After all tasks are complete:

1. Run TypeScript check:
   ```bash
   npx tsc --noEmit
   ```
   Expected: no errors

2. Start dev server:
   ```bash
   npm run dev
   ```
   Expected: starts without errors

3. Navigate to superadmin catalog section — verify 11 supplier cards are visible

4. Try configuring a JSV account and importing catalog — should stream progress events

5. Verify `getActiveAccounts()` in supplier-router.ts returns new suppliers when configured
