import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  const s = db.prepare('SELECT inventory_enabled FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;
  return NextResponse.json({ inventory_enabled: !!s?.inventory_enabled });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const { inventory_enabled } = await req.json();
  const db = getDb();
  db.prepare('UPDATE company_settings SET inventory_enabled = ? WHERE company_id = ?').run(inventory_enabled ? 1 : 0, ctx.companyId);
  return NextResponse.json({ ok: true });
}
