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

/** Extract Lumen product code from the Bloomreach URL (base64 segment) */
function extractProductCode(brUrl?: string): string {
  if (!brUrl) return '';
  // URL format: https://www.lumen.ca/products/detail/{base64} or /en/products/.../p-{base64}-slug
  const detailMatch = brUrl.match(/\/detail\/([A-Za-z0-9+/=]+)/);
  if (detailMatch) {
    try { return Buffer.from(detailMatch[1], 'base64').toString('utf8'); } catch {}
  }
  const pMatch = brUrl.match(/\/p-([A-Za-z0-9+/=]+)-/);
  if (pMatch) {
    try { return Buffer.from(pMatch[1], 'base64').toString('utf8'); } catch {}
  }
  return '';
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
    const facetEntry = data?.facet_counts?.facets;
    const allCats: any[] = Array.isArray(facetEntry) && facetEntry.length > 0
      ? facetEntry[0].value || []
      : [];

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

  const brId = CATEGORY_BR_IDS[categoryUrl];
  let searchTerms: string[] = [];

  if (brId) {
    const subs = await brGetSubcategories(brId);
    if (subs.length > 0) {
      searchTerms = subs.map(s => s.name);
      console.error(`[Lumen API] ${categoryName}: ${subs.length} subcategories from facets`);
    }
  }

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
 * Phase 2: Cookie-based product + price scraping
 * Login via browser, extract cookies, then use parallel HTTP fetch
 * to scrape products from category pages (server-rendered HTML).
 *
 * Category page HTML structure (per product):
 *   <div class="product-img"><a href="/p-BASE64-slug"><img src="IMAGE_URL"></a></div>
 *   <div class="sub-title" data-e2e-testing-id="product-product-code"><a>PRODUCTCODE</a></div>
 *   <div class="title"><a>PRODUCT NAME</a></div>
 *   <span id="price_spans_{productcode}"><span class="price">$X.XX</span></span>
 *   <span class="supp">/ EA</span>
 * ─────────────────────────────────────────────────────────────────────────── */

interface PageProduct {
  code: string;       // Product code (lowercase, e.g., "sieq115")
  name: string;       // Full product name
  price: number;      // B2B price
  imageUrl: string;   // Image URL
  unit: string;       // Unit (EA, FT, M, etc.)
}

/** Extract full product info from category page HTML */
function extractProductsFromHtml(html: string): PageProduct[] {
  const products: PageProduct[] = [];
  const seen = new Set<string>();

  // Extract prices by product code from price_spans_
  // Prices can have 2-4 decimal places (e.g., $316.68 or $3.8534)
  const prices = new Map<string, { price: number; unit: string }>();
  const priceRegex = /id="price_spans_([^"]+)"[^>]*>\s*<span class="price">\$([\d,]+\.\d{2,4})<\/span>\s*<\/span>\s*<span class="supp">\/\s*([^<]+)<\/span>/g;
  let m;
  while ((m = priceRegex.exec(html)) !== null) {
    const code = m[1].toLowerCase();
    const price = parseFloat(m[2].replace(',', ''));
    const unit = m[3].trim().toLowerCase();
    if (price > 0.02) {
      prices.set(code, { price, unit });
    }
  }
  // Fallback: simpler regex without unit (just price_spans_ → price)
  const simplePriceRegex = /id="price_spans_([^"]+)"[^>]*>\s*<span class="price">\$([\d,]+\.\d{2,4})<\/span>/g;
  while ((m = simplePriceRegex.exec(html)) !== null) {
    const code = m[1].toLowerCase();
    if (!prices.has(code)) {
      const price = parseFloat(m[2].replace(',', ''));
      if (price > 0.02) prices.set(code, { price, unit: 'ea' });
    }
  }

  // Extract product code + name from product-code divs
  // Format: <div ... data-e2e-testing-id="product-product-code"><a href="...">PRODUCTCODE</a></div>
  const codeRegex = /data-e2e-testing-id="product-product-code"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g;
  const names = new Map<string, string>();
  while ((m = codeRegex.exec(html)) !== null) {
    const code = m[1].trim().toLowerCase();
    // Find the next title div after this product code
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 2000);
    const titleMatch = after.match(/<div class="title"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/);
    if (titleMatch) {
      names.set(code, titleMatch[1].trim());
    }
  }

  // Extract images: <div ... class="product-img"> ... <img src="URL"> ... /p-BASE64-slug
  const imgRegex = /class="product-img"[^>]*>\s*<a[^>]+href="[^"]*\/p-[^-]+-([^-]+)-[^"]*"[^>]*>\s*<img[^>]+src="([^"]+)"/g;
  const images = new Map<string, string>();
  while ((m = imgRegex.exec(html)) !== null) {
    const code = m[1].toLowerCase();
    const img = m[2];
    if (img && !images.has(code)) images.set(code, img);
  }

  // Combine: iterate over all found product codes (from prices or names)
  const allCodes = new Set([...prices.keys(), ...names.keys()]);
  for (const code of allCodes) {
    if (seen.has(code)) continue;
    seen.add(code);

    const priceInfo = prices.get(code);
    if (!priceInfo) continue; // Skip products without prices

    products.push({
      code,
      name: names.get(code) || code.toUpperCase(),
      price: priceInfo.price,
      imageUrl: images.get(code) || '',
      unit: priceInfo.unit || 'ea',
    });
  }

  return products;
}

