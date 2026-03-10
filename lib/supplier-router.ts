import type { LumenOrderResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';
import { CANAC_BRANCHES, placeCanacOrder, getCanacPrice } from './canac';
import { HOME_DEPOT_BRANCHES, placeHomeDepotOrder, getHomeDepotPrice } from './homedepot';
import { LUMEN_BRANCHES, placeLumenOrder, getLumenPrice } from './lumen';
import { GUILLEVIN_BRANCHES, placeGuillevinOrder, getGuillevinPrice } from './guillevin';
import { JSV_BRANCHES, placeJsvOrder, getJsvPrice } from './jsv';
import { WESTBURNE_BRANCHES, placeWestburneOrder, getWestburnePrice } from './westburne';
import { NEDCO_BRANCHES, placeNedcoOrder, getNedcoPrice } from './nedco';
import { FUTECH_BRANCHES, placeFutechOrder, getFutechPrice } from './futech';
import { DESCHENES_BRANCHES, placeDeschenesOrder, getDeschenesPrice } from './deschenes';
import { BMR_BRANCHES, placeBmrOrder, getBmrPrice } from './bmr';
import { RONA_BRANCHES, placeRonaOrder, getRonaPrice } from './rona';
import { decrypt } from './encrypt';
import { getDb } from './db';

type SupplierKey = 'lumen' | 'canac' | 'homedepot' | 'guillevin' | 'jsv' | 'westburne' | 'nedco' | 'futech' | 'deschenes' | 'bmr' | 'rona';

interface SupplierAccount {
  supplier: SupplierKey;
  username: string;
  password: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Reliability helpers
 * ─────────────────────────────────────────────────────────────────────────── */

const ORDER_TIMEOUT_MS = 3 * 60 * 1000;   // 3 minutes per supplier order attempt
const PRICE_TIMEOUT_MS = 90 * 1000;        // 90 seconds per price check

/** Wrap a promise with a timeout — rejects with a clear error if it takes too long */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout après ${Math.round(ms / 1000)}s (${label})`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Check if an error is transient (worth retrying) vs permanent */
function isTransientError(err: string | undefined): boolean {
  if (!err) return false;
  const lower = err.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('net::') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('epipe') ||
    lower.includes('navigation') ||
    lower.includes('session') ||
    lower.includes('browser') ||
    lower.includes('target closed') ||
    lower.includes('context was destroyed') ||
    lower.includes('page.goto') ||
    lower.includes('connect') ||
    lower.includes('cloudflare') ||
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('temporarily unavailable')
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Supplier health tracking — in-memory, 3 consecutive failures = circuit open for 10 min
 * ─────────────────────────────────────────────────────────────────────────── */

interface HealthState { consecutiveFailures: number; circuitOpenUntil: number; }
const supplierHealth = new Map<string, HealthState>();

function recordSuccess(supplier: string) {
  supplierHealth.set(supplier, { consecutiveFailures: 0, circuitOpenUntil: 0 });
}

function recordFailure(supplier: string) {
  const state = supplierHealth.get(supplier) || { consecutiveFailures: 0, circuitOpenUntil: 0 };
  state.consecutiveFailures++;
  if (state.consecutiveFailures >= 3) {
    state.circuitOpenUntil = Date.now() + 10 * 60 * 1000; // 10 min cooldown
    console.log(`[Router][${supplier}] Circuit ouvert — 3 échecs consécutifs, ignoré pendant 10 min`);
  }
  supplierHealth.set(supplier, state);
}

function isSupplierHealthy(supplier: string): boolean {
  const state = supplierHealth.get(supplier);
  if (!state) return true;
  if (state.circuitOpenUntil > Date.now()) return false;
  return true;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=ca`;
    const res = await fetch(url, { headers: { 'User-Agent': 'logicSupplies-App/1.0' } });
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function nearestBranch(branches: Branch[], jobLat: number, jobLng: number): { distanceKm: number; branchName: string } {
  let minDist = Infinity;
  let nearest = branches[0];
  for (const branch of branches) {
    const d = haversineKm(jobLat, jobLng, branch.lat, branch.lng);
    if (d < minDist) { minDist = d; nearest = branch; }
  }
  return { distanceKm: Math.round(minDist * 10) / 10, branchName: nearest.name };
}

function getActiveAccounts(companyId: number | null): SupplierAccount[] {
  const db = getDb();
  const rows = db.prepare('SELECT supplier, username, password_encrypted FROM supplier_accounts WHERE active = 1 AND company_id = ?').all(companyId) as any[];
  return rows.map(row => ({
    supplier: row.supplier as SupplierKey,
    username: row.username,
    password: decrypt(row.password_encrypted),
  }));
}

/**
 * Build the best search query for a product.
 * Priority: catalog SKU > model number from name > first 3 words of name.
 */
function buildSearchQuery(product: string, supplier?: string): string {
  const db = getDb();

  // 1. Try exact name match in catalog — use SKU (most precise)
  const byName = supplier
    ? db.prepare("SELECT sku FROM products WHERE name = ? AND supplier = ? LIMIT 1").get(product, supplier)
    : db.prepare("SELECT sku FROM products WHERE name = ? LIMIT 1").get(product);
  if ((byName as any)?.sku) {
    const sku = (byName as any).sku;
    // SKU might contain slashes (e.g., "abc/def") — use first part
    return sku.split('/')[0];
  }

  // 2. Extract model number word (contains digits + is alphanumeric)
  const words = product.split(/\s+/);
  const modelWord = words.find(w => /\d/.test(w) && w.length >= 3 && /^[A-Za-z0-9\-\/]+$/.test(w));
  if (modelWord) {
    const brand = words[0];
    return brand !== modelWord ? `${brand} ${modelWord}` : modelWord;
  }

  // 3. Fallback: first 3 words
  return words.slice(0, 3).join(' ');
}

function supplierLabel(s: SupplierKey): string {
  const labels: Record<SupplierKey, string> = {
    lumen: 'Lumen', canac: 'Canac', homedepot: 'Home Depot', guillevin: 'Guillevin',
    jsv: 'JSV', westburne: 'Westburne', nedco: 'Nedco', futech: 'Futech',
    deschenes: 'Deschênes', bmr: 'BMR', rona: 'Rona',
  };
  return labels[s] ?? s;
}

async function placeOrderRaw(account: SupplierAccount, product: string, quantity: number, deliveryAddress?: string, payment?: PaymentInfo): Promise<LumenOrderResult> {
  switch (account.supplier) {
    case 'lumen':     return placeLumenOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'canac':     return placeCanacOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'homedepot': return placeHomeDepotOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'guillevin': return placeGuillevinOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'jsv':       return placeJsvOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'westburne': return placeWestburneOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'nedco':     return placeNedcoOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'futech':    return placeFutechOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'deschenes': return placeDeschenesOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'bmr':       return placeBmrOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'rona':      return placeRonaOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
  }
}

/** Place order with timeout wrapper, retry on transient failures, and health tracking */
async function placeOrder(account: SupplierAccount, product: string, quantity: number, deliveryAddress?: string, payment?: PaymentInfo): Promise<LumenOrderResult> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await withTimeout(
        placeOrderRaw(account, product, quantity, deliveryAddress, payment),
        ORDER_TIMEOUT_MS,
        `commande ${supplierLabel(account.supplier)}`,
      );
      if (result.success || result.inCart) {
        recordSuccess(account.supplier);
        return result;
      }
      recordFailure(account.supplier);
      if (attempt < 2 && isTransientError(result.error)) {
        console.error(`[Router][${account.supplier}] erreur transitoire (tentative ${attempt}/2): ${result.error}`);
        continue;
      }
      return result;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      recordFailure(account.supplier);
      console.error(`[Router][${account.supplier}] exception (tentative ${attempt}/2): ${errMsg}`);
      if (attempt < 2 && isTransientError(errMsg)) continue;
      return { success: false, error: errMsg };
    }
  }
  return { success: false, error: 'Échec après 2 tentatives' };
}

