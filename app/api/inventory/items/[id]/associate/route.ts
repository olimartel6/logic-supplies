import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const { id } = await params;
  const { barcode } = await req.json();
  if (!barcode) return NextResponse.json({ error: 'barcode requis' }, { status: 400 });
  const db = getDb();
  try {
    const result = db.prepare(
      'UPDATE inventory_items SET barcode = ? WHERE id = ? AND company_id = ?'
    ).run(barcode, id, ctx.companyId);
    if (result.changes === 0) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Code-barres déjà utilisé' }, { status: 409 });
  }
}
