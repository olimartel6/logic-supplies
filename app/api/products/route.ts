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

// Bilingual synonym groups for electrical terms (FR ↔ EN)
// Each group contains words that should match interchangeably
const SYNONYM_GROUPS: string[][] = [
  // Boxes & enclosures
  ['boite', 'boitier', 'box', 'boites', 'boitiers', 'boxes'],
  ['coffret', 'enclosure', 'cabinet', 'armoire', 'enclosures', 'cabinets'],
  // Wire & cable
  ['fil', 'fils', 'wire', 'wires', 'cable', 'cables', 'cablage'],
  ['bx', 'ac90', 'ac-90', 'armoured', 'armored', 'arme', 'blinde', 'mcable'],
  ['nmd', 'nmd90', 'nmd-90', 'romex', 'loomex', 'nm'],
  ['teck', 'teck90', 'teck-90'],
  ['rallonge', 'rallonges', 'extension', 'cord', 'cords'],
  // Breakers & panels
  ['disjoncteur', 'disjoncteurs', 'breaker', 'breakers'],
  ['panneau', 'panneaux', 'panel', 'panels', 'loadcentre', 'loadcenter'],
  ['fusible', 'fusibles', 'fuse', 'fuses'],
  // Switches & receptacles
  ['interrupteur', 'interrupteurs', 'switch', 'switches', 'toggle'],
  ['prise', 'prises', 'receptacle', 'receptacles', 'outlet', 'outlets', 'duplex'],
  ['plaque', 'plaques', 'wallplate', 'wallplates', 'coverplate', 'plate', 'plates'],
  // Conduit & fittings
  ['conduit', 'conduits', 'tuyau', 'tuyaux', 'pipe', 'pipes', 'raceway'],
  ['connecteur', 'connecteurs', 'connector', 'connectors', 'fitting', 'fittings'],
  ['coude', 'coudes', 'elbow', 'elbows'],
  ['manchon', 'coupling', 'couplings'],
  // Lighting
  ['luminaire', 'luminaires', 'lumiere', 'lumieres', 'light', 'lights', 'fixture', 'fixtures', 'lamp', 'lamps'],
  ['ampoule', 'ampoules', 'bulb', 'bulbs', 'led'],
  ['eclairage', 'lighting'],
  // Fasteners
  ['vis', 'screw', 'screws'],
  ['ecrou', 'ecrous', 'nut', 'nuts', 'locknut', 'locknuts'],
  ['boulon', 'boulons', 'bolt', 'bolts'],
  ['attache', 'attaches', 'tie', 'ties', 'tywrap', 'tywraps', 'zip'],
  // Tools
  ['outil', 'outils', 'tool', 'tools'],
  ['pince', 'pinces', 'plier', 'pliers'],
  ['tournevis', 'screwdriver', 'screwdrivers'],
  ['perceuse', 'perceuses', 'drill', 'drills'],
  ['scie', 'scies', 'saw', 'saws'],
  ['marteau', 'marteaux', 'hammer', 'hammers'],
  ['cle', 'cles', 'wrench', 'wrenches'],
  ['niveau', 'niveaux', 'level', 'levels'],
  ['ruban', 'rubans', 'tape', 'tapes'],
  ['metre', 'metres', 'meter', 'meters', 'measuring'],
  // Safety
  ['gant', 'gants', 'glove', 'gloves'],
  ['lunette', 'lunettes', 'goggle', 'goggles', 'glasses', 'safety'],
  ['casque', 'casques', 'helmet', 'helmets', 'hardhat'],
  // Common electrical terms
  ['marrette', 'marrettes', 'wirenut', 'wirenuts', 'wire nut', 'twist-on'],
  ['mise a la terre', 'ground', 'grounding', 'terre'],
  ['cosse', 'cosses', 'lug', 'lugs', 'terminal', 'terminals'],
  ['bornier', 'borniers', 'terminal block', 'terminal blocks'],
  ['contacteur', 'contacteurs', 'contactor', 'contactors'],
  ['relais', 'relay', 'relays'],
  ['transformateur', 'transformateurs', 'transformer', 'transformers'],
  ['moteur', 'moteurs', 'motor', 'motors'],
  ['ventilateur', 'ventilateurs', 'fan', 'fans'],
  ['thermostat', 'thermostats'],
  ['detecteur', 'detecteurs', 'detector', 'detectors', 'sensor', 'sensors'],
  ['compteur', 'compteurs', 'meter', 'metres'],
  ['chauffage', 'heater', 'heaters', 'heating', 'baseboard'],
  // Materials
  ['acier', 'steel', 'metal', 'metallic', 'metallique'],
  ['plastique', 'plastic', 'pvc', 'nylon'],
  ['cuivre', 'copper'],
  ['aluminium', 'aluminum'],
  ['blanc', 'white', 'wh'],
  ['noir', 'black', 'bk'],
  ['rouge', 'red'],
  ['bleu', 'blue'],
  ['vert', 'green'],
  ['jaune', 'yellow'],
  // Sizes & types
  ['rond', 'ronde', 'round', 'octagonal', 'octogonal'],
  ['carre', 'carree', 'square'],
  ['simple', 'single', '1g', '1-gang'],
  ['double', '2g', '2-gang'],
  ['triple', '3g', '3-gang'],
  ['interieur', 'indoor', 'interior'],
  ['exterieur', 'outdoor', 'exterior', 'weatherproof'],
  ['etanche', 'waterproof', 'watertight'],
];