async function selectCheapest(
  accounts: SupplierAccount[],
  product: string,
): Promise<{ account: SupplierAccount; reason: string } | null> {
  if (accounts.length === 0) return null;

  // First: check if the product exists in our catalog with a price — skip expensive browser calls
  try {
    const db = getDb();
    const catalogPrices = db.prepare(`
      SELECT supplier, price FROM products
      WHERE (LOWER(name) = LOWER(?) OR sku = ?)
        AND price IS NOT NULL AND price > 0.02
      ORDER BY price ASC
    `).all(product, product) as { supplier: string; price: number }[];

    if (catalogPrices.length > 0) {
      // Find the cheapest supplier that has an active account
      for (const cp of catalogPrices) {
        const acc = accounts.find(a => a.supplier === cp.supplier);
        if (acc) {
          const pricesList = catalogPrices
            .filter(p => accounts.some(a => a.supplier === p.supplier))
            .map(p => `${supplierLabel(p.supplier as SupplierKey)}: ${p.price.toFixed(2)}$`)
            .join(' · ');
          return {
            account: acc,
            reason: `Prix catalogue: ${cp.price.toFixed(2)}$ (${pricesList})`,
          };
        }
      }
    }
  } catch { /* catalog lookup failed, fall through to live price check */ }

  // Fallback: live price check — sequential to avoid opening N browsers at once
  const priceChecks: { account: SupplierAccount; price: number }[] = [];

  for (const acc of accounts) {
    let price: number | null = null;
    try {
      const getPriceFn = {
        lumen: getLumenPrice, canac: getCanacPrice, homedepot: getHomeDepotPrice,
        guillevin: getGuillevinPrice, jsv: getJsvPrice, westburne: getWestburnePrice,
        nedco: getNedcoPrice, futech: getFutechPrice, deschenes: getDeschenesPrice,
        bmr: getBmrPrice, rona: getRonaPrice,
      }[acc.supplier];
      price = await withTimeout(
        getPriceFn(acc.username, acc.password, product),
        PRICE_TIMEOUT_MS,
        `prix ${supplierLabel(acc.supplier)}`,
      );
    } catch (err: any) {
      console.error(`[Router] Prix ${supplierLabel(acc.supplier)} erreur: ${err.message}`);
    }
    if (price !== null) priceChecks.push({ account: acc, price });
  }

  if (priceChecks.length === 0) {
    return {
      account: accounts[0],
      reason: `Prix indisponible — ${supplierLabel(accounts[0].supplier)} sélectionné par défaut`,
    };
  }

  priceChecks.sort((a, b) => a.price - b.price);
  const cheapest = priceChecks[0];
  const pricesList = priceChecks.map(p => `${supplierLabel(p.account.supplier)}: ${p.price.toFixed(2)}$`).join(' · ');

  return {
    account: cheapest.account,
    reason: `Prix le moins cher: ${cheapest.price.toFixed(2)}$ (${pricesList})`,
  };
}

