import { getDb, recordPriceHistory } from './db';
import { createBrowserbaseBrowser } from './browser';
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
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  // Guillevin is Shopify — products.json is public, no login needed (same as JSV)
  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'guillevin' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie Guillevin sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('guillevin', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
        const url = `https://www.guillevin.com${cat.category_url}/products.json?limit=${GUILLEVIN_PAGE_SIZE}&page=${currentPage}`;
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
              const rawPrice = variant?.price ? parseFloat(variant.price) : null;
              // Guillevin is B2B — public prices are $0; treat as unknown
              const price = (rawPrice && rawPrice > 0) ? rawPrice : null;
              const image_url = p.images?.[0]?.src || p.image?.src || '';
              const name = p.title || '';
              if (name.length >= 3) {
                parsed.push({ sku, name, image_url, price, unit: 'units' });
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
            try {
              upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name);
              if (p.price) recordPriceHistory(db, 'guillevin', p.sku, p.price);
            } catch {}
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (products.length < GUILLEVIN_PAGE_SIZE) break;
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

export function getGuillevinCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'guillevin'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'guillevin'").get() as any).last;
  const withPrice = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'guillevin' AND price IS NOT NULL").get() as any).count;
  return { count, lastSync, withPrice };
}

/**
 * Enrich Guillevin product prices by logging in via Browserbase and scraping
 * authenticated prices from collection pages. Guillevin is B2B — public prices
 * are $0, so we need an authenticated session to get real prices.
 */
