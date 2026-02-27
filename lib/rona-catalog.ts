import { createBrowserbaseBrowser } from './browser';
import { getDb } from './db';
import { decrypt } from './encrypt';

import type { ImportProgress } from './westburne-catalog';
export type { ImportProgress };

export async function importRonaCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'rona' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte Rona configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'rona' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const password = decrypt(account.password_encrypted);

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('rona', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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

    // Login — Rona is a React SPA; networkidle needed to render form fields
    await page.goto('https://www.rona.ca/fr/connexion', {
      waitUntil: 'networkidle', timeout: 45000,
    }).catch(() => page.goto('https://www.rona.ca/fr/connexion', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    }));
    await page.waitForTimeout(4000);

    // Dismiss OneTrust cookie banner
    const cookieBtn = page.locator([
      '#onetrust-accept-btn-handler',
      'button:has-text("Accepter tout")',
      'button:has-text("Accept All")',
      'button:has-text("Tout accepter")',
      'button:has-text("J\'accepte")',
    ].join(', ')).first();
    if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(1000);
    }

    // Log page state for debugging
    const pageUrl = page.url();
    const pageTitle = await page.title().catch(() => '?');
    const inputCount = await page.locator('input:not([type="hidden"])').count().catch(() => -1);
    console.error(`[Rona catalog] login page: url=${pageUrl} title="${pageTitle}" visible-inputs=${inputCount}`);

    const emailField = page.locator([
      'input[name="email"]',
      'input[id="email"]',
      'input[autocomplete="email"]',
      'input[type="email"]',
      'input[name="logonId"]',
      'input[id*="logon"]',
      'input[placeholder*="courriel"]',
      'input[placeholder*="email"]',
      'input[type="text"]',
    ].join(', ')).first();
    await emailField.waitFor({ timeout: 20000 });
    await emailField.fill(account.username);
    await page.waitForTimeout(300);

    const passwordField = page.locator([
      'input[name="password"]',
      'input[id="password"]',
      'input[type="password"]',
    ].join(', ')).first();
    await passwordField.waitFor({ timeout: 10000 });
    await passwordField.fill(password);
    await page.waitForTimeout(300);

    await passwordField.press('Enter');
    await page.waitForFunction(
      () => !window.location.pathname.includes('/connexion') && !window.location.pathname.includes('/login'),
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(1500);

    if (!page.url().includes('rona.ca') || page.url().includes('/connexion') || page.url().includes('/login')) {
      return { total: 0, error: 'Login Rona échoué' };
    }

    for (const cat of categories) {
      let pageNum = 1;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://www.rona.ca${cat.category_url}?page=${pageNum}`;
        let products: any[] = [];

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          products = await page.evaluate(() => {
            const items: any[] = [];
            const cards = document.querySelectorAll(
              'article[class*="product"], .product-card, [class*="product-tile"]'
            );
            for (const card of Array.from(cards)) {
              const nameEl = card.querySelector('a[class*="product-name"], .product-name');
              const name = nameEl?.textContent?.trim() || '';
              if (name.length < 3) continue;

              const imgEl = card.querySelector('img[class*="product"], .product-image img') as HTMLImageElement | null;
              const image_url = imgEl?.src || '';

              const skuEl = card.querySelector('[class*="sku"], [data-sku]');
              const sku = skuEl?.textContent?.trim() || name.slice(0, 40);

              const priceEl = card.querySelector('[class*="price"]:not([class*="old"])');
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

export function getRonaCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'rona'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'rona'").get() as any).last;
  return { count, lastSync };
}
