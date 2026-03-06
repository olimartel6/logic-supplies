import { getDb } from './db';

import type { ImportProgress } from './westburne-catalog';
export type { ImportProgress };

// Rona uses Constructor.io for product search/browse
const CNSTRC_KEY = 'key_DezNd1p5HBzjHuxk';
const CNSTRC_BASE = 'https://ac.cnstrc.com';

// Map category names to Constructor.io group_ids via autocomplete
async function findGroupId(categoryName: string): Promise<string | null> {
  const resp = await fetch(
    `${CNSTRC_BASE}/autocomplete/${encodeURIComponent(categoryName)}?key=${CNSTRC_KEY}&num_results=3`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  const suggestions = data.sections?.['Search Suggestions'] || [];
  for (const s of suggestions) {
    const groups = s.data?.groups || [];
    if (groups.length > 0) return groups[0].group_id;
  }
  return null;
}

export async function importRonaCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'rona' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('rona', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  let totalImported = 0;

  try {
    for (const cat of categories) {
      // Find Constructor.io group_id for this category
      const groupId = await findGroupId(cat.category_name);
      console.error(`[Rona catalog] Category "${cat.category_name}" → group_id: ${groupId || 'not found'}`);

      let pageNum = 1;
      let categoryTotal = 0;
      let totalResults = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        let results: any[] = [];

        try {
          if (groupId) {
            // Browse by category group_id
            const resp = await fetch(
              `${CNSTRC_BASE}/browse/group_id/${groupId}?key=${CNSTRC_KEY}&page=${pageNum}&num_results_per_page=100&section=Products`,
              { headers: { 'Accept': 'application/json' } }
            );
            if (!resp.ok) break;
            const data = await resp.json();
            results = data.response?.results || [];
            totalResults = data.response?.total_num_results || 0;
          } else {
            // Fallback: search by category name
            const resp = await fetch(
              `${CNSTRC_BASE}/search/${encodeURIComponent(cat.category_name)}?key=${CNSTRC_KEY}&page=${pageNum}&num_results_per_page=100&section=Products`,
              { headers: { 'Accept': 'application/json' } }
            );
            if (!resp.ok) break;
            const data = await resp.json();
            results = data.response?.results || [];
            totalResults = data.response?.total_num_results || 0;
          }
        } catch {
          break;
        }

        if (results.length === 0) break;

        const insertMany = db.transaction((items: any[]) => {
          for (const r of items) {
            const sku = r.data?.item_number || r.data?.id || '';
            const name = r.value || '';
            const image_url = r.data?.image_url || '';
            if (!sku || name.length < 3) continue;
            try { upsert.run(sku, name, image_url, null, 'unité', cat.category_name); } catch {}
          }
        });
        insertMany(results);

        categoryTotal += results.length;
        totalImported += results.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: totalResults, done: false });

        if (results.length < 100) break;
        pageNum++;
        if (pageNum > 50) break;
      }

      console.error(`[Rona catalog] "${cat.category_name}": ${categoryTotal} products imported`);
      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
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
