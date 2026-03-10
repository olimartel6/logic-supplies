import { getDb, recordPriceHistory } from './db';

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

// Nedco is part of Rexel group — same platform as Westburne
// Uses /cnd/search/results JSON endpoint (public, no login needed)

const NEDCO_CATEGORIES = [
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

      const searchStart = Math.max(0, match.index - 3000);
      const block = html.substring(searchStart, match.index + 500);

      const nameMatch = block.match(/alt=\\?"([^"\\]{5,}?)\\?"/);
      let name = nameMatch ? nameMatch[1] : '';
      name = name.replace(/&#034;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');

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

export async function importNedcoCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();
  const cid = companyId ?? null;

  // Auto-create default categories if none exist
  for (const c of NEDCO_CATEGORIES) {
    const exists = db.prepare(
      "SELECT 1 FROM supplier_categories WHERE supplier = 'nedco' AND category_url = ? AND company_id = ? LIMIT 1"
    ).get(c.code, cid);
    if (!exists) {
      db.prepare(
        "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('nedco', ?, ?, 1, ?)"
      ).run(c.name, c.code, cid);
    }
  }

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'nedco' AND enabled = 1 AND company_id = ?"
  ).all(cid) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie Nedco sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('nedco', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
        const url = `https://www.nedco.ca/cnd/search/results?q=:relevance:category:${cat.category_url}&page=${pageNum}`;
        let responseText = '';

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
            console.error(`[Nedco] Error fetching ${cat.category_name} page ${pageNum}: ${err.message}`);
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
              if (p.price) recordPriceHistory(db, 'nedco', p.sku, p.price);
            } catch {}
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (pageNum >= totalPages - 1) break;
        pageNum++;
        await new Promise(r => setTimeout(r, 300));
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
      await new Promise(r => setTimeout(r, 500));
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  }
}

export function getNedcoCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'nedco'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'nedco'").get() as any).last;
  return { count, lastSync };
}