async function selectFastest(
  accounts: SupplierAccount[],
  jobSiteAddress: string,
): Promise<{ account: SupplierAccount; reason: string } | null> {
  if (accounts.length === 0) return null;

  if (!jobSiteAddress) {
    return {
      account: accounts[0],
      reason: `Adresse non disponible — ${supplierLabel(accounts[0].supplier)} sélectionné par défaut`,
    };
  }

  const geo = await geocodeAddress(jobSiteAddress);
  if (!geo) {
    return {
      account: accounts[0],
      reason: `Adresse introuvable — ${supplierLabel(accounts[0].supplier)} sélectionné par défaut`,
    };
  }

  const branchMap: Record<SupplierKey, Branch[]> = {
    lumen: LUMEN_BRANCHES, canac: CANAC_BRANCHES, homedepot: HOME_DEPOT_BRANCHES,
    guillevin: GUILLEVIN_BRANCHES, jsv: JSV_BRANCHES, westburne: WESTBURNE_BRANCHES,
    nedco: NEDCO_BRANCHES, futech: FUTECH_BRANCHES, deschenes: DESCHENES_BRANCHES,
    bmr: BMR_BRANCHES, rona: RONA_BRANCHES,
  };

  const distances = accounts.map(acc => {
    const { distanceKm, branchName } = nearestBranch(branchMap[acc.supplier], geo.lat, geo.lng);
    return { account: acc, distanceKm, branchName };
  });

  distances.sort((a, b) => a.distanceKm - b.distanceKm);
  const closest = distances[0];

  return {
    account: closest.account,
    reason: `Succursale la plus proche: ${closest.branchName} (${closest.distanceKm} km)`,
  };
}

export async function selectAndOrder(
  preference: 'cheapest' | 'fastest',
  jobSiteAddress: string,
  product: string,
  quantity: number,
  preferredSupplier?: string,
  companyId?: number | null,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<{ result: LumenOrderResult; supplier: string; reason: string }> {
  const allAccounts = getActiveAccounts(companyId ?? null);

  // If the product came from a specific supplier's catalog, only use that supplier
  // Filter out unhealthy suppliers (circuit breaker: 3 consecutive failures = 10min cooldown)
  const accounts = (preferredSupplier
    ? allAccounts.filter(a => a.supplier === preferredSupplier)
    : allAccounts
  ).filter(a => isSupplierHealthy(a.supplier));

  const fallbackSupplier = preferredSupplier || allAccounts[0]?.supplier || 'lumen';

  if (accounts.length === 0) {
    const msg = preferredSupplier
      ? `Aucun compte ${supplierLabel(preferredSupplier as SupplierKey)} actif configuré`
      : 'Aucun compte fournisseur configuré';
    return {
      result: { success: false, error: msg },
      supplier: fallbackSupplier,
      reason: '',
    };
  }

  // With a single account there is nothing to compare — skip the price/distance
  // check (which would open a full browser session) and go straight to ordering.
  const selected = accounts.length === 1
    ? { account: accounts[0], reason: `${supplierLabel(accounts[0].supplier)} sélectionné` }
    : preference === 'cheapest'
      ? await selectCheapest(accounts, product)
      : await selectFastest(accounts, jobSiteAddress);

  if (!selected) {
    return {
      result: { success: false, error: 'Impossible de sélectionner un fournisseur' },
      supplier: fallbackSupplier,
      reason: '',
    };
  }

  // Try selected supplier first, then fall back to others
  const orderedAccounts = [
    selected.account,
    ...accounts.filter(a => a.supplier !== selected.account.supplier),
  ];

  const errors: string[] = [];
  for (let i = 0; i < orderedAccounts.length; i++) {
    const acc = orderedAccounts[i];
    const result = await placeOrder(acc, product, quantity, deliveryAddress, payment);
    if (result.success || result.inCart) {
      const reason =
        i === 0
          ? selected.reason
          : `Fallback vers ${supplierLabel(acc.supplier)} (${supplierLabel(selected.account.supplier)} indisponible)`;
      return { result, supplier: acc.supplier, reason };
    }
    errors.push(`${acc.supplier}: ${result.error || 'échec inconnu'}`);
  }

  return {
    result: { success: false, error: errors.join(' | ') || 'Tous les fournisseurs ont échoué' },
    supplier: selected.account.supplier,
    reason: selected.reason,
  };
}
