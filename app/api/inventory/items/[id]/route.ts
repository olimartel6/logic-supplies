import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const { id: barcode } = await params;
  const db = getDb();
  const item = db.prepare(`
    SELECT i.*,
      json_group_array(json_object(
        'location_id', s.location_id,
        'location_name', l.name,
        'location_type', l.type,
        'quantity', s.quantity
      )) as stock_json
    FROM inventory_items i
    LEFT JOIN inventory_stock s ON s.item_id = i.id
    LEFT JOIN inventory_locations l ON l.id = s.location_id
    WHERE i.company_id = ? AND i.barcode = ?
    GROUP BY i.id
  `).get(ctx.companyId, barcode) as any;
  if (!item) return NextResponse.json({ found: false });
  const stock = item.stock_json
    ? JSON.parse(item.stock_json).filter((s: any) => s.location_id !== null)
    : [];
  return NextResponse.json({ found: true, item: { ...item, stock_json: undefined, stock } });
}
