import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get('name') || '';
  if (!name) return NextResponse.json([]);

  const db = getDb();
  const rows = db.prepare(
    'SELECT DISTINCT supplier FROM products WHERE LOWER(name) = LOWER(?)'
  ).all(name) as { supplier: string }[];

  return NextResponse.json(rows.map(r => r.supplier));
}
