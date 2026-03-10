import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const url = new URL(req.url);
  const supplier = url.searchParams.get('supplier');
  const sku = url.searchParams.get('sku');
  if (!supplier || !sku) {
    return NextResponse.json({ error: 'supplier et sku requis' }, { status: 400 });
  }

  const db = getDb();
  const history = db.prepare(
    'SELECT price, recorded_at FROM price_history WHERE supplier = ? AND sku = ? ORDER BY recorded_at DESC LIMIT 30'
  ).all(supplier, sku);

  return NextResponse.json(history);
}
