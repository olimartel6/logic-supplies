import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';
  const db = getDb();
  const categories = db.prepare(
    'SELECT * FROM supplier_categories WHERE supplier = ? AND company_id = ? ORDER BY category_name'
  ).all(supplier, ctx.companyId);
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const { enabledIds, supplier = 'lumen' } = await req.json();
  const db = getDb();

  const all = db.prepare(
    'SELECT id FROM supplier_categories WHERE supplier = ? AND company_id = ?'
  ).all(supplier, ctx.companyId) as { id: number }[];
  for (const cat of all) {
    const enabled = enabledIds.includes(cat.id) ? 1 : 0;
    db.prepare('UPDATE supplier_categories SET enabled = ? WHERE id = ? AND company_id = ?')
      .run(enabled, cat.id, ctx.companyId);
  }
  return NextResponse.json({ ok: true });
}