/** Fetch a category page HTML with session cookies (with retry) */
async function fetchCategoryPage(
  url: string,
  cookieHeader: string,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!resp.ok) {
        if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
        return '';
      }
      return await resp.text();
    } catch {
      if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
      return '';
    }
  }
  return '';
}

/** Extract total page count from category page HTML */
function extractTotalPages(html: string): number {
  // Pagination: links with ?page=N — find the highest page number
  const pageLinks = html.match(/\?page=(\d+)/g) || [];
  let max = 1;
  for (const link of pageLinks) {
    const n = parseInt(link.replace('?page=', ''));
    if (n > max) max = n;
  }
  return max;
}

async function createStealthContext(browser: any) {
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
  return context;
}

async function loginToLumen(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.lumen.ca/en/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const cookieBtn = page.locator(
    '#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accepter tout"), button:has-text("Accepter")'
  ).first();
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(800);
  }

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

  await page.goto('https://www.lumen.ca/en/account', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);
  const url = page.url();
  return !url.includes('/account/login') && !url.includes('/login');
}

/**
 * Scrape products + prices from category pages using cookie-based parallel HTTP fetch.
 * Returns full product info (code, name, price, image) from ALL category pages.
 */
async function scrapeProductsFromPages(
  cookieHeader: string,
  categoryUrls: string[],
  categoryNames: string[],
  onProgress?: (msg: string, count: number) => void,
): Promise<{ products: PageProduct[]; categoryMap: Map<string, string> }> {
  const allProducts: PageProduct[] = [];
  const seen = new Set<string>();
  const categoryMap = new Map<string, string>(); // code → category name
  let totalFound = 0;
  const BATCH_SIZE = 5;
  const MAX_PAGES_PER_CATEGORY = 200;

  for (let ci = 0; ci < categoryUrls.length; ci++) {
    const catUrl = categoryUrls[ci];
    const catName = categoryNames[ci];
    const baseUrl = `https://www.lumen.ca${catUrl}`;

    // Fetch page 1 to get total pages
    const page1Html = await fetchCategoryPage(baseUrl, cookieHeader);
    if (!page1Html) {
      console.error(`[Lumen pages] Failed to fetch ${catUrl}`);
      continue;
    }

    const page1Products = extractProductsFromHtml(page1Html);
    for (const p of page1Products) {
      if (!seen.has(p.code)) {
        seen.add(p.code);
        allProducts.push(p);
        categoryMap.set(p.code, catName);
        totalFound++;
      }
    }

    const totalPages = Math.min(extractTotalPages(page1Html), MAX_PAGES_PER_CATEGORY);
    console.error(`[Lumen pages] ${catUrl}: page 1/${totalPages} → ${page1Products.length} products`);
    onProgress?.(`${catName} 1/${totalPages}`, totalFound);

    // Fetch remaining pages in parallel batches
    for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
      const pageNums = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);

      const results = await Promise.all(
        pageNums.map(pg => fetchCategoryPage(`${baseUrl}?page=${pg}`, cookieHeader))
      );

      for (const html of results) {
        if (!html) continue;
        const pageProducts = extractProductsFromHtml(html);
        for (const p of pageProducts) {
          if (!seen.has(p.code)) {
            seen.add(p.code);
            allProducts.push(p);
            categoryMap.set(p.code, catName);
            totalFound++;
          }
        }
      }

      onProgress?.(`${catName} ${batchEnd}/${totalPages}`, totalFound);

      // Small delay between batches to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    }

    console.error(`[Lumen pages] ${catUrl}: done — ${allProducts.length} total products so far`);
  }

  onProgress?.('Terminé', totalFound);
  return { products: allProducts, categoryMap };
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

  // ── Phase 1: Import via Bloomreach API ──
  // Extract product code from Bloomreach URL (base64-decoded) to use as SKU.
  // This matches the price_spans_{productcode} IDs on category pages.
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
          if (!p.title) continue;

          // Extract product code from URL (base64) — matches price_spans_ IDs
          const productCode = extractProductCode(p.url);
          // Fallback: use first word of title (usually the product code)
          const sku = productCode || p.title.split(/\s+/)[0] || p.pid;
          if (!sku) continue;

          let imageUrl = p.thumb_image || '';
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = `https://cdn-e.soneparcanada.io${imageUrl}`;
          }

          // Price: skip $0.01 placeholders
          const price = (p.price && p.price > 0.02) ? p.price : null;

          try {
            upsert.run(sku, p.title, imageUrl, price, 'units', cat.category_name);
            categoryCount++;
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

  // ── Phase 2: Cookie-based product + price scraping ──
  // Login via browser, extract cookies, then parallel-fetch ALL category pages.
  // This imports products with prices directly from the source pages,
  // filling in any gaps from Phase 1 and adding real B2B prices.
  onProgress?.({ category: 'Phase 2: Prix (login...)', imported: 0, total: 0, done: false });
  console.error('[Lumen catalog] Starting category page scraping via cookies');

  let browser;
  try {
    const password = decrypt(account.password_encrypted);
    browser = await createBrowserbaseBrowser();
    const context = await createStealthContext(browser);
    const page = await context.newPage();

    const loggedIn = await loginToLumen(page, account.username, password);
    if (loggedIn) {
      console.error('[Lumen catalog] Login successful — extracting cookies');

      const cookies = await context.cookies();
      const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
      console.error(`[Lumen catalog] Got ${cookies.length} cookies`);

      // Close browser early — we only need cookies now
      await browser.close();
      browser = null;

      const categoryPageUrls = categories.map((c: any) => c.category_url);
      const categoryPageNames = categories.map((c: any) => c.category_name);
      const { products: pageProducts, categoryMap } = await scrapeProductsFromPages(
        cookieHeader, categoryPageUrls, categoryPageNames,
        (msg, count) => {
          onProgress?.({ category: `Pages: ${msg}`, imported: count, total: count, done: false });
        },
      );

      // Upsert products found on category pages (adds new ones + updates prices)
      if (pageProducts.length > 0) {
        let newProducts = 0;
        let pricesUpdated = 0;
        const upsertPage = db.transaction(() => {
          for (const p of pageProducts) {
            const existing = db.prepare(
              "SELECT sku, price FROM products WHERE supplier = 'lumen' AND sku = ?"
            ).get(p.code) as { sku: string; price: number | null } | undefined;

            if (existing) {
              // Update price (and image if missing)
              db.prepare(
                "UPDATE products SET price = ?, unit = ?, last_synced = CURRENT_TIMESTAMP WHERE supplier = 'lumen' AND sku = ?"
              ).run(p.price, p.unit, p.code);
              pricesUpdated++;
            } else {
              // Insert new product from category page
              const cat = categoryMap.get(p.code) || '';
              try {
                upsert.run(p.code, p.name, p.imageUrl, p.price, p.unit, cat);
                newProducts++;
              } catch {}
            }
          }
        });
        upsertPage();

        totalImported += newProducts;
        console.error(`[Lumen catalog] Pages: ${pricesUpdated} prices updated, ${newProducts} new products added (${pageProducts.length} total scraped)`);
        onProgress?.({ category: `Prix: ${pricesUpdated} enrichis, ${newProducts} nouveaux`, imported: pricesUpdated + newProducts, total: pricesUpdated + newProducts, done: true });
      } else {
        console.error('[Lumen catalog] No products found on category pages');
        onProgress?.({ category: 'Prix: aucun produit trouvé', imported: 0, total: 0, done: true });
      }
    } else {
      console.error('[Lumen catalog] Login failed — skipping price enrichment');
      onProgress?.({ category: 'Prix: login échoué', imported: 0, total: 0, done: true, error: 'Login échoué' });
    }
  } catch (err: any) {
    console.error(`[Lumen catalog] Page scraping error: ${err.message}`);
    onProgress?.({ category: 'Prix', imported: 0, total: 0, done: true, error: err.message });
  } finally {
    if (browser) await browser.close();
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
