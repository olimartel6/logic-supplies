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

// Shopify JSON API — max 250 per page, 1-indexed pages
const GUILLEVIN_PAGE_SIZE = 250;

export async function importGuillevinCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'guillevin' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte Guillevin configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'guillevin' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
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

  const browser = await createBrowserbaseBrowser();
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

    await page.locator('button[type="submit"]:visible').last().click();
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

            const parsed: any[] = [];
            for (const p of shopifyProducts) {
              const variant = p.variants?.[0];
              const sku = variant?.sku || String(p.id);
              const price = variant?.price ? parseFloat(variant.price) : null;
              const image_url = p.images?.[0]?.src || '';
              const name = p.title || '';
              if (name.length >= 3) {
                parsed.push({ sku, name, image_url, price, unit: 'units' });
              }
            }
            products = parsed; // atomic assignment — no partial state if retry needed
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

        // Detect if Shopify is returning same page (safety check)
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
