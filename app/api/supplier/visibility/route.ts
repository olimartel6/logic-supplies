import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';

const ALL_SUPPLIERS = [
  'lumen','canac','homedepot','guillevin',
  'jsv','westburne','nedco','futech','deschenes','bmr','rona',
] as const;

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const rows = db.prepare(
    'SELECT supplier, visible FROM supplier_visibility WHERE company_id = ?'
  ).all(ctx.companyId) as { supplier: string; visible: number }[];

  const map = Object.fromEntries(rows.map(r => [r.supplier, r.visible === 1]));
  // Legacy companies with no rows: treat all as visible (matches product API behaviour)
  const defaultVisible = rows.length === 0;
  return NextResponse.json(
    ALL_SUPPLIERS.map(s => ({ supplier: s, visible: map[s] ?? defaultVisible }))
  );
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { supplier?: string; visible?: boolean };
  if (!body.supplier || !(ALL_SUPPLIERS as readonly string[]).includes(body.supplier)) {
    return NextResponse.json({ error: 'Fournisseur invalide' }, { status: 400 });
  }

  const db = getDb();

  // If this is the first toggle for a legacy company (no rows yet), seed all as visible=1
  // so turning one OFF doesn't hide everything else.
  const count = (db.prepare(
    'SELECT COUNT(*) as cnt FROM supplier_visibility WHERE company_id = ?'
  ).get(ctx.companyId) as any).cnt as number;
  if (count === 0) {
    const insertAll = db.prepare(
      'INSERT OR IGNORE INTO supplier_visibility (company_id, supplier, visible) VALUES (?, ?, 1)'
    );
    for (const s of ALL_SUPPLIERS) {
      insertAll.run(ctx.companyId, s);
    }
  }

  db.prepare(`
    INSERT INTO supplier_visibility (company_id, supplier, visible) VALUES (?, ?, ?)
    ON CONFLICT(company_id, supplier) DO UPDATE SET visible = excluded.visible
  `).run(ctx.companyId, body.supplier, body.visible ? 1 : 0);

  return NextResponse.json({ ok: true });
}
