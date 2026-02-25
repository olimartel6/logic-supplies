import { chromium } from 'playwright';
import { getDb } from './db';
import { decrypt } from './encrypt';

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

export async function importLumenCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'lumen' AND active = 1 AND company_id = ? LIMIT 1"
  ).get(companyId ?? null) as any;
  if (!account) return { total: 0, error: 'Aucun compte Lumen configuré' };

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'lumen' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const password = decrypt(account.password_encrypted);
  const browser = await chromium.launch({ headless: true });
  let totalImported = 0;

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' });

    // Login — same approach as working testLumenConnection
    await page.goto('https://www.lumen.ca/en/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const pwdInput = page.locator('input[type="password"]').first();
    await pwdInput.waitFor({ timeout: 10000 });

    const usernameInput = page.locator('input[name="username"], input[name="email"], input[name="login"]').first();
    if (await usernameInput.count() > 0) {
      await usernameInput.fill(account.username);
    } else {
      await page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])').first().fill(account.username);
    }
    await pwdInput.fill(password);
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await page.waitForTimeout(5000);

    // Verify login
    const loginUrl = page.url();
    if (loginUrl.includes('/login') || loginUrl.includes('/connexion')) {
      return { total: 0, error: `Login échoué — toujours sur: ${loginUrl}` };
    }

    const upsert = db.prepare(`
      INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
      VALUES ('lumen', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(supplier, sku) DO UPDATE SET
        name = excluded.name,
        image_url = excluded.image_url,
        price = excluded.price,
        unit = excluded.unit,
        category = excluded.category,
        last_synced = CURRENT_TIMESTAMP
    `);

    for (const cat of categories) {
      let pageNum = 1;
      let categoryTotal = 0;

      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        try {
          const url = `https://www.lumen.ca${cat.category_url}?page=${pageNum}`;
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);

          // Extract products — try multiple strategies
          const products = await page.evaluate(() => {
            const items: any[] = [];

            // Strategy 1: product links with Sonepar CDN images
            const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'))
              .filter(a => {
                const href = (a as HTMLAnchorElement).href;
                // Only leaf product pages (contain /p- pattern or specific product URL)
                return href.includes('/p-') || href.match(/\/products\/[^/]+\/[^/]+\/[^/]+\/[^/]+$/);
              });

            for (const link of productLinks) {
              const container = link.closest('li, article, [class*="product"], [class*="item"], div') as HTMLElement | null;
              if (!container) continue;

              const name = link.textContent?.trim() || '';
              if (!name || name.length < 3) continue;

              const imgEl = container.querySelector('img') as HTMLImageElement | null;
              const image_url = imgEl?.src || imgEl?.getAttribute('data-src') || '';

              const priceEl = Array.from(container.querySelectorAll('*')).find(el =>
                el.textContent?.includes('$') && el.children.length === 0
              );
              const priceText = priceEl?.textContent?.trim() || '';
              const priceMatch = priceText.match(/\$\s*([\d.,]+)/);
              const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;
              const unit = priceText.toLowerCase().includes('/ m') ? 'm'
                : priceText.toLowerCase().includes('/ pi') ? 'feet' : 'units';

              // SKU: look for short uppercase sibling text
              const siblings = Array.from(container.querySelectorAll('a[href*="/products/"]'));
              const skuLink = siblings.find(s => {
                const t = s.textContent?.trim() || '';
                return t.length < 30 && t === t.toUpperCase() && t !== name;
              });
              const sku = skuLink?.textContent?.trim() || name.slice(0, 30);

              items.push({ name, sku, image_url, price, unit });
            }

            // Strategy 2: fallback — images from Sonepar CDN
            if (items.length === 0) {
              const imgs = Array.from(document.querySelectorAll('img[src*="soneparcanada"], img[src*="PIM_Docs"], img[data-src*="soneparcanada"]'));
              for (const img of imgs) {
                const container = img.closest('div, li, article') as HTMLElement | null;
                if (!container) continue;
                const image_url = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
                const links = Array.from(container.querySelectorAll('a')).filter(a => a.textContent && a.textContent.trim().length > 2);
                if (links.length === 0) continue;
                const name = links[links.length - 1]?.textContent?.trim() || '';
                const sku = links[0]?.textContent?.trim() || name;
                items.push({ name, sku, image_url, price: null, unit: 'units' });
              }
            }

            return items;
          });

          if (products.length === 0) break;

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

          onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

          // Lumen pagination: check for next page link
          const hasNext = await page.locator('a[aria-label="Next"], a:has-text("Next"), .pagination a:last-child').isVisible().catch(() => false);
          if (!hasNext || products.length < 5) break;

          pageNum++;
        } catch (err) {
          break;
        }
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

export function searchProducts(query: string, limit = 8) {
  const db = getDb();
  return db.prepare(`
    SELECT name, sku, image_url, price, unit, category
    FROM products
    WHERE name LIKE ? OR sku LIKE ?
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
  return { count, lastSync };
}
