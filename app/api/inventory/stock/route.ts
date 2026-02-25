import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  const stock = db.prepare(`
    SELECT s.item_id, s.location_id, s.quantity,
      i.name as item_name, i.barcode, i.unit,
      l.name as location_name, l.type as location_type
    FROM inventory_stock s
    JOIN inventory_items i ON i.id = s.item_id
    JOIN inventory_locations l ON l.id = s.location_id
    WHERE s.company_id = ? AND s.quantity > 0
    ORDER BY i.name, l.name
  `).all(ctx.companyId);
  return NextResponse.json(stock);
}
