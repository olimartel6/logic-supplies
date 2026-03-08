import { getDb } from './db';

import type { ImportProgress } from './westburne-catalog';
export type { ImportProgress };

// Rona uses Constructor.io for product search — public API key, no login needed
// Browse by category or search by query
// Products include name, SKU, brand, image, description, UPC
// Prices NOT available via this API

const CONSTRUCTOR_BASE = 'https://tvbajuset-zone.cnstrc.com';
const CONSTRUCTOR_KEY_FR = 'key_DezNd1p5HBzjHuxk';

const RONA_CATEGORIES = [
  { groupId: '01-140-030', name: 'Connecteurs & Attaches' },
  { groupId: '01-140-060', name: 'Fils & Câbles' },
  { groupId: '01-140-010', name: 'Boîtes & Couvercles' },
  { groupId: '01-140-020', name: 'Conduits & Raccords' },
  { groupId: '01-140-040', name: 'Disjoncteurs & Fusibles' },
  { groupId: '01-140-050', name: 'Distribution' },
  { groupId: '01-140-070', name: 'Prises & Interrupteurs' },
  { groupId: '01-140-080', name: 'Éclairage' },
  { groupId: '01-140-090', name: 'Chauffage électrique' },
];

const RESULTS_PER_PAGE = 50;
const MAX_PAGES = 20;

interface ConstructorHit {
  data?: {
    id?: string;
    item_number?: string;
    image_url?: string;
    brand?: string;
    barcode?: string;
  };
  value?: string;
}

interface ConstructorResponse {
  response?: {
    results?: ConstructorHit[];
    total_num_results?: number;
  };
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export async function importRonaCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();
  const cid = companyId ?? null;

  // Auto-create default categories if none exist
  for (const c of RONA_CATEGORIES) {
    const exists = db.prepare(
      "SELECT 1 FROM supplier_categories WHERE supplier = 'rona' AND category_url = ? AND company_id = ? LIMIT 1"
    ).get(c.groupId, cid);
    if (!exists) {
      db.prepare(
        "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('rona', ?, ?, 1, ?)"
      ).run(c.name, c.groupId, cid);
    }
  }

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'rona' AND enabled = 1 AND company_id = ?"
  ).all(cid) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie Rona sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('rona', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  const clientId = generateId();
  const sessionId = generateId();
  let totalImported = 0;

  try {
    for (const cat of categories) {
      let page = 1;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (page <= MAX_PAGES) {
        const url = `${CONSTRUCTOR_BASE}/browse/group_id/${cat.category_url}?key=${CONSTRUCTOR_KEY_FR}&i=${clientId}&s=${sessionId}&page=${page}&num_results_per_page=${RESULTS_PER_PAGE}&section=Products`;
        let data: ConstructorResponse | null = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(url, {
              headers: { 'Accept': 'application/json' },
            });
            if (res.status === 429) {
              await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
              continue;
            }
            if (!res.ok) {
              if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); continue; }
              break;
            }
            data = await res.json();
            break;
          } catch (err: any) {
            console.error(`[Rona] Error fetching ${cat.category_name} page ${page}: ${err.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
          }
        }

        const results = data?.response?.results || [];
        if (results.length === 0) break;
        const totalResults = data?.response?.total_num_results || 0;

        const insertMany = db.transaction((hits: ConstructorHit[]) => {
          for (const hit of hits) {
            const sku = hit.data?.item_number || hit.data?.id || '';
            const name = hit.value || '';
            if (!sku || name.length < 3) continue;

            const image_url = hit.data?.image_url || '';

            try { upsert.run(sku, name, image_url, null, 'unité', cat.category_name); } catch {}
          }
        });
        insertMany(results);

        const validHits = results.filter(h => (h.data?.item_number || h.data?.id) && (h.value || '').length >= 3);
        categoryTotal += validHits.length;
        totalImported += validHits.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: totalResults, done: false });

        if (page * RESULTS_PER_PAGE >= totalResults) break;
        page++;
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

export function getRonaCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'rona'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'rona'").get() as any).last;
  return { count, lastSync };
}
