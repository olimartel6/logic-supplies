import { getDb } from './db';

export interface ImportProgress {
  category: string;
  imported: number;
  total: number;
  done: boolean;
  error?: string;
}

const JSV_PAGE_SIZE = 250;

export async function importJsvCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();

  // JSV is Shopify — products.json is public, no login needed
  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'jsv' AND enabled = 1 AND company_id = ?"
  ).all(companyId ?? null) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie JSV sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('jsv', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  let totalImported = 0;

  try {
    for (const cat of categories) {
      let currentPage = 1;
      let categoryTotal = 0;
      let lastFingerprint = '';

      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (true) {
        const url = `https://groupejsv.com${cat.category_url}/products.json?limit=${JSV_PAGE_SIZE}&page=${currentPage}`;
        let products: any[] = [];
        let fatalError = false;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            const json = await res.json();
            const shopifyProducts: any[] = json.products || [];

            const parsed: any[] = [];
            for (const p of shopifyProducts) {
              const variant = p.variants?.[0];
              const sku = variant?.sku || String(p.id);
              const price = variant?.price ? parseFloat(variant.price) : null;
              const image_url = p.images?.[0]?.src || '';
              const name = p.title || '';
              if (name.length >= 3) {
                parsed.push({ sku, name, image_url, price, unit: 'units' });
              }
            }
            products = parsed;
            break;
          } catch {
            if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
            else fatalError = true;
          }
        }

        if (fatalError || products.length === 0) break;

        const fingerprint = products.slice(0, 3).map(p => p.sku).join('|');
        if (fingerprint === lastFingerprint) break;
        lastFingerprint = fingerprint;

        const insertMany = db.transaction((prods: any[]) => {
          for (const p of prods) {
            try { upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name); } catch {}
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (products.length < JSV_PAGE_SIZE) break;
        currentPage++;
        if (currentPage > 50) break;
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
    }

    return { total: totalImported };
  } catch (err: any) {
    return { total: totalImported, error: err.message };
  }
}

export function getJsvCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'jsv'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'jsv'").get() as any).last;
  return { count, lastSync };
}
