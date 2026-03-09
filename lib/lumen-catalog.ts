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

/* ───────────────────────────────────────────────────────────────────────────
 * Bloomreach Discovery API
 * Lumen uses Bloomreach (account 6502) for product search.
 * Public prices are $0.01 (B2B placeholder) — real prices require login.
 * ─────────────────────────────────────────────────────────────────────────── */

const BR_BASE = 'https://core.dxpapi.com/api/v1/core/';
const BR_ACCOUNT = '6502';
const BR_DOMAIN = 'soneparcanada_en_lumen';

interface BRProduct {
  pid: string;
  title: string;
  thumb_image?: string;
  url?: string;
  brand?: string;
  price?: number;
  sale_price?: number;
}

/** Fetch products from Bloomreach keyword search with pagination */
async function brSearchProducts(
  query: string,
  maxResults = 500,
): Promise<BRProduct[]> {
  const allProducts: BRProduct[] = [];
  const rows = 48;
  let start = 0;

  while (start < maxResults) {
    const params = new URLSearchParams({
      account_id: BR_ACCOUNT,
      domain_key: BR_DOMAIN,
      request_type: 'search',
      search_type: 'keyword',
      q: query,
      fl: 'pid,title,price,sale_price,thumb_image,url,brand',
      rows: String(rows),
      start: String(start),
      url: 'https://www.lumen.ca',
      ref_url: 'https://www.lumen.ca',
      request_id: String(Date.now()),
    });

    try {
      const res = await fetch(`${BR_BASE}?${params}`);
      if (!res.ok) {
        console.error(`[Lumen API] Search "${query}" failed: HTTP ${res.status}`);
        break;
      }
      const data = await res.json();
      const docs: BRProduct[] = data?.response?.docs || [];
      if (docs.length === 0) break;

      allProducts.push(...docs);
      const numFound = data?.response?.numFound || 0;
      start += rows;
      if (start >= numFound) break;
    } catch (err: any) {
      console.error(`[Lumen API] Search "${query}" error: ${err.message}`);
      break;
    }
  }

  return allProducts;
}

