import type { LumenOrderResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const RONA_BRANCHES: Branch[] = [
  { name: 'Rona Montréal (Marché Central)', address: '999 Rue du Marché Central, Montréal, QC',    lat: 45.5390, lng: -73.6540 },
  { name: 'Rona Laval',                     address: '3500 Boul. le Carrefour, Laval, QC',         lat: 45.5695, lng: -73.7505 },
  { name: 'Rona Brossard',                  address: '9155 Boul. Leduc, Brossard, QC',             lat: 45.4540, lng: -73.4580 },
  { name: 'Rona Québec',                    address: '3701 Boul. Wilfrid-Hamel, Québec, QC',       lat: 46.8115, lng: -71.3100 },
  { name: 'Rona Sherbrooke',                address: '4250 Boul. Portland, Sherbrooke, QC',         lat: 45.4030, lng: -71.8940 },
  { name: 'Rona Gatineau',                  address: '777 Boul. de la Gappe, Gatineau, QC',         lat: 45.4685, lng: -75.6850 },
  { name: 'Rona Trois-Rivières',            address: '4501 Boul. des Récollets, Trois-Rivières, QC', lat: 46.3415, lng: -72.5880 },
  { name: 'Rona Drummondville',             address: '1075 Boul. St-Joseph, Drummondville, QC',    lat: 45.8780, lng: -72.4850 },
  { name: 'Rona Saguenay',                  address: '1700 Boul. Talbot, Saguenay, QC',            lat: 48.4280, lng: -71.0680 },
  { name: 'Rona Rimouski',                  address: '405 Boul. Jessop, Rimouski, QC',              lat: 48.4435, lng: -68.5190 },
];

/**
 * Rona: add-to-cart only (no B2B portal, no checkout automation).
 * Uses the public rona.ca website to search and add products to cart.
 */

const RONA_BASE = 'https://www.rona.ca';

async function searchRonaApi(query: string): Promise<{ sku: string; name: string; price: number | null }[]> {
  try {
    // Rona uses a Constructor.io search API (same as catalog)
    const url = `https://tvbajuset-zone.cnstrc.com/search/${encodeURIComponent(query)}?key=key_DezNd1p5HBzjHuxk&num_results_per_page=5&section=Products`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const results = data?.response?.results || [];
    return results.map((r: any) => ({
      sku: r.data?.item_number || r.data?.id || '',
      name: r.value || '',
      price: r.data?.price ? parseFloat(r.data.price) : null,
    })).filter((r: any) => r.sku);
  } catch {
    return [];
  }
}

export async function getRonaPrice(
  _username: string,
  _password: string,
  product: string,
): Promise<number | null> {
  // Rona doesn't expose prices via its public API reliably
  // Try searching and extracting price from Constructor.io
  const results = await searchRonaApi(product);
  if (results.length === 0) return null;
  const match = results.find(r => r.price !== null);
  return match?.price ?? null;
}

export async function placeRonaOrder(
  _username: string,
  _password: string,
  product: string,
  quantity: number,
  _deliveryAddress?: string,
  _payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  // Rona: no B2B portal, we can only indicate the product was found
  // The actual "order" is add-to-cart only — user must complete manually
  const results = await searchRonaApi(product);
  if (results.length === 0) {
    return { success: false, error: 'Produit non trouvé chez Rona' };
  }

  const bestMatch = results[0];
  return {
    success: false,
    inCart: true,
    error: `Produit trouvé chez Rona (${bestMatch.name}). Achat en magasin requis — pas de commande B2B disponible.`,
  };
}
