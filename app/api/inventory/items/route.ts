import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  const items = db.prepare(`
    SELECT i.*, COALESCE(SUM(s.quantity), 0) as total_stock
    FROM inventory_items i
    LEFT JOIN inventory_stock s ON s.item_id = i.id
    WHERE i.company_id = ?
    GROUP BY i.id
    ORDER BY i.name
  `).all(ctx.companyId);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const { barcode: rawBarcode, name, unit, description } = await req.json();
  if (!name) return NextResponse.json({ error: 'name requis' }, { status: 400 });
  const barcode = rawBarcode?.trim() || `INT-${ctx.companyId}-${Date.now()}`;
  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO inventory_items (company_id, barcode, name, unit, description) VALUES (?, ?, ?, ?, ?)'
    ).run(ctx.companyId, barcode, name, unit || 'unité', description || null);
    return NextResponse.json({ id: result.lastInsertRowid, barcode });
  } catch {
    return NextResponse.json({ error: 'Code-barres déjà utilisé' }, { status: 409 });
  }
}
