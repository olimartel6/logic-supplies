import { getDb, recordPriceHistory } from './db';

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

  // Auto-create default categories if none exist for this company
  const ALL_JSV_CATEGORIES = [
    { name: 'Câbles électriques',    url: '/collections/cables-electriques',                  enabled: 1 },
    { name: 'Câbles',                url: '/collections/cables',                              enabled: 1 },
    { name: 'Attaches nylon',        url: '/collections/attaches-nylon',                      enabled: 1 },
    { name: 'Ampoules',              url: '/collections/ampoules',                            enabled: 1 },
    { name: 'Lampes de poche',       url: '/collections/lampes-de-poche',                     enabled: 0 },
    { name: 'Rallonges électriques', url: '/collections/devidoirs-et-rallonges-electriques',  enabled: 1 },
    { name: 'Câbles à survoltage',   url: '/collections/cables-a-survoltage',                 enabled: 1 },
    { name: 'Ruban électrique',      url: '/collections/rubans-electriques',                  enabled: 1 },
  ];
  const cid = companyId ?? null;
  for (const c of ALL_JSV_CATEGORIES) {
    const exists = db.prepare(
      "SELECT 1 FROM supplier_categories WHERE supplier = 'jsv' AND category_url = ? AND company_id = ? LIMIT 1"
    ).get(c.url, cid);
    if (!exists) {
      db.prepare(
        "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('jsv', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, cid);
    }
  }

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'jsv' AND enabled = 1 AND company_id = ?"
  ).all(cid) as any[];
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

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } });
            if (res.status === 429) {
              console.error(`[JSV] Rate limited on ${cat.category_name} page ${currentPage}, waiting ${(attempt + 1) * 5}s...`);
              await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
              continue;
            }
            if (!res.ok) {
              console.error(`[JSV] HTTP ${res.status} on ${url}`);
              if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); continue; }
              fatalError = true;
              break;
            }
            const text = await res.text();
            if (text.startsWith('<')) {
              console.error(`[JSV] Got HTML instead of JSON on ${cat.category_name} page ${currentPage}, retrying...`);
              await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
              continue;
            }
            const json = JSON.parse(text);
            const shopifyProducts: any[] = json.products || [];

            const parsed: any[] = [];
            for (const p of shopifyProducts) {
              const variant = p.variants?.[0];
              const sku = variant?.sku || String(p.id);
              const rawPrice = variant?.price ? parseFloat(variant.price) : null;
              const price = (rawPrice && rawPrice > 0) ? rawPrice : null;
              const image_url = p.images?.[0]?.src || p.image?.src || '';
              const name = p.title || '';
              if (name.length >= 3) {
                parsed.push({ sku, name, image_url, price, unit: 'units' });
              }
            }
            products = parsed;
            break;
          } catch (err: any) {
            console.error(`[JSV] Error on ${cat.category_name} page ${currentPage}: ${err.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
            else fatalError = true;
          }
        }

        if (fatalError || products.length === 0) break;

        const fingerprint = products.slice(0, 3).map(p => p.sku).join('|');
        if (fingerprint === lastFingerprint) break;
        lastFingerprint = fingerprint;

        const insertMany = db.transaction((prods: any[]) => {
          for (const p of prods) {
            try {
              upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name);
              if (p.price) recordPriceHistory(db, 'jsv', p.sku, p.price);
            } catch {}
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        if (products.length < JSV_PAGE_SIZE) break;
        currentPage++;
        if (currentPage > 50) break;
        // Delay between pages to avoid Shopify rate limiting
        await new Promise(r => setTimeout(r, 1500));
      }

      onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: true });
      // Delay between categories to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
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
