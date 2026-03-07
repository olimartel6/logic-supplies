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

/**
 * Lumen category pages are deeply nested navigation trees.
 * Top-level URLs (/en/products/28-wire-cords-cables) only show subcategory links.
 * Products only appear on the deepest leaf pages (with /p- in their URL).
 *
 * This function recursively discovers all leaf subcategory URLs from a given
 * category page, then scrapes products from each leaf page.
 */
async function discoverLeafCategories(page: any, categoryUrl: string): Promise<string[]> {
  await page.goto(`https://www.lumen.ca${categoryUrl}`, {
    waitUntil: 'networkidle', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  // Check if this page has actual products (links with /p-)
  const hasProducts = await page.evaluate(() => {
    return document.querySelectorAll('a[href*="/p-"]').length > 0;
  });

  if (hasProducts) {
    // This is a leaf page with products
    return [categoryUrl];
  }

  // No products — find subcategory links on this page
  const subcategoryUrls: string[] = await page.evaluate((parentUrl: string) => {
    const links = Array.from(document.querySelectorAll(`a[href*="${parentUrl}/"]`));
    const urls = new Set<string>();
    for (const link of links) {
      const href = (link as HTMLAnchorElement).pathname;
      // Only direct children (one level deeper)
      if (href.startsWith(parentUrl + '/') && href !== parentUrl) {
        urls.add(href);
      }
    }
    return Array.from(urls);
  }, categoryUrl);

  if (subcategoryUrls.length === 0) {
    return []; // Dead end — no products, no subcategories
  }

  // Recursively discover leaf categories from subcategories
  const leafCategories: string[] = [];
  for (const subUrl of subcategoryUrls) {
    const leaves = await discoverLeafCategories(page, subUrl);
    leafCategories.push(...leaves);
  }
  return leafCategories;
}

/** Scroll to bottom to trigger lazy-loaded products, click "load more" if present */
async function loadAllProducts(page: any): Promise<void> {
  // Scroll down in increments to trigger lazy loading
  let previousHeight = 0;
  for (let i = 0; i < 20; i++) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight && i > 0) break;
    previousHeight = currentHeight;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }

  // Click "load more" / "show more" / pagination buttons repeatedly
  for (let i = 0; i < 30; i++) {
    const loadMore = page.locator(
      'button:has-text("Load More"), button:has-text("Show More"), button:has-text("Voir plus"), ' +
      'a:has-text("Load More"), a:has-text("Show More"), a:has-text("Voir plus"), ' +
      '[class*="load-more"], [class*="show-more"], [class*="loadMore"], ' +
      'a[rel="next"], a:has-text("Next"), a:has-text("Suivant")'
    ).first();
    if (!(await loadMore.isVisible({ timeout: 1000 }).catch(() => false))) break;
    await loadMore.click().catch(() => {});
    await page.waitForTimeout(2000);
    // Scroll again after loading more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }
}

/** Extract products from a leaf category page */
async function extractProducts(page: any): Promise<any[]> {
  return page.evaluate(() => {
    const items: any[] = [];
    const seen = new Set<string>();

    // Find product containers — each product card has an image, SKU link, and name link
    const productLinks = Array.from(document.querySelectorAll('a[href*="/p-"]'));

    for (const link of productLinks) {
      const container = (link as HTMLElement).closest('li, article, [class*="product"], [class*="item"], div') as HTMLElement | null;
      if (!container) continue;

      const name = link.textContent?.trim() || '';
      if (!name || name.length < 3) continue;

      // Deduplicate by name
      if (seen.has(name)) continue;
      seen.add(name);

      const imgEl = container.querySelector('img') as HTMLImageElement | null;
      const image_url = imgEl?.src || imgEl?.getAttribute('data-src') || '';

      // Price
      const priceEl = Array.from(container.querySelectorAll('*')).find(el =>
        el.textContent?.includes('$') && el.children.length === 0
      );
      const priceText = priceEl?.textContent?.trim() || '';
      const priceMatch = priceText.match(/\$\s*([\d.,]+)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;
      const unit = priceText.toLowerCase().includes('/ m') ? 'm'
        : priceText.toLowerCase().includes('/ pi') ? 'feet' : 'units';

      // SKU: look for short uppercase text in sibling product links
      const siblings = Array.from(container.querySelectorAll('a[href*="/p-"]'));
      const skuLink = siblings.find(s => {
        const t = s.textContent?.trim() || '';
        return t.length > 3 && t.length < 30 && t === t.toUpperCase() && t !== name;
      });
      const sku = skuLink?.textContent?.trim() || name.slice(0, 30);

      items.push({ name, sku, image_url, price, unit });
    }

    return items;
  });
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
  const browser = await createBrowserbaseBrowser();
  let totalImported = 0;

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' });

    // Login
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
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      try {
        // Discover all leaf subcategories that actually contain products
        console.error(`[Lumen catalog] Discovering subcategories for: ${cat.category_name}`);
        const leafUrls = await discoverLeafCategories(page, cat.category_url);
        console.error(`[Lumen catalog] Found ${leafUrls.length} leaf categories`);

        for (const leafUrl of leafUrls) {
          try {
            await page.goto(`https://www.lumen.ca${leafUrl}`, {
              waitUntil: 'networkidle', timeout: 30000,
            });
            await page.waitForTimeout(2000);

            // Scroll and click "load more" to reveal all products
            await loadAllProducts(page);

            const products = await extractProducts(page);
            if (products.length === 0) continue;

            const insertMany = db.transaction((prods: any[]) => {
              for (const p of prods) {
                try { upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name); } catch {}
              }
            });
            insertMany(products);

            categoryTotal += products.length;
            totalImported += products.length;
            onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

            console.error(`[Lumen catalog] ${leafUrl}: ${products.length} products`);
          } catch (leafErr: any) {
            console.error(`[Lumen catalog] Failed leaf ${leafUrl}: ${leafErr.message}`);
          }
        }
      } catch (err: any) {
        console.error(`[Lumen catalog] Error crawling ${cat.category_name}: ${err.message}`);
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
