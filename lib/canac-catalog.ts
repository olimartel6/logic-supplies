import { chromium } from 'playwright';
import { getDb } from './db';
import { decrypt } from './encrypt';
import { createCanacPage, loginToCanac } from './canac';

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

// Canac.ca uses SAP Commerce Cloud (Spartacus Angular).
// Pagination uses ?currentPage=N (0-indexed). Do NOT add pageSize= — Canac only
// supports its default page size (~24-48). Stop only when a page returns 0 products.

export async function importCanacCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'canac' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte Canac configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'canac' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const password = decrypt(account.password_encrypted);
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  let totalImported = 0;

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('canac', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name,
      image_url = excluded.image_url,
      price = excluded.price,
      unit = excluded.unit,
      category = excluded.category,
      last_synced = CURRENT_TIMESTAMP
  `);

  try {
    const page = await createCanacPage(browser);

    const loggedIn = await loginToCanac(page, account.username, password);
    if (!loggedIn) {
      return { total: 0, error: 'Login Canac échoué' };
    }

    // Wait for Angular to render product cards, then extract them.
    // Uses waitForSelector so we don't have a fixed timeout if Angular is fast.
    const waitAndExtract = async (): Promise<any[]> => {
      const found = await page.waitForSelector('canac-product-list-item', { timeout: 20000 })
        .then(() => true).catch(() => false);
      if (!found) return [];
      // Give Angular 2s to finish rendering all cards after the first one appears
      await page.waitForTimeout(2000);
      return page.evaluate(() => {
        const items: any[] = [];
        const cards = Array.from(document.querySelectorAll('canac-product-list-item'));
        for (const card of cards) {
          const nameEl = card.querySelector('a.canac-product-list-item__title-heading') as HTMLAnchorElement | null;
          const name = nameEl?.textContent?.trim() || '';
          if (!name || name.length < 3) continue;
          const skuEl = card.querySelector('span.canac-product-list-item__title-info');
          const skuText = skuEl?.textContent?.trim() || '';
          const skuMatch = skuText.match(/\d+/);
          const sku = skuMatch ? skuMatch[0] : name.slice(0, 40);
          const imgEl = card.querySelector('a.cx-product-image-container img') as HTMLImageElement | null;
          const image_url = imgEl?.src || '';
          const priceEl = card.querySelector('.canac-product-list-item__price, .canac-product-price__price-number');
          const priceText = priceEl?.textContent?.trim() || '';
          const priceMatch = priceText.match(/[\d]+[.,][\d]{2}/);
          const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : null;
          items.push({ name, sku, image_url, price, unit: 'units' });
        }
        return items;
      });
    };

    for (const cat of categories) {
      let currentPage = 1; // Canac new URLs use ?page=N (1-indexed)
      let categoryTotal = 0;
      let lastPageFingerprint = ''; // detect when Canac returns the same page twice

      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const sep = cat.category_url.includes('?') ? '&' : '?';
        const url = `https://www.canac.ca${cat.category_url}${sep}page=${currentPage}`;

        let products: any[] = [];
        let fatalError = false;

        // Retry each page up to 2 times before giving up the category
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            products = await waitAndExtract();
            break; // success
          } catch {
            if (attempt === 0) {
              await page.waitForTimeout(3000); // brief pause before retry
            } else {
              fatalError = true;
            }
          }
        }

        if (fatalError) break;
        if (products.length === 0) break; // end of pages for this category

        // Detect duplicate pages: if Canac returns the same content, stop.
        const fingerprint = products.slice(0, 3).map(p => p.sku).join('|');
        if (fingerprint === lastPageFingerprint) break;
        lastPageFingerprint = fingerprint;

        const insertMany = db.transaction((prods: any[]) => {
          for (const p of prods) {
            try { upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name); } catch { /* skip */ }
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        currentPage++;
        if (currentPage >= 50) break; // safety cap (~50 pages max per category)
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

export function getCanacCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'canac'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'canac'").get() as any).last;
  return { count, lastSync };
}
