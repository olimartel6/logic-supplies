import type { LumenOrderResult } from './lumen';
import type { Branch } from './canac';
import { CANAC_BRANCHES, placeCanacOrder, getCanacPrice } from './canac';
import { HOME_DEPOT_BRANCHES, placeHomeDepotOrder, getHomeDepotPrice } from './homedepot';
import { LUMEN_BRANCHES, placeLumenOrder, getLumenPrice } from './lumen';
import { GUILLEVIN_BRANCHES, placeGuillevinOrder, getGuillevinPrice } from './guillevin';
import { decrypt } from './encrypt';
import { getDb } from './db';

type SupplierKey = 'lumen' | 'canac' | 'homedepot' | 'guillevin';

interface SupplierAccount {
  supplier: SupplierKey;
  username: string;
  password: string;
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

function supplierLabel(s: SupplierKey): string {
  return s === 'lumen' ? 'Lumen' : s === 'canac' ? 'Canac' : s === 'guillevin' ? 'Guillevin' : 'Home Depot';
}

async function placeOrder(account: SupplierAccount, product: string, quantity: number): Promise<LumenOrderResult> {
  switch (account.supplier) {
    case 'lumen': return placeLumenOrder(account.username, account.password, product, quantity);
    case 'canac': return placeCanacOrder(account.username, account.password, product, quantity);
    case 'homedepot': return placeHomeDepotOrder(account.username, account.password, product, quantity);
    case 'guillevin': return placeGuillevinOrder(account.username, account.password, product, quantity);
  }
}

async function selectCheapest(
  accounts: SupplierAccount[],
  product: string,
): Promise<{ account: SupplierAccount; reason: string } | null> {
  if (accounts.length === 0) return null;

  const priceChecks = await Promise.all(
    accounts.map(async (acc) => {
      let price: number | null = null;
      try {
        if (acc.supplier === 'lumen') price = await getLumenPrice(acc.username, acc.password, product);
        else if (acc.supplier === 'canac') price = await getCanacPrice(acc.username, acc.password, product);
        else if (acc.supplier === 'homedepot') price = await getHomeDepotPrice(acc.username, acc.password, product);
        else if (acc.supplier === 'guillevin') price = await getGuillevinPrice(acc.username, acc.password, product);
      } catch { /* ignore */ }
      return { account: acc, price };
    }),
  );

  const withPrices = priceChecks.filter(p => p.price !== null) as { account: SupplierAccount; price: number }[];

  if (withPrices.length === 0) {
    return {
      account: accounts[0],
      reason: `Prix indisponible — ${supplierLabel(accounts[0].supplier)} sélectionné par défaut`,
    };
  }

  withPrices.sort((a, b) => a.price - b.price);
  const cheapest = withPrices[0];
  const pricesList = withPrices.map(p => `${supplierLabel(p.account.supplier)}: ${p.price.toFixed(2)}$`).join(' · ');

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
    lumen: LUMEN_BRANCHES,
    canac: CANAC_BRANCHES,
    homedepot: HOME_DEPOT_BRANCHES,
    guillevin: GUILLEVIN_BRANCHES,
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
): Promise<{ result: LumenOrderResult; supplier: string; reason: string }> {
  const allAccounts = getActiveAccounts(companyId ?? null);

  // If the product came from a specific supplier's catalog, only use that supplier
  const accounts = preferredSupplier
    ? allAccounts.filter(a => a.supplier === preferredSupplier)
    : allAccounts;

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

  const selected =
    preference === 'cheapest'
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

  for (let i = 0; i < orderedAccounts.length; i++) {
    const acc = orderedAccounts[i];
    const result = await placeOrder(acc, product, quantity);
    if (result.success || result.inCart) {
      const reason =
        i === 0
          ? selected.reason
          : `Fallback vers ${supplierLabel(acc.supplier)} (${supplierLabel(selected.account.supplier)} indisponible)`;
      return { result, supplier: acc.supplier, reason };
    }
  }

  return {
    result: { success: false, error: 'Tous les fournisseurs ont échoué' },
    supplier: selected.account.supplier,
    reason: selected.reason,
  };
}
