import { createBrowserbaseBrowser } from './browser';
import { getDb } from './db';
import { decrypt } from './encrypt';

import type { ImportProgress } from './westburne-catalog';
export type { ImportProgress };

export async function importBmrCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'bmr' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte BMR configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'bmr' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const password = decrypt(account.password_encrypted);

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('bmr', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
      extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
      viewport: { width: 1280, height: 800 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
      (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
    });
    const page = await context.newPage();

    // Login
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
      'input[type="email"]',
    ].join(', ')).first();
    await emailField.waitFor({ timeout: 15000 });
    await emailField.fill(account.username);
    await page.waitForTimeout(300);

    const passwordField = page.locator([
      'input#pass',
      'input[name="login[password]"]',
      'input[type="password"]',
    ].join(', ')).first();
    await passwordField.waitFor({ timeout: 10000 });
    await passwordField.fill(password);
    await page.waitForTimeout(300);

    await passwordField.press('Enter');
    await page.waitForFunction(
      () => !window.location.pathname.includes('/login'), { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(1500);

    if (!page.url().includes('bmr.ca') || page.url().includes('/login')) {
      return { total: 0, error: 'Login BMR échoué' };
    }

    for (const cat of categories) {
      let pageNum = 1;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://www.bmr.ca${cat.category_url}?p=${pageNum}`;
        let products: any[] = [];

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          products = await page.evaluate(() => {
            const items: any[] = [];
            const cards = document.querySelectorAll(
              '.product-item, .product-item-info, .item.product.product-item'
            );
            for (const card of Array.from(cards)) {
              const nameEl = card.querySelector('.product-item-link, .product-name a');
              const name = nameEl?.textContent?.trim() || '';
              if (name.length < 3) continue;

              const imgEl = card.querySelector('.product-image-photo, img.product-image-photo') as HTMLImageElement | null;
              const image_url = imgEl?.src || '';

              const skuEl = card.querySelector('[data-sku], .sku .value, [itemprop="sku"]');
              const sku = skuEl?.textContent?.trim() || name.slice(0, 40);

              const priceEl = card.querySelector('[data-price-type="finalPrice"] .price');
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

export function getBmrCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'bmr'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'bmr'").get() as any).last;
  return { count, lastSync };
}
