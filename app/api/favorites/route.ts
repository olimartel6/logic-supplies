import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const favorites = db.prepare(
    'SELECT * FROM product_favorites WHERE user_id = ? ORDER BY created_at DESC'
  ).all(ctx.userId);

  return NextResponse.json(favorites);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const body = await req.json();
  const { supplier, sku, name, image_url, price, unit, category } = body;

  if (!supplier || !sku || !name) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO product_favorites
      (user_id, supplier, sku, name, image_url, price, unit, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ctx.userId, supplier, sku, name, image_url ?? null, price ?? null, unit ?? null, category ?? null);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const { supplier, sku } = await req.json();
  const db = getDb();
  db.prepare(
    'DELETE FROM product_favorites WHERE user_id = ? AND supplier = ? AND sku = ?'
  ).run(ctx.userId, supplier, sku);

  return NextResponse.json({ ok: true });
}
