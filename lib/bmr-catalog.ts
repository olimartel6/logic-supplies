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

  const browser = await createBrowserbaseBrowser({ proxies: true });
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
      waitUntil: 'networkidle', timeout: 40000,
    }).catch(() => page.goto('https://www.bmr.ca/fr/customer/account/login/', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    }));
    await page.waitForTimeout(3000);

    // BMR uses Axeptio for cookie consent
    const cookieBtn = page.locator([
      '#axeptio_btn_acceptAll',
      '.axeptio-btn-accept',
      'button:has-text("D\'accord")',
      'button:has-text("Tout accepter")',
      'button:has-text("Accepter tout")',
    ].join(', ')).first();
    if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(1000);
    }

    const emailField = page.locator('input#email, input[name="login[username]"], input[type="email"]').first();
    await emailField.waitFor({ timeout: 15000 });
    await emailField.click();
    await emailField.type(account.username, { delay: 80 });
    await page.waitForTimeout(400);

    const passwordField = page.locator('input#pass, input[name="login[password]"], input[type="password"]').first();
    await passwordField.waitFor({ timeout: 10000 });
    await passwordField.click();
    await passwordField.type(password, { delay: 80 });
    await page.waitForTimeout(600);

    const submitBtn = page.locator('button#send2, button[type="submit"].action.login, button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await passwordField.press('Enter');
    }

    await page.waitForFunction(
      () => !window.location.pathname.includes('/login'), { timeout: 30000 }
    ).catch(() => {});
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const pageTitle = await page.title().catch(() => '');
    const errorMsg = await page.locator('.message-error, .error-msg, [data-ui-id="message-error"]').first().textContent({ timeout: 2000 }).catch(() => '');

    if (finalUrl.includes('/login')) {
      return { total: 0, error: `Login BMR échoué — URL: ${finalUrl} | Titre: ${pageTitle}${errorMsg ? ` | Erreur: ${errorMsg.trim()}` : ''}` };
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
