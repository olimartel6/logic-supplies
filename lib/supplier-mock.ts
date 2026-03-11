import type { LumenOrderResult } from './lumen';

/**
 * Dry-run mock for supplier orders — simulates the full flow without touching real suppliers.
 */

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function randomId(supplier: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `DRY-${supplier.toUpperCase()}-${id}`;
}

export async function placeOrderDryRun(
  supplier: string,
  product: string,
  quantity: number,
): Promise<LumenOrderResult> {
  // Simulate network delay
  await new Promise(r => setTimeout(r, 2000));
  return {
    success: true,
    orderId: randomId(supplier),
    log: [
      `[DRY-RUN] Commande simulée pour ${supplier}`,
      `Produit: ${product} x${quantity}`,
      `Délai simulé: 2s`,
    ],
  };
}

export function getPriceDryRun(product: string): number {
  // Deterministic price based on product name hash: between 5$ and 500$
  const h = hashCode(product);
  return Math.round(((h % 49500) / 100 + 5) * 100) / 100;
}
