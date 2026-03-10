import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';

  let suggestions;
  if (q) {
    suggestions = db.prepare(`
      SELECT r.product, r.supplier, COUNT(*) as order_count,
             MAX(r.created_at) as last_ordered,
             p.price, p.image_url, p.sku
      FROM requests r
      LEFT JOIN products p ON LOWER(p.name) = LOWER(r.product) AND p.supplier = r.supplier
      WHERE r.company_id = ? AND r.status = 'approved'
        AND LOWER(r.product) LIKE LOWER(?)
      GROUP BY r.product, r.supplier
      ORDER BY order_count DESC
      LIMIT 10
    `).all(ctx.companyId, `%${q}%`);
  } else {
    suggestions = db.prepare(`
      SELECT r.product, r.supplier, COUNT(*) as order_count,
             MAX(r.created_at) as last_ordered,
             p.price, p.image_url, p.sku
      FROM requests r
      LEFT JOIN products p ON LOWER(p.name) = LOWER(r.product) AND p.supplier = r.supplier
      WHERE r.company_id = ? AND r.status = 'approved'
      GROUP BY r.product, r.supplier
      ORDER BY order_count DESC
      LIMIT 10
    `).all(ctx.companyId);
  }

  return NextResponse.json(suggestions);
}
