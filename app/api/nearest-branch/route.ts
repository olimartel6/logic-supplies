import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';
import { LUMEN_BRANCHES } from '@/lib/lumen';
import { CANAC_BRANCHES } from '@/lib/canac';
import { HOME_DEPOT_BRANCHES } from '@/lib/homedepot';
import { GUILLEVIN_BRANCHES } from '@/lib/guillevin';
import type { Branch } from '@/lib/canac';

const BRANCHES_BY_SUPPLIER: Record<string, Branch[]> = {
  lumen: LUMEN_BRANCHES,
  canac: CANAC_BRANCHES,
  homedepot: HOME_DEPOT_BRANCHES,
  guillevin: GUILLEVIN_BRANCHES,
};

// In-memory geocode cache (same pattern as products/route.ts)
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

async function getJobSiteCoords(jobSiteId: number, companyId: number | null) {
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

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const supplier = req.nextUrl.searchParams.get('supplier') || '';
  const jobSiteIdStr = req.nextUrl.searchParams.get('job_site_id');
  const jobSiteId = jobSiteIdStr ? parseInt(jobSiteIdStr) : null;

  const branches = BRANCHES_BY_SUPPLIER[supplier];
  if (!branches?.length) return NextResponse.json(null);

  if (!jobSiteId) {
    // No job site: return first branch as default (no distance)
    const b = branches[0];
    return NextResponse.json({ name: b.name, address: b.address });
  }

  const coords = await getJobSiteCoords(jobSiteId, ctx.companyId);
  if (!coords) {
    // Geocoding failed: return first branch without distance
    const b = branches[0];
    return NextResponse.json({ name: b.name, address: b.address });
  }

  // Find nearest branch
  let nearest = branches[0];
  let minDist = haversineKm(coords.lat, coords.lng, nearest.lat, nearest.lng);
  for (const b of branches.slice(1)) {
    const d = haversineKm(coords.lat, coords.lng, b.lat, b.lng);
    if (d < minDist) { minDist = d; nearest = b; }
  }

  return NextResponse.json({
    name: nearest.name,
    address: nearest.address,
    distanceKm: Math.round(minDist * 10) / 10,
  });
}
