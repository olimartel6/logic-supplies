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
    const page = await context.newPage();

    // Dismiss cookie banner once on homepage before scraping
    await page.goto('https://www.bmr.ca/fr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const cookieBtn = page.locator([
      '#axeptio_btn_acceptAll',
      '.axeptio-btn-accept',
      'button:has-text("D\'accord")',
      'button:has-text("Tout accepter")',
    ].join(', ')).first();
    if (await cookieBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(800);
    }

    for (const cat of categories) {
      let pageNum = 1;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://www.bmr.ca${cat.category_url}?p=${pageNum}`;
        let products: any[] = [];

        try {
          // networkidle ensures Algolia's API calls finish before we scrape
          await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 }).catch(() =>
            page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          );
          await page.waitForTimeout(1000);

          // Debug: dump page structure so we can fix selectors
          const debug = await page.evaluate(() => ({
            url: window.location.href,
            title: document.title,
            counts: {
              'li.item.product': document.querySelectorAll('li.item.product').length,
              '.product-item-info': document.querySelectorAll('.product-item-info').length,
              '.link-product': document.querySelectorAll('.link-product').length,
              '.ais-hits--item': document.querySelectorAll('.ais-hits--item').length,
              '[class*="ais-"]': document.querySelectorAll('[class*="ais-"]').length,
              '#instant-search-results-container *': document.querySelectorAll('#instant-search-results-container *').length,
            },
            firstProductHTML: (
              document.querySelector('li.item.product, .product-item-info, .link-product, [class*="ais-hits"]')
            )?.outerHTML?.slice(0, 800) || 'NONE',
            bodySnippet: document.body.innerHTML.slice(0, 500),
          }));
          console.error('[BMR DEBUG]', JSON.stringify(debug));

          products = await page.evaluate(() => {
            const items: any[] = [];
            const cards = document.querySelectorAll(
              'li.item.product, .product-item-info, .link-product'
            );
            for (const card of Array.from(cards)) {
              const nameEl = card.querySelector(
                '.product-item-name a, .product-item-link, .product-name a, h2 a, h3 a'
              );
              const name = nameEl?.textContent?.trim() || '';
              if (name.length < 3) continue;

              const imgEl = card.querySelector('img.product-image-photo, img') as HTMLImageElement | null;
              const image_url = imgEl?.src || '';

              // BMR stores SKU as data-product-sku on the add-to-cart form
              const formEl = card.querySelector('form[data-product-sku]');
              const sku = formEl?.getAttribute('data-product-sku')
                || card.querySelector('[data-sku], .sku .value, [itemprop="sku"]')?.textContent?.trim()
                || name.slice(0, 40);

              const priceEl = card.querySelector(
                '[data-price-type="finalPrice"] .price, .price-box .price, .price-wrapper .price'
              );
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
