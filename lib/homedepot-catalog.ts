import { createBrowserbaseBrowser } from './browser';
import { getDb } from './db';

// HD internal search API — JSON endpoint, no login required.
// Strategy: trigger one UI search to satisfy Akamai's JavaScript challenge,
// then call the API directly for all subsequent pages/categories.
const HD_SEARCH_BASE = 'https://www.homedepot.ca/api/search/v1/search';
const HD_PAGE_SIZE = 24;

const CATEGORY_QUERIES: Record<string, string> = {
  'Fils et câbles':           'fil electrique',
  'Disjoncteurs et panneaux': 'disjoncteur',
  'Boîtes électriques':       'boite electrique',
  'Interrupteurs et prises':  'interrupteur prise',
  'Éclairage':                'luminaire',
};

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

export async function importHomeDepotCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const categories = db
    .prepare("SELECT * FROM supplier_categories WHERE supplier = 'homedepot' AND enabled = 1 AND company_id = ?")
    .all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const browser = await createBrowserbaseBrowser();

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('homedepot', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name        = excluded.name,
      image_url   = excluded.image_url,
      price       = excluded.price,
      unit        = excluded.unit,
      category    = excluded.category,
      last_synced = CURRENT_TIMESTAMP
  `);

  let totalImported = 0;

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'fr-CA',
      viewport: { width: 1280, height: 900 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
    });

    const page = await context.newPage();

    // Load the homepage to let Akamai run its initial JavaScript challenge
    await page.goto('https://www.homedepot.ca/fr/accueil.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Trigger one real UI search to fully validate the Akamai session.
    // After this, context.request.get() works for direct API calls.
    const firstQuery =
      CATEGORY_QUERIES[categories[0]?.category_name] || Object.values(CATEGORY_QUERIES)[0];

    let firstPageData: any = null;
    const firstApiPromise = new Promise<any>(resolve => {
      const handler = async (response: any) => {
        if (response.url().includes('/api/search/v1/search')) {
          context.off('response', handler);
          try { resolve(await response.json()); } catch { resolve(null); }
        }
      };
      context.on('response', handler);
      setTimeout(() => { context.off('response', handler); resolve(null); }, 15000);
    });

    const searchBox = page
      .locator('input[placeholder*="Recherche"], input[placeholder*="Search"], #headerSearch, input[type="search"]')
      .first();
    await searchBox.fill(firstQuery);
    await searchBox.press('Enter');
    firstPageData = await firstApiPromise;
    await page.waitForTimeout(1000);

    // Helper: call the HD search API directly (cookies are now Akamai-validated)
    async function searchHD(query: string, pageNum: number): Promise<any[] | null> {
      const url = `${HD_SEARCH_BASE}?q=${encodeURIComponent(query)}&page=${pageNum}&pageSize=${HD_PAGE_SIZE}&lang=fr`;
      try {
        const res = await context.request.get(url, {
          headers: {
            Accept: 'application/json',
            Referer: 'https://www.homedepot.ca/recherche',
          },
          timeout: 20000,
        });
        if (!res.ok()) return null;
        const data: any = await res.json();
        return Array.isArray(data.products) ? data.products : null;
      } catch {
        return null;
      }
    }

    function saveProducts(products: any[], categoryName: string) {
      const insertMany = db.transaction((prods: any[]) => {
        for (const p of prods) {
          try {
            const sku = String(p.code || '').slice(0, 40);
            const name = String(p.name || '').trim();
            if (!sku || !name) continue;
            const price = p.pricing?.displayPrice?.value ?? null;
            const imageUrl = p.imageUrl || '';
            upsert.run(sku, name, imageUrl, price, 'units', categoryName);
          } catch { /* skip */ }
        }
      });
      insertMany(products);
    }

    // Process each category
    for (const cat of categories) {
      const query = CATEGORY_QUERIES[cat.category_name] || cat.category_name;
      let categoryTotal = 0;
      let pageNum = 1;

      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        // Use the intercepted data for the very first page of the first category
        const products =
          pageNum === 1 && query === firstQuery && firstPageData?.products
            ? firstPageData.products
            : await searchHD(query, pageNum);

        if (!products || products.length === 0) break;

        saveProducts(products, cat.category_name);
        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (products.length < HD_PAGE_SIZE) break;
        pageNum++;

        // Small delay between pages to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  } finally {
    await browser.close().catch(() => {});
  }
}

export function getHomeDepotCatalogStats() {
  const db = getDb();
  const count = (
    db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'homedepot'").get() as any
  ).count;
  const lastSync = (
    db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'homedepot'").get() as any
  ).last;
  return { count, lastSync };
}
