import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';
import { LUMEN_BRANCHES } from '@/lib/lumen';
import { CANAC_BRANCHES } from '@/lib/canac';
import { HOME_DEPOT_BRANCHES } from '@/lib/homedepot';
import { GUILLEVIN_BRANCHES } from '@/lib/guillevin';
import type { Branch } from '@/lib/canac';

// In-memory cache for geocoded job site coordinates (invalidated on restart)
const geoCache = new Map<number, { lat: number; lng: number } | null>();

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestDist(branches: Branch[], lat: number, lng: number): number {
  return Math.min(...branches.map(b => haversineKm(lat, lng, b.lat, b.lng)));
}

async function getJobSiteCoords(jobSiteId: number, companyId: number | null): Promise<{ lat: number; lng: number } | null> {
  // Only cache successful results; failures are retried each time
  if (geoCache.has(jobSiteId)) return geoCache.get(jobSiteId)!;

  const db = getDb();
  const site = db.prepare('SELECT address FROM job_sites WHERE id = ? AND company_id = ?').get(jobSiteId, companyId) as any;
  if (!site?.address) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(site.address)}&limit=1&countrycodes=ca`;
    const res = await fetch(url, { headers: { 'User-Agent': 'logicSupplies-App/1.0' } });
    const data = await res.json();
    if (!data.length) return null;
    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    geoCache.set(jobSiteId, result);
    return result;
  } catch {
    return null;
  }
}

function normalizeStr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d)\s*[xX×]\s*(\d)/g, '$1x$2') // "4 x 4" → "4x4"
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const q = req.nextUrl.searchParams.get('q') || '';
  if (q.length < 2) return NextResponse.json([]);

  const jobSiteIdStr = req.nextUrl.searchParams.get('job_site_id');
  const jobSiteId = jobSiteIdStr ? parseInt(jobSiteIdStr) : null;

  const db = getDb();

  const userPref = db.prepare('SELECT supplier_preference FROM users WHERE id = ?').get(ctx.userId) as any;
  const compPref = db.prepare('SELECT supplier_preference FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;
  const preference: 'cheapest' | 'fastest' = userPref?.supplier_preference || compPref?.supplier_preference || 'cheapest';

  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') || '12');
  const limit = Math.min(Math.max(limitParam, 1), 48);

  // Tokenize and normalize the query: "boite 4x4" → ["boite", "4x4"]
  // Each token must be present in the name/sku (AND logic, accent-insensitive)
  const tokens = normalizeStr(q).split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return NextResponse.json([]);

  const tokenWhere = tokens
    .map(() => `(normalize_text(name) LIKE ? OR normalize_text(sku) LIKE ?)`)
    .join(' AND ');
  const tokenParams = tokens.flatMap(t => [`%${t}%`, `%${t}%`]);
  const firstTokenStartsWith = `${tokens[0]}%`;

  let results: any[];

  if (preference === 'cheapest') {
    results = db.prepare(`
      SELECT name, sku, image_url, price, unit, category, supplier
      FROM products
      WHERE ${tokenWhere}
      ORDER BY
        CASE WHEN price IS NULL THEN 1 ELSE 0 END,
        price ASC,
        CASE WHEN normalize_text(name) LIKE ? THEN 0 ELSE 1 END,
        name ASC
      LIMIT ${limit}
    `).all(...tokenParams, firstTokenStartsWith) as any[];
  } else {
    // Fastest: sort by nearest supplier to the job site
    let supplierOrder = ['lumen', 'canac', 'homedepot', 'guillevin'];

    if (jobSiteId) {
      const coords = await getJobSiteCoords(jobSiteId, ctx.companyId);
      if (coords) {
        const distances = [
          { supplier: 'lumen', dist: nearestDist(LUMEN_BRANCHES, coords.lat, coords.lng) },
          { supplier: 'canac', dist: nearestDist(CANAC_BRANCHES, coords.lat, coords.lng) },
          { supplier: 'homedepot', dist: nearestDist(HOME_DEPOT_BRANCHES, coords.lat, coords.lng) },
          { supplier: 'guillevin', dist: nearestDist(GUILLEVIN_BRANCHES, coords.lat, coords.lng) },
        ];
        distances.sort((a, b) => a.dist - b.dist);
        supplierOrder = distances.map(d => d.supplier);
      }
    }

    const [s0, s1] = supplierOrder;
    results = db.prepare(`
      SELECT name, sku, image_url, price, unit, category, supplier
      FROM products
      WHERE ${tokenWhere}
      ORDER BY
        CASE WHEN supplier = ? THEN 0 WHEN supplier = ? THEN 1 ELSE 2 END,
        CASE WHEN normalize_text(name) LIKE ? THEN 0 ELSE 1 END,
        name ASC
      LIMIT ${limit}
    `).all(...tokenParams, s0, s1, firstTokenStartsWith) as any[];
  }

  return NextResponse.json(results);
}