export async function enrichGuillevinPrices(
  companyId: number,
  onProgress?: (p: ImportProgress) => void,
): Promise<{ updated: number; error?: string }> {
  const db = getDb();

  // Get Guillevin credentials
  const account = db.prepare(
    "SELECT username, password_encrypted FROM supplier_accounts WHERE supplier = 'guillevin' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId) as { username: string; password_encrypted: string } | undefined;
  if (!account) return { updated: 0, error: 'Aucun compte Guillevin configuré' };

  const password = decrypt(account.password_encrypted);

  // Get enabled categories (we need their URLs)
  const categories = db.prepare(
    "SELECT category_name, category_url FROM supplier_categories WHERE supplier = 'guillevin' AND enabled = 1 AND company_id = ?"
  ).all(companyId) as { category_name: string; category_url: string }[];
  if (categories.length === 0) return { updated: 0, error: 'Aucune catégorie Guillevin activée' };

  let browser: any = null;
  let totalUpdated = 0;

  try {
    onProgress?.({ category: 'Connexion...', imported: 0, total: 0, done: false });

    browser = await createBrowserbaseBrowser({ proxies: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'fr-CA',
      extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
      viewport: { width: 1280, height: 800 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      const w = window as any;
      w.didomiConfig = w.didomiConfig || {};
      w.didomiConfig.user = { externalConsent: { value: 'all', type: 'all' } };
      w.didomiOnReady = w.didomiOnReady || [];
      w.didomiOnReady.push(function(Didomi: any) {
        try { Didomi.setUserAgreeToAll(); } catch {}
      });
    });
    await context.addCookies([{
      name: 'didomi_token',
      value: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpYXQiOjE3MTAwMDAwMDAsImV4cCI6MTgwMDAwMDAwMCwidmVuZG9ycyI6eyJlbmFibGVkIjpbXX0sInB1cnBvc2VzIjp7ImVuYWJsZWQiOltdfSwidmVyc2lvbiI6Mn0',
      domain: '.guillevin.com',
      path: '/',
    }]);

    const page = await context.newPage();

    // Login to Guillevin (reusing same flow as guillevin.ts)
    await page.goto('https://www.guillevin.com/account/login', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });

    // Cloudflare warmup
    for (let i = 0; i < 60; i++) {
      const title = await page.title().catch(() => '');
      const isChallenge = title.length < 5 || title.toLowerCase().includes('instant') || title.toLowerCase().includes('moment');
      if (!isChallenge) break;
      if (i === 59) return { updated: 0, error: 'Cloudflare challenge non résolu' };
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(3000);

    // Auth0 login
    const emailField = page.locator('input#username').first();
    if (!await emailField.isVisible({ timeout: 15000 }).catch(() => false)) {
      return { updated: 0, error: 'Formulaire Auth0 non trouvé' };
    }
    await emailField.fill(account.username);
    await page.locator('input#password').first().fill(password);
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Continuer"), button:has-text("Continue"), button[type="submit"]').first().click();

    const redirected = await page.waitForFunction(
      () => !window.location.hostname.includes('auth0.com'),
      { timeout: 30000 }
    ).then(() => true).catch(() => false);
    if (!redirected) return { updated: 0, error: 'Login échoué — pas de redirection' };
    await page.waitForTimeout(3000);

    // Post-login CF check
    for (let i = 0; i < 30; i++) {
      const title = await page.title().catch(() => '');
      if (!(title.length < 5 || title.toLowerCase().includes('instant') || title.toLowerCase().includes('moment'))) break;
      await page.waitForTimeout(2000);
    }

    console.error('[Guillevin enrich] Logged in, starting price scraping');
    onProgress?.({ category: 'Connecté — extraction des prix...', imported: 0, total: 0, done: false });

    const updatePrice = db.prepare(
      "UPDATE products SET price = ?, last_synced = CURRENT_TIMESTAMP WHERE supplier = 'guillevin' AND sku = ?"
    );

    // Navigate to homepage first (needed after login redirect to Shopify)
    await page.goto('https://www.guillevin.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // For each collection, navigate and scrape prices from the rendered DOM.
    // Guillevin's products.json API returns $0 even when authenticated (B2B pricing
    // is only rendered client-side), so we must scrape from the actual page.
    for (const cat of categories) {
      let categoryUpdated = 0;
      let pageNum = 1;

      while (true) {
        // Use perPage=48 to get more products per page (reduces page loads)
        const collectionUrl = `https://www.guillevin.com${cat.category_url}?page=${pageNum}&perPage=48`;
        console.error(`[Guillevin enrich] Scraping ${collectionUrl}`);

        await page.goto(collectionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for initial prices to load (fetched asynchronously)
        await page.waitForSelector('.js-price-value', { timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(2000);

        // Scroll down incrementally to trigger lazy-loaded prices
        const totalHeight = await page.evaluate(() => document.body.scrollHeight);
        for (let y = 0; y < totalHeight; y += 600) {
          await page.evaluate((scrollY: number) => window.scrollTo(0, scrollY), y);
          await page.waitForTimeout(300);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(3000);

        // Scrape product names + prices from the DOM
        const domPrices: { name: string; price: number }[] = await page.evaluate(() => {
          const results: { name: string; price: number }[] = [];
          const cards = document.querySelectorAll('.card-product');
          for (const card of cards) {
            const nameEl = card.querySelector('.product-title');
            const priceEl = card.querySelector('.js-price-value');
            if (nameEl && priceEl) {
              const name = nameEl.textContent?.trim() || '';
              const priceText = priceEl.textContent?.trim() || '';
              const match = priceText.match(/\$?([\d,]+[.][\d]{2})/);
              if (name && match) {
                results.push({ name, price: parseFloat(match[1].replace(',', '')) });
              }
            }
          }
          return results;
        }).catch(() => [] as { name: string; price: number }[]);

        if (domPrices.length === 0) {
          console.error(`[Guillevin enrich] ${cat.category_name} page ${pageNum}: no products found, stopping`);
          break;
        }

        // Match DOM-scraped prices to DB products by name
        const pageUpdated = { count: 0, alreadyHadPrice: 0 };
        const batchUpdateByName = db.transaction(() => {
          for (const p of domPrices) {
            if (p.price <= 0) continue;
            // Match by exact name (case-insensitive)
            const dbProduct = db.prepare(
              "SELECT sku, price FROM products WHERE supplier = 'guillevin' AND UPPER(name) = UPPER(?) LIMIT 1"
            ).get(p.name) as { sku: string; price: number | null } | undefined;
            if (dbProduct) {
              if (dbProduct.price != null) {
                pageUpdated.alreadyHadPrice++;
              } else {
                updatePrice.run(p.price, dbProduct.sku);
                recordPriceHistory(db, 'guillevin', dbProduct.sku, p.price);
                pageUpdated.count++;
              }
            }
          }
        });
        batchUpdateByName();
        categoryUpdated += pageUpdated.count;

        console.error(`[Guillevin enrich] ${cat.category_name} page ${pageNum}: ${domPrices.length} scraped, ${pageUpdated.count} new, ${pageUpdated.alreadyHadPrice} already had price`);

        // If all products on this page already had prices, we've wrapped around — stop
        if (pageUpdated.count === 0 && pageUpdated.alreadyHadPrice > 0) {
          console.error(`[Guillevin enrich] ${cat.category_name}: all prices already set, stopping pagination`);
          break;
        }

        // Check if there's a next page link
        const hasNext = await page.locator('[rel="next"], a:has-text("Next"), .pagination__next, [aria-label="Next"]').first()
          .isVisible({ timeout: 2000 }).catch(() => false);
        if (!hasNext) break;
        pageNum++;
        if (pageNum > 100) break;
      }

      totalUpdated += categoryUpdated;
      onProgress?.({ category: cat.category_name, imported: categoryUpdated, total: categoryUpdated, done: true });
    }

    onProgress?.({ category: 'Terminé', imported: totalUpdated, total: totalUpdated, done: true });
    return { updated: totalUpdated };
  } catch (err: any) {
    console.error(`[Guillevin enrich] Error: ${err.message}`);
    return { updated: totalUpdated, error: err.message };
  } finally {
    if (browser) await browser.close();
  }
}