// Build a lookup: normalized word → set of synonym words
const synonymLookup = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const normalizedGroup = group.map(w => normalizeStr(w));
  const groupSet = new Set(normalizedGroup);
  for (const word of normalizedGroup) {
    const existing = synonymLookup.get(word);
    if (existing) {
      for (const w of groupSet) existing.add(w);
    } else {
      synonymLookup.set(word, new Set(groupSet));
    }
  }
}

/** Expand a token into its synonyms: "boite" → ["boite", "boitier", "box", ...] */
function expandToken(token: string): string[] {
  const synonyms = synonymLookup.get(token);
  if (synonyms) return Array.from(synonyms);
  // Try partial match for compound tokens (only for tokens >= 4 chars to avoid false positives)
  if (token.length >= 4) {
    for (const [key, group] of synonymLookup) {
      if (key.length >= 4 && (token.includes(key) || key.includes(token))) {
        return [token, ...Array.from(group)];
      }
    }
  }
  return [token];
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

  // Tokenize and normalize the query: "boîte 4x4" → ["boite", "4x4"]
  const tokens = normalizeStr(q).split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return NextResponse.json([]);

  // Expand each token with bilingual synonyms
  // "boite" → ["boite", "boitier", "box", "boites", "boitiers", "boxes"]
  // Each token group uses OR logic; groups use AND logic
  const expandedTokenGroups = tokens.map(t => expandToken(t));

  // Build WHERE clause: (name/sku LIKE syn1 OR LIKE syn2 ...) AND (name/sku LIKE syn3 OR ...)
  const tokenWhereParts: string[] = [];
  const tokenParams: string[] = [];

  for (const synonyms of expandedTokenGroups) {
    const orParts = synonyms.map(() => `normalize_text(name) LIKE ? OR normalize_text(sku) LIKE ? OR normalize_text(category) LIKE ?`);
    tokenWhereParts.push(`(${orParts.join(' OR ')})`);
    for (const syn of synonyms) {
      tokenParams.push(`%${syn}%`, `%${syn}%`, `%${syn}%`);
    }
  }
  const tokenWhere = tokenWhereParts.join(' AND ');

  // For relevance: prefer exact original token match at start of name
  const firstTokenStartsWith = `${tokens[0]}%`;

  // Filter by per-company supplier visibility
  // Suppliers not explicitly listed default to VISIBLE (opt-out, not opt-in)
  const allSuppliers = ['lumen', 'canac', 'homedepot', 'guillevin', 'bmr', 'westburne', 'nedco', 'futech', 'deschenes', 'jsv'];
  const visRows = db.prepare(
    'SELECT supplier, visible FROM supplier_visibility WHERE company_id = ?'
  ).all(ctx.companyId) as { supplier: string; visible: number }[];

  const hiddenSuppliers = new Set(visRows.filter(r => r.visible === 0).map(r => r.supplier));
  const visibleSuppliers = allSuppliers.filter(s => !hiddenSuppliers.has(s));
  if (visibleSuppliers.length === 0) return NextResponse.json([]);

  let supplierWhere = '';
  let supplierParams: string[] = [];
  if (hiddenSuppliers.size > 0) {
    supplierWhere = `AND supplier IN (${visibleSuppliers.map(() => '?').join(',')})`;
    supplierParams = visibleSuppliers;
  }

  // Fetch enough per supplier to show variety (e.g. multiple sizes of EMT or BX)
  const perSupplierLimit = Math.max(limit, Math.ceil(limit * 1.5 / visibleSuppliers.length));
  const allResults: any[] = [];

  for (const supplier of visibleSuppliers) {
    const rows = db.prepare(`
      SELECT name, sku, image_url, price, unit, category, supplier
      FROM products
      WHERE ${tokenWhere} AND supplier = ?
      ORDER BY
        CASE WHEN normalize_text(name) LIKE ? THEN 0 ELSE 1 END,
        CASE WHEN price IS NULL THEN 1 ELSE 0 END,
        price ASC,
        name ASC
      LIMIT ${perSupplierLimit}
    `).all(...tokenParams, supplier, firstTokenStartsWith) as any[];
    allResults.push(...rows);
  }

  // Score relevance: how many token groups match in the product NAME (not category/sku)
  // A product with "box 4x4" in the name is much more relevant than "box" in category + "4x4" in sku
  function relevanceScore(product: any): number {
    const nameNorm = normalizeStr(product.name);
    let score = 0;
    for (const synonyms of expandedTokenGroups) {
      if (synonyms.some(syn => nameNorm.includes(syn))) score++;
    }
    return score;
  }

  // Sort merged results according to preference
  let results: any[];

  if (preference === 'cheapest') {
    results = allResults.sort((a, b) => {
      // Relevance first: more token groups matching in name = better
      const aRel = relevanceScore(a);
      const bRel = relevanceScore(b);
      if (aRel !== bRel) return bRel - aRel;
      // Products with image+price first, then image-only, then neither
      const aComplete = (a.image_url ? 2 : 0) + (a.price != null ? 1 : 0);
      const bComplete = (b.image_url ? 2 : 0) + (b.price != null ? 1 : 0);
      if (aComplete !== bComplete) return bComplete - aComplete;
      // By price ascending
      if (a.price != null && b.price != null && a.price !== b.price) return a.price - b.price;
      return a.name.localeCompare(b.name);
    }).slice(0, limit);
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

    results = allResults.sort((a, b) => {
      // Relevance first
      const aRel = relevanceScore(a);
      const bRel = relevanceScore(b);
      if (aRel !== bRel) return bRel - aRel;
      // Products with image+price first
      const aComplete = (a.image_url ? 2 : 0) + (a.price != null ? 1 : 0);
      const bComplete = (b.image_url ? 2 : 0) + (b.price != null ? 1 : 0);
      if (aComplete !== bComplete) return bComplete - aComplete;
      // Then by supplier proximity
      const aIdx = supplierOrder.indexOf(a.supplier);
      const bIdx = supplierOrder.indexOf(b.supplier);
      const aRank = aIdx >= 0 ? aIdx : 99;
      const bRank = bIdx >= 0 ? bIdx : 99;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    }).slice(0, limit);
  }

  return NextResponse.json(results);
}