/** Fetch subcategory names from Bloomreach facets for a category */
async function brGetSubcategories(catId: string): Promise<{ name: string; id: string }[]> {
  const params = new URLSearchParams({
    account_id: BR_ACCOUNT,
    domain_key: BR_DOMAIN,
    request_type: 'search',
    search_type: 'category',
    q: '',
    fl: 'pid',
    rows: '0',
    start: '0',
    url: 'https://www.lumen.ca',
    view_id: 'base',
    'facet.field': 'category',
    'facet.version': '3.0',
  });

  try {
    const res = await fetch(`${BR_BASE}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    // Facets are in data.facet_counts.facets[0].value (array of {cat_id, cat_name, parent, count})
    const facetEntry = data?.facet_counts?.facets;
    const allCats: any[] = Array.isArray(facetEntry) && facetEntry.length > 0
      ? facetEntry[0].value || []
      : [];

    // Recursively find all descendants of catId
    const subs: { name: string; id: string }[] = [];
    function findChildren(parentId: string) {
      for (const item of allCats) {
        if (item.parent === parentId) {
          subs.push({ name: item.cat_name, id: item.cat_id });
          findChildren(item.cat_id);
        }
      }
    }
    findChildren(catId);
    return subs;
  } catch {
    return [];
  }
}

// Bloomreach category IDs mapped from Lumen URL paths
const CATEGORY_BR_IDS: Record<string, string> = {
  '/en/products/28-wire-cords-cables': '10280000000000',
  '/en/products/20-power-distribution': '10200000000000',
  '/en/products/11-conduit-raceway-strut': '10110000000000',
  '/en/products/15-enclosures-boxes': '10150000000000',
  '/en/products/18-lighting': '10180000000000',
  '/en/products/24-wiring-devices-wallplates': '10240000000000',
  '/en/products/12-control-automation': '10120000000000',
  '/en/products/25-tools-instruments': '10250000000000',
  '/en/products/27-wire-termination-wire-marking-supplies': '10270000000000',
  '/en/products/16-fasteners-hardwares': '10160000000000',
  '/en/products/22-safety-products': '10220000000000',
  '/en/products/21-power-sources-motors': '10210000000000',
  '/en/products/13-datacom': '10130000000000',
  '/en/products/32-ev-charging-stations': '10320000000000',
  '/en/products/17-heat-ventilation': '10170000000000',
  '/en/products/10-adhesives-chemicals-lubricants': '10100000000000',
  '/en/products/14-electric-utility-outside-plant-products': '10140000000000',
  '/en/products/50-clearance': '10500000000000',
};

// Fallback search keywords if subcategory discovery fails
const CATEGORY_FALLBACK_KEYWORDS: Record<string, string[]> = {
  '/en/products/28-wire-cords-cables': [
    'nmd90', 'teck cable', 'building wire', 'romex', 'ac90',
    'loomex', 'armoured cable', 'THHN', 'RW90', 'copper wire',
    'aluminum wire', 'thermostat wire', 'speaker wire', 'coaxial',
  ],
  '/en/products/20-power-distribution': [
    'circuit breaker', 'load center', 'panel board', 'disconnect switch',
    'fuse', 'transformer', 'meter socket', 'terminal block',
    'surge protector', 'ground bar',
  ],
  '/en/products/11-conduit-raceway-strut': [
    'EMT conduit', 'PVC conduit', 'rigid conduit', 'liquid tight',
    'cable tray', 'strut channel', 'conduit fitting', 'coupling',
    'connector conduit', 'raceway', 'flex conduit',
  ],
  '/en/products/15-enclosures-boxes': [
    'junction box', 'outlet box', 'weatherproof box', 'pull box',
    'gangable box', 'enclosure nema', 'device box', 'panel enclosure',
    'utility box', 'ceiling box',
  ],
  '/en/products/18-lighting': [
    'LED fixture', 'recessed light', 'troffer', 'high bay',
    'flood light', 'wall pack', 'exit sign', 'emergency light',
    'strip light', 'track light', 'down light', 'panel light',
  ],
  '/en/products/24-wiring-devices-wallplates': [
    'receptacle', 'wall switch', 'wallplate', 'GFCI',
    'dimmer switch', 'outlet duplex', 'toggle switch', 'decora',
    'plug connector', 'sensor switch',
  ],
};

/* ───────────────────────────────────────────────────────────────────────────
 * Phase 1: API-based catalog import (fast, no browser needed)
 * ─────────────────────────────────────────────────────────────────────────── */

async function importCategoryViaAPI(
  categoryUrl: string,
  categoryName: string,
  onProgress?: (p: ImportProgress) => void,
): Promise<BRProduct[]> {
  const allProducts: BRProduct[] = [];
  const seen = new Set<string>();

  // Strategy 1: Use subcategory names from facets as search terms
  const brId = CATEGORY_BR_IDS[categoryUrl];
  let searchTerms: string[] = [];

  if (brId) {
    const subs = await brGetSubcategories(brId);
    if (subs.length > 0) {
      searchTerms = subs.map(s => s.name);
      console.error(`[Lumen API] ${categoryName}: ${subs.length} subcategories from facets`);
    }
  }

  // Strategy 2: Fallback to predefined keywords
  if (searchTerms.length === 0) {
    searchTerms = CATEGORY_FALLBACK_KEYWORDS[categoryUrl] || [categoryName];
    console.error(`[Lumen API] ${categoryName}: using ${searchTerms.length} fallback keywords`);
  }

  for (const term of searchTerms) {
    const products = await brSearchProducts(term, 500);
    for (const p of products) {
      if (!p.pid || seen.has(p.pid)) continue;
      seen.add(p.pid);
      allProducts.push(p);
    }
    onProgress?.({
      category: categoryName,
      imported: allProducts.length,
      total: allProducts.length,
      done: false,
    });
  }

  console.error(`[Lumen API] ${categoryName}: ${allProducts.length} unique products`);
  return allProducts;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Phase 2: Browser-based price enrichment
 * Uses stealth browser with proper login to extract B2B prices.
 * ─────────────────────────────────────────────────────────────────────────── */

async function createStealthPage(browser: any) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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

async function loginToLumen(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.lumen.ca/en/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Dismiss cookie consent
  const cookieBtn = page.locator(
    '#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accepter tout"), button:has-text("Accepter")'
  ).first();
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(800);
  }

  // Fill login form with type() for bot-detection evasion
  const loginForm = page.locator('form:has(input[type="password"])').first();
  await loginForm.waitFor({ timeout: 10000 });

  const usernameField = loginForm.locator(
    'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])'
  ).first();
  await usernameField.click();
  await usernameField.type(username, { delay: 60 });
  await page.waitForTimeout(400);

  const passwordField = loginForm.locator('input[type="password"]').first();
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(400);

  await passwordField.press('Enter');
  await page.waitForTimeout(6000);

  // Verify login by checking account page
  await page.goto('https://www.lumen.ca/en/account', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);
  const url = page.url();
  return !url.includes('/account/login') && !url.includes('/login');
}

/** Use the search typeahead to look up prices for products */
async function enrichPricesViaBrowser(
  page: any,
  products: Map<string, { sku: string; name: string }>,
  onProgress?: (count: number) => void,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const skus = Array.from(products.keys());
  let processed = 0;

  for (const sku of skus) {
    const product = products.get(sku)!;
    // Use SKU as search term (clean up for search)
    const searchTerm = sku
      .replace(/^(SKU_CAN_|LUM)/, '')
      .replace(/[_]/g, ' ')
      .slice(0, 20);

    try {
      await page.goto('https://www.lumen.ca/en', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);

      const searchBar = page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="Rechercher"]').first();
      await searchBar.click();
      await searchBar.fill('');
      await searchBar.type(searchTerm, { delay: 80 });
      await page.waitForTimeout(2500);

      // Extract price from typeahead dropdown
      const priceText = await page.evaluate(() => {
        // Look for price elements in the search results dropdown
        const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"], .product-price, .search-price');
        for (const el of priceEls) {
          const text = el.textContent?.trim() || '';
          const match = text.match(/\$\s*([\d]+[.,][\d]{2})/);
          if (match) {
            const price = parseFloat(match[1].replace(',', '.'));
            if (price > 0.02) return price; // Skip $0.01 placeholders
          }
        }
        // Broader search for $ in the page
        const allEls = document.querySelectorAll('*');
        for (const el of allEls) {
          if (el.children.length > 0) continue;
          const text = el.textContent?.trim() || '';
          if (text.includes('$') && text.length < 30) {
            const match = text.match(/\$\s*([\d]+[.,][\d]{2})/);
            if (match) {
              const price = parseFloat(match[1].replace(',', '.'));
              if (price > 0.02) return price;
            }
          }
        }
        return null;
      });

      if (priceText) {
        prices.set(sku, priceText);
      }
    } catch {
      // Non-fatal — continue with next product
    }

    processed++;
    if (processed % 10 === 0) {
      onProgress?.(processed);
    }

    // Rate limit to avoid being blocked
    if (processed % 50 === 0) {
      await page.waitForTimeout(2000);
    }
  }

  return prices;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Main import function
 * ─────────────────────────────────────────────────────────────────────────── */

export async function importLumenCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'lumen' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte Lumen configuré' };

  // Ensure all Lumen categories exist for this company_id
  const ALL_LUMEN_CATEGORIES = [
    { name: 'Fils et câbles',           url: '/en/products/28-wire-cords-cables',                          enabled: 1 },
    { name: 'Disjoncteurs et panneaux', url: '/en/products/20-power-distribution',                         enabled: 1 },
    { name: 'Conduits et chemins',      url: '/en/products/11-conduit-raceway-strut',                      enabled: 1 },
    { name: 'Boîtes et boîtiers',       url: '/en/products/15-enclosures-boxes',                           enabled: 1 },
    { name: 'Éclairage',                url: '/en/products/18-lighting',                                   enabled: 1 },
    { name: 'Prises et interrupteurs',  url: '/en/products/24-wiring-devices-wallplates',                  enabled: 1 },
    { name: 'Automatisation',           url: '/en/products/12-control-automation',                         enabled: 0 },
    { name: 'Outils',                   url: '/en/products/25-tools-instruments',                          enabled: 0 },
    { name: 'Terminaison de fils',      url: '/en/products/27-wire-termination-wire-marking-supplies',     enabled: 0 },
    { name: 'Quincaillerie',            url: '/en/products/16-fasteners-hardwares',                        enabled: 0 },
    { name: 'Sécurité',                 url: '/en/products/22-safety-products',                            enabled: 0 },
    { name: 'Moteurs et sources',       url: '/en/products/21-power-sources-motors',                       enabled: 0 },
    { name: 'Datacom',                  url: '/en/products/13-datacom',                                    enabled: 0 },
    { name: 'Bornes de recharge VÉ',    url: '/en/products/32-ev-charging-stations',                       enabled: 0 },
    { name: 'Chauffage et ventilation', url: '/en/products/17-heat-ventilation',                           enabled: 0 },
    { name: 'Adhésifs et produits',     url: '/en/products/10-adhesives-chemicals-lubricants',             enabled: 0 },
    { name: 'Utilité électrique',       url: '/en/products/14-electric-utility-outside-plant-products',    enabled: 0 },
    { name: 'Liquidation',              url: '/en/products/50-clearance',                                  enabled: 0 },
  ];
  const cid = companyId ?? null;
  for (const c of ALL_LUMEN_CATEGORIES) {
    const exists = db.prepare(
      "SELECT 1 FROM supplier_categories WHERE supplier = 'lumen' AND category_url = ? AND company_id = ? LIMIT 1"
    ).get(c.url, cid);
    if (!exists) {
      db.prepare(
        "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('lumen', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, cid);
    }
  }

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'lumen' AND enabled = 1 AND company_id = ?"
  ).all(cid) as any[];
  console.error(`[Lumen catalog] ${categories.length} enabled categories`);
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  onProgress?.({ category: `Phase 1: API — ${categories.length} catégories`, imported: 0, total: 0, done: false });

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('lumen', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name,
      image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END,
      price = CASE WHEN excluded.price IS NOT NULL AND excluded.price > 0.02 THEN excluded.price ELSE products.price END,
      unit = excluded.unit,
      category = excluded.category,
      last_synced = CURRENT_TIMESTAMP
  `);

  let totalImported = 0;
  const productsForPricing = new Map<string, { sku: string; name: string }>();

  // ── Phase 1: Import via Bloomreach API ──
  for (const cat of categories) {
    onProgress?.({ category: `API: ${cat.category_name}`, imported: 0, total: 0, done: false });

    try {
      const products = await importCategoryViaAPI(
        cat.category_url,
        cat.category_name,
        onProgress,
      );

      let categoryCount = 0;
      const insertMany = db.transaction((prods: BRProduct[]) => {
        for (const p of prods) {
          const sku = p.pid || '';
          if (!sku || !p.title) continue;

          // Clean up image URL
          let imageUrl = p.thumb_image || '';
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = `https://cdn-e.soneparcanada.io${imageUrl}`;
          }

          // Price: skip $0.01 placeholders
          const price = (p.price && p.price > 0.02) ? p.price : null;

          try {
            upsert.run(sku, p.title, imageUrl, price, 'units', cat.category_name);
            categoryCount++;
            // Track for price enrichment (only if no price)
            if (!price) {
              productsForPricing.set(sku, { sku, name: p.title });
            }
          } catch {}
        }
      });
      insertMany(products);

      totalImported += categoryCount;
      onProgress?.({ category: cat.category_name, imported: categoryCount, total: categoryCount, done: true });
      console.error(`[Lumen catalog] ${cat.category_name}: ${categoryCount} products imported via API`);
    } catch (err: any) {
      console.error(`[Lumen catalog] API error for ${cat.category_name}: ${err.message}`);
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: true, error: err.message });
    }
  }

  // ── Phase 2: Browser-based price enrichment ──
  if (productsForPricing.size > 0) {
    onProgress?.({ category: `Phase 2: Prix — ${Math.min(productsForPricing.size, 200)} produits`, imported: 0, total: 0, done: false });
    console.error(`[Lumen catalog] Starting price enrichment for ${productsForPricing.size} products`);

    let browser;
    try {
      const password = decrypt(account.password_encrypted);
      browser = await createBrowserbaseBrowser();
      const page = await createStealthPage(browser);

      const loggedIn = await loginToLumen(page, account.username, password);
      if (loggedIn) {
        console.error('[Lumen catalog] Login successful for price enrichment');

        // Limit to 200 products for price enrichment (typeahead is slow)
        const limitedProducts = new Map<string, { sku: string; name: string }>();
        let count = 0;
        for (const [key, val] of productsForPricing) {
          if (count >= 200) break;
          limitedProducts.set(key, val);
          count++;
        }

        const prices = await enrichPricesViaBrowser(page, limitedProducts, (processed) => {
          onProgress?.({
            category: `Prix: ${processed}/${limitedProducts.size}`,
            imported: processed,
            total: limitedProducts.size,
            done: false,
          });
        });

        // Update prices in DB
        const updatePrice = db.prepare(
          "UPDATE products SET price = ?, last_synced = CURRENT_TIMESTAMP WHERE supplier = 'lumen' AND sku = ?"
        );
        const updateMany = db.transaction((entries: [string, number][]) => {
          for (const [sku, price] of entries) {
            updatePrice.run(price, sku);
          }
        });
        updateMany(Array.from(prices.entries()));
        console.error(`[Lumen catalog] Enriched ${prices.size} products with prices`);
        onProgress?.({ category: `Prix enrichis: ${prices.size}`, imported: prices.size, total: prices.size, done: true });
      } else {
        console.error('[Lumen catalog] Login failed for price enrichment — skipping');
        onProgress?.({ category: 'Prix: login échoué', imported: 0, total: 0, done: true, error: 'Login échoué' });
      }
    } catch (err: any) {
      console.error(`[Lumen catalog] Price enrichment error: ${err.message}`);
      onProgress?.({ category: 'Prix', imported: 0, total: 0, done: true, error: err.message });
    } finally {
      if (browser) await browser.close();
    }
  }

  return { total: totalImported };
}

export function searchProducts(query: string, limit = 8) {
  const db = getDb();
  return db.prepare(`
    SELECT name, sku, image_url, price, unit, category
    FROM products
    WHERE supplier = 'lumen' AND (name LIKE ? OR sku LIKE ?)
    ORDER BY
      CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
      name ASC
    LIMIT ?
  `).all(`%${query}%`, `%${query}%`, `${query}%`, limit);
}

export function getCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'lumen'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'lumen'").get() as any).last;
  const withPrice = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'lumen' AND price IS NOT NULL AND price > 0.02").get() as any).count;
  const withImage = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'lumen' AND image_url IS NOT NULL AND image_url != ''").get() as any).count;
  return { count, lastSync, withPrice, withImage };
}
