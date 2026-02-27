import { createBrowserbaseBrowser } from './browser';
import { getDb } from './db';
import { decrypt } from './encrypt';

import type { ImportProgress } from './westburne-catalog';
export type { ImportProgress };

export async function importDeschenessCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'deschenes' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte Deschênes configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'deschenes' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const password = decrypt(account.password_encrypted);

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('deschenes', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
    await page.goto('https://www.deschenes.qc.ca/s/login?language=fr', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const emailField = page.locator([
      'input[name="loginEmail"]',
      'input[type="email"]',
    ].join(', ')).first();
    await emailField.waitFor({ timeout: 15000 });
    await emailField.fill(account.username);
    await page.waitForTimeout(300);

    const passwordField = page.locator([
      'input[name="loginPassword"]',
      'input[type="password"]',
    ].join(', ')).first();
    await passwordField.waitFor({ timeout: 10000 });
    await passwordField.fill(password);
    await page.waitForTimeout(300);

    await passwordField.press('Enter');
    await page.waitForFunction(
      () => !window.location.pathname.toLowerCase().includes('/login'), { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(1500);

    const loggedIn = !page.url().toLowerCase().includes('/login') && page.url().includes('deschenes');
    if (!loggedIn) {
      return { total: 0, error: 'Login Deschênes échoué' };
    }

    for (const cat of categories) {
      let pageNum = 1;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://www.deschenes.qc.ca${cat.category_url}?page=${pageNum}`;
        let products: any[] = [];

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          products = await page.evaluate(() => {
            const items: any[] = [];
            const cards = document.querySelectorAll(
              '.product-tile, .product-grid-item, [class*="product-tile"]'
            );
            for (const card of Array.from(cards)) {
              const nameEl = card.querySelector('a[class*="product-name"], .product-name, h3 a');
              const name = nameEl?.textContent?.trim() || '';
              if (name.length < 3) continue;

              const imgEl = card.querySelector('img[class*="product"], .product-image img') as HTMLImageElement | null;
              const image_url = imgEl?.src || '';

              const skuEl = card.querySelector('[class*="sku"], [data-sku], .product-id');
              const sku = skuEl?.textContent?.trim() || name.slice(0, 40);

              const priceEl = card.querySelector('[class*="price"]:not([class*="old"]):not([class*="strike"])');
              const priceText = priceEl?.textContent?.trim() || '';
              const priceMatch = priceText.match(/[\d]+[.,][\d]{2}/);
              const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : null;

              items.push({ name, sku, image_url, price, unit: 'units' });
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

export function getDeschenessCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'deschenes'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'deschenes'").get() as any).last;
  return { count, lastSync };
}
