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

/** Scroll to bottom to trigger lazy-loaded products */
async function loadAllProducts(page: any): Promise<void> {
  try {
    // Scroll down in increments to trigger lazy loading
    let previousHeight = 0;
    for (let i = 0; i < 10; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && i > 0) break;
      previousHeight = currentHeight;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
    }

    // Click "load more" buttons (only buttons, NOT links that could navigate away)
    for (let i = 0; i < 10; i++) {
      const loadMore = page.locator(
        'button:has-text("Load More"), button:has-text("Show More"), button:has-text("Voir plus"), ' +
        'button[class*="load-more"], button[class*="show-more"]'
      ).first();
      if (!(await loadMore.isVisible({ timeout: 500 }).catch(() => false))) break;
      await loadMore.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
  } catch {
    // Non-fatal — continue with whatever products are visible
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

  // Ensure all Lumen categories exist for this company_id
  const ALL_LUMEN_CATEGORIES = [
    { name: 'Fils et câbles',           url: '/en/products/28-wire-cords-cables',                          enabled: 1 },
    { name: 'Disjoncteurs et panneaux', url: '/en/products/20-power-distribution',                         enabled: 1 },
    { name: 'Conduits et chemins',      url: '/en/products/11-conduit-raceway-strut',                      enabled: 1 },
    { name: 'Boîtes et boîtiers',       url: '/en/products/15-enclosures-boxes',                           enabled: 1 },
    { name: 'Éclairage',                url: '/en/products/18-lighting',                                   enabled: 1 },
    { name: 'Prises et interrupteurs',  url: '/en/products/24-wiring-devices-wallplates',                  enabled: 1 },
    { name: 'Automatisation',           url: '/en/products/12-control-automation',                         enabled: 0 },
    { name: 'Outils',                   url: '/en/products/25-tools-instruments',                          enabled: 0 },
    { name: 'Terminaison de fils',      url: '/en/products/27-wire-termination-wire-marking-supplies',     enabled: 0 },
    { name: 'Quincaillerie',            url: '/en/products/16-fasteners-hardwares',                        enabled: 0 },
    { name: 'Sécurité',                 url: '/en/products/22-safety-products',                            enabled: 0 },
    { name: 'Moteurs et sources',       url: '/en/products/21-power-sources-motors',                       enabled: 0 },
    { name: 'Datacom',                  url: '/en/products/13-datacom',                                    enabled: 0 },
    { name: 'Bornes de recharge VÉ',    url: '/en/products/32-ev-charging-stations',                       enabled: 0 },
    { name: 'Chauffage et ventilation', url: '/en/products/17-heat-ventilation',                           enabled: 0 },
    { name: 'Adhésifs et produits',     url: '/en/products/10-adhesives-chemicals-lubricants',             enabled: 0 },
    { name: 'Utilité électrique',       url: '/en/products/14-electric-utility-outside-plant-products',    enabled: 0 },
    { name: 'Liquidation',              url: '/en/products/50-clearance',                                  enabled: 0 },
  ];
  const cid = companyId ?? null;
  for (const c of ALL_LUMEN_CATEGORIES) {
    const exists = db.prepare(
      "SELECT 1 FROM supplier_categories WHERE supplier = 'lumen' AND category_url = ? AND company_id = ? LIMIT 1"
    ).get(c.url, cid);
    if (!exists) {
      db.prepare(
        "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('lumen', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, cid);
      console.error(`[Lumen catalog] Auto-created category: ${c.name} (enabled=${c.enabled}) for company_id=${cid}`);
    }
  }

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'lumen' AND enabled = 1 AND company_id = ?"
  ).all(cid) as any[];
  console.error(`[Lumen catalog] ${categories.length} enabled categories: ${categories.map((c: any) => c.category_name).join(', ')}`);
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  // Report how many categories will be processed
  onProgress?.({ category: `${categories.length} catégories à traiter`, imported: 0, total: 0, done: false });

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
