import { getDb } from './db';

import type { ImportProgress } from './westburne-catalog';
export type { ImportProgress };

// BMR uses Algolia for product search — public API, no login needed
// Application ID and search-only API key are embedded in every BMR page
// Products include name, SKU, price, images, stock status

const ALGOLIA_APP_ID = 'DE7LVWVQ9D';
const ALGOLIA_INDEX = 'bmr_magento2_fr_products';

const BMR_CATEGORIES = [
  { query: 'disjoncteur', name: 'Disjoncteurs' },
  { query: 'fusible electrique', name: 'Fusibles' },
  { query: 'fil electrique nmw', name: 'Fils & Câbles' },
  { query: 'luminaire led', name: 'Luminaires' },
  { query: 'ampoule led', name: 'Ampoules' },
  { query: 'prise electrique', name: 'Prises' },
  { query: 'interrupteur electrique', name: 'Interrupteurs' },
  { query: 'boite electrique', name: 'Boîtes électriques' },
  { query: 'conduit electrique', name: 'Conduits' },
  { query: 'panneau electrique', name: 'Panneaux' },
  { query: 'plinthe chauffante', name: 'Plinthes chauffantes' },
  { query: 'thermostat', name: 'Thermostats' },
  { query: 'ventilateur', name: 'Ventilateurs' },
];

const MAX_PAGES_PER_QUERY = 20; // Algolia max 1000 hits (20 pages × 50)
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface AlgoliaHit {
  name?: string;
  sku?: string;
  image_url?: string;
  thumbnail_url?: string;
  price?: { CAD?: { default?: number; default_formated?: string } };
  in_stock?: number;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
  nbHits: number;
  nbPages: number;
  page: number;
}

async function getAlgoliaApiKey(): Promise<string> {
  const res = await fetch('https://www.bmr.ca/fr/', {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
  });
  if (!res.ok) throw new Error(`BMR homepage returned ${res.status}`);
  const html = await res.text();

  // Extract the Algolia API key from window.algoliaConfig
  const match = html.match(/"apiKey"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error('Cannot extract Algolia API key from BMR page');
  return match[1];
}

async function searchAlgolia(apiKey: string, query: string, page: number): Promise<AlgoliaResponse> {
  const res = await fetch(`https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, page, hitsPerPage: 50 }),
  });
  if (!res.ok) throw new Error(`Algolia search failed: ${res.status}`);
  return res.json();
}

export async function importBmrCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();
  const cid = companyId ?? null;

  // Auto-create default categories if none exist
  for (const c of BMR_CATEGORIES) {
    const exists = db.prepare(
      "SELECT 1 FROM supplier_categories WHERE supplier = 'bmr' AND category_url = ? AND company_id = ? LIMIT 1"
    ).get(c.query, cid);
    if (!exists) {
      db.prepare(
        "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('bmr', ?, ?, 1, ?)"
      ).run(c.name, c.query, cid);
    }
  }

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'bmr' AND enabled = 1 AND company_id = ?"
  ).all(cid) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie BMR sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('bmr', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  let totalImported = 0;

  try {
    const apiKey = await getAlgoliaApiKey();

    for (const cat of categories) {
      let pageNum = 0;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (pageNum < MAX_PAGES_PER_QUERY) {
        let result: AlgoliaResponse;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await searchAlgolia(apiKey, cat.category_url, pageNum);
            break;
          } catch (err: any) {
            console.error(`[BMR] Error searching ${cat.category_name} page ${pageNum}: ${err.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
            else throw err;
          }
        }

        if (!result!.hits || result!.hits.length === 0) break;

        const insertMany = db.transaction((hits: AlgoliaHit[]) => {
          for (const hit of hits) {
            const sku = hit.sku || '';
            const name = hit.name || '';
            if (!sku || name.length < 3) continue;

            const image_url = hit.image_url || hit.thumbnail_url || '';
            const price = hit.price?.CAD?.default ?? null;

            try { upsert.run(sku, name, image_url, price, 'unité', cat.category_name); } catch {}
          }
        });
        insertMany(result!.hits);

        const validHits = result!.hits.filter(h => h.sku && (h.name || '').length >= 3);
        categoryTotal += validHits.length;
        totalImported += validHits.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (pageNum >= result!.nbPages - 1) break;
        pageNum++;
        await new Promise(r => setTimeout(r, 200));
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
      await new Promise(r => setTimeout(r, 300));
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  }
}

export function getBmrCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'bmr'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'bmr'").get() as any).last;
  return { count, lastSync };
}
