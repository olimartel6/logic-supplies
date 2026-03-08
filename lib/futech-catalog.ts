import { getDb } from './db';

import type { ImportProgress } from './westburne-catalog';
export type { ImportProgress };

// Futech shop.futech.ca — public catalog (no login needed for product listing)
// Prices require login but SKU/name/stock are public
// Uses server-rendered HTML at /fr/Catalog/Index/{CategoryCode}?page=N

const FUTECH_CATEGORIES = [
  // Distribution Électrique
  { code: 'DisElec_Dis_Mini', name: 'Disjoncteurs miniatures' },
  { code: 'DisElec_Dis_Resi', name: 'Disjoncteurs résidentiels' },
  { code: 'DisElec_Fus_Temp', name: 'Fusibles temporisés' },
  { code: 'DisElec_Fus_UL', name: 'Fusibles UL' },
  { code: 'DisElec_IntSec_Fus', name: 'Interrupteurs sécurité' },
  { code: 'DisElec_PanRes_DisPrinc', name: 'Panneaux résidentiels' },
  { code: 'DisElec_Xfo_Controle', name: 'Transformateurs contrôle' },
  // Accessoires de Câblage
  { code: 'AccCab_Int', name: 'Interrupteurs' },
  { code: 'AccCab_Rec', name: 'Réceptacles' },
  { code: 'AccCab_PlaCou', name: 'Plaques couvercles' },
  { code: 'AccCab_Gra', name: 'Gradateurs' },
  { code: 'AccCab_DetPre', name: 'Détecteurs présence' },
  // Éclairage
  { code: 'EclAcc_Lampe_AmpDEL', name: 'Ampoules DEL' },
  { code: 'EclAcc_Lumina_Encastre', name: 'Encastrés' },
  { code: 'EclAcc_Lumina_Urg', name: 'Éclairage urgence' },
  // Automatisation & Contrôle
  { code: 'AutCon_ContDem_Con', name: 'Contacteurs' },
  { code: 'AutCon_VarVit_VarVitCA', name: 'Variateurs CA' },
  { code: 'AutCon_ContDem_RelSur', name: 'Relais de surcharge' },
  // Chauffage
  { code: 'ChaCli_ChaEle_Plinthes', name: 'Plinthes' },
  { code: 'ChaCli_ConThe_ThePro', name: 'Thermostats programmables' },
  // Boîtiers
  { code: 'BoiCab_BoiJon', name: 'Boîtes jonction' },
  // Fils & Câbles
  { code: 'FilCab_Tew', name: 'Fils TEW' },
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

function parseProductsFromHtml(html: string): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  const productIdRegex = /data-productId="([^"]+)"/g;
  let match;

  while ((match = productIdRegex.exec(html)) !== null) {
    const sku = match[1].trim();
    const block = html.substring(match.index, match.index + 1000);

    const descMatch = block.match(/<div class="desc">([\s\S]*?)<\/div>/);
    const name = descMatch
      ? descMatch[1].trim().replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&#034;/g, '"')
      : '';
    if (name.length < 3) continue;

    const imgMatch = block.match(/<img\s[^>]*src="([^"]+)"/);
    let image_url = imgMatch ? imgMatch[1] : '';
    if (image_url && !image_url.startsWith('http')) {
      image_url = `https://shop.futech.ca${image_url}`;
    }
    if (image_url.includes('no-image')) image_url = '';

    products.push({ sku, name, image_url, price: null, unit: 'unité' });
  }
  return products;
}

export async function importFutechCatalog(
  onProgress?: (p: ImportProgress) => void,
  companyId?: number | null
): Promise<{ total: number; error?: string }> {
  const db = getDb();
  const cid = companyId ?? null;

  // Auto-create default categories if none exist
  for (const c of FUTECH_CATEGORIES) {
    const exists = db.prepare(
      "SELECT 1 FROM supplier_categories WHERE supplier = 'futech' AND category_url = ? AND company_id = ? LIMIT 1"
    ).get(c.code, cid);
    if (!exists) {
      db.prepare(
        "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('futech', ?, ?, 1, ?)"
      ).run(c.name, c.code, cid);
    }
  }

  const categories = db.prepare(
    "SELECT * FROM supplier_categories WHERE supplier = 'futech' AND enabled = 1 AND company_id = ?"
  ).all(cid) as any[];
  if (categories.length === 0) return { total: 0, error: 'Aucune catégorie Futech sélectionnée' };

  const upsert = db.prepare(`
    INSERT INTO products (supplier, sku, name, image_url, price, unit, category, last_synced)
    VALUES ('futech', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(supplier, sku) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url, price = excluded.price,
      unit = excluded.unit, category = excluded.category, last_synced = CURRENT_TIMESTAMP
  `);

  let totalImported = 0;

  try {
    for (const cat of categories) {
      let pageNum = 1;
      let categoryTotal = 0;
      onProgress?.({ category: cat.category_name, imported: 0, total: 0, done: false });

      while (pageNum <= MAX_PAGES_PER_CATEGORY) {
        const url = `https://shop.futech.ca/fr/Catalog/Index/${cat.category_url}?page=${pageNum}`;
        let responseText = '';

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(url, {
              headers: {
                'Accept': 'text/html',
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
            console.error(`[Futech] Error fetching ${cat.category_name} page ${pageNum}: ${err.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
          }
        }

        if (!responseText) break;

        const products = parseProductsFromHtml(responseText);
        if (products.length === 0) break;

        const insertMany = db.transaction((prods: ParsedProduct[]) => {
          for (const p of prods) {
            try { upsert.run(p.sku, p.name, p.image_url, p.price, p.unit, cat.category_name); } catch {}
          }
        });
        insertMany(products);

        categoryTotal += products.length;
        totalImported += products.length;
        onProgress?.({ category: cat.category_name, imported: categoryTotal, total: categoryTotal, done: false });

        // Futech shows 10 items per page; stop if fewer
        if (products.length < 10) break;
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

export function getFutechCatalogStats() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM products WHERE supplier = 'futech'").get() as any).count;
  const lastSync = (db.prepare("SELECT MAX(last_synced) as last FROM products WHERE supplier = 'futech'").get() as any).last;
  return { count, lastSync };
}
