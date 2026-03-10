import { getDb, recordPriceHistory } from './db';

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

// Westburne public search API — no login needed
// Uses /cwr/search/results JSON endpoint with embedded productListerHtml

const WESTBURNE_CATEGORIES = [
  { code: 'CT010', name: 'Boîtes & Enceintes' },
  { code: 'CT020', name: 'Conduit & Raccords' },
  { code: 'CT030', name: 'Connecteurs & Bornes' },
  { code: 'CT050', name: 'Distribution' },
  { code: 'CT060', name: 'Attaches & Supports' },
  { code: 'CT070', name: 'Fusibles' },
  { code: 'CT080', name: 'Chauffage & Ventilation' },
  { code: 'CT100', name: 'Lampes & Ballasts' },
  { code: 'CT110', name: 'Éclairage' },
  { code: 'CT120', name: 'Contrôle moteur' },
  { code: 'CT140', name: 'Outils & Équipement' },
  { code: 'CT160', name: 'Fils & Câbles' },
  { code: 'CT170', name: 'Dispositifs de câblage' },
];

// Max pages per category to keep import time reasonable
// 10 products/page × 50 pages = ~500 products per category
const MAX_PAGES_PER_CATEGORY = 50;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface ParsedProduct {
  sku: string;
  name: string;
  image_url: string;
  price: number | null;
  unit: string;
}

function parseSearchResultsJson(jsonStr: string): { products: ParsedProduct[]; totalPages: number } {
  const products: ParsedProduct[] = [];

  try {
    const data = JSON.parse(jsonStr);
    const totalPages = parseInt(data.pagination?.numberOfPages || '0', 10);
    const html: string = data.productListerHtml || '';

    if (!html) return { products, totalPages };

    // Extract products by finding /p/SKU pattern in URLs
    const skuRegex = /\/p\/([A-Z0-9\/_-]+)\?prevPageNumber/g;
    const seenSkus = new Set<string>();
    let match;

    while ((match = skuRegex.exec(html)) !== null) {
      const sku = match[1];
      if (seenSkus.has(sku)) continue;
      seenSkus.add(sku);

      // Search backwards from URL for product info
      const searchStart = Math.max(0, match.index - 3000);
      const block = html.substring(searchStart, match.index + 500);

      // Extract name from alt= or title= attribute
      const nameMatch = block.match(/alt=\\?"([^"\\]{5,}?)\\?"/);
      let name = nameMatch ? nameMatch[1] : '';
      name = name.replace(/&#034;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');

      // Extract image URL from rexel-cdn
      const imgMatch = block.match(/(https:\/\/rexel-cdn\.com\/Products\/Product\.jpg\?i=[^"\\&]+&f=[^"\\]+)/);
      const image_url = imgMatch ? imgMatch[1].replace(/\\"/g, '') : '';

      if (name.length >= 3 && !name.includes('SilentPromo') && !name.includes('_Promo_')) {
        products.push({ sku, name, image_url, price: null, unit: 'unité' });
      }
    }

    return { products, totalPages };
  } catch {
    return { products, totalPages: 0 };
  }
}

export async function importWestburneCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();
  const cid = companyId ?? null;

  // Auto-create default categories if none exist
  for (const c of WESTBURNE_CATEGORIES) {
    const exists = db.prepare(
      "SELECT 1 FROM supplier_categories WHERE supplier = 'westburne' AND category_url = ? AND company_id = ? LIMIT 1"
    ).get(c.code, cid);
    if (!exists) {
      db.prepare(
        "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('westburne', ?, ?, 1, ?)"
      ).run(c.name, c.code, cid);
    }
  }

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'westburne' AND enabled = 1 AND company_id = ?"
  ).all(cid) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie Westburne sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('westburne', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  let totalImported = 0;

  try {
    for (const cat of categories) {
      let pageNum = 0;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (pageNum < MAX_PAGES_PER_CATEGORY) {
        const url = `https://www.westburne.ca/cwr/search/results?q=:relevance:category:${cat.category_url}&page=${pageNum}`;
        let responseText = '';

        // Fetch with retries
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(url, {
              headers: {
                'Accept': 'application/json, text/html',
                'User-Agent': USER_AGENT,
                'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8',
              },
            });
            if (res.status === 429) {
              console.error(`[Westburne] Rate limited on ${cat.category_name} page ${pageNum}, waiting ${(attempt + 1) * 5}s...`);
              await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
              continue;
            }
            if (!res.ok) {
              if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); continue; }
              break;
            }
            responseText = await res.text();
            break;
          } catch (err: any) {
            console.error(`[Westburne] Error fetching ${cat.category_name} page ${pageNum}: ${err.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
          }
        }

        if (!responseText) break;

        const { products, totalPages } = parseSearchResultsJson(responseText);
        if (products.length === 0) break;

        const insertMany = db.transaction((prods: ParsedProduct[]) => {
          for (const p of prods) {
            try {
              upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name);
              if (p.price) recordPriceHistory(db, 'westburne', p.sku, p.price);
            } catch {}
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        // Stop if we've processed all available pages
        if (pageNum >= totalPages - 1) break;

        pageNum++;
        // Delay between pages to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
      // Delay between categories
      await new Promise(r => setTimeout(r, 500));
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  }
}

export function getWestburneCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'westburne'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'westburne'").get() as any).last;
  return { count, lastSync };
}
