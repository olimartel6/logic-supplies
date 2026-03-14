import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  const rows = db.prepare(
    'SELECT supplier, order_mode, rep_email FROM supplier_order_modes WHERE company_id = ?'
  ).all(ctx.companyId) as { supplier: string; order_mode: string; rep_email: string | null }[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const body = await req.json();
  const { supplier, orderMode, repEmail } = body;

  if (!supplier || !['account', 'pdf'].includes(orderMode)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO supplier_order_modes (company_id, supplier, order_mode, rep_email)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(company_id, supplier) DO UPDATE SET
      order_mode = excluded.order_mode,
      rep_email = excluded.rep_email
  `).run(ctx.companyId, supplier, orderMode, repEmail || null);

  return NextResponse.json({ ok: true });
}
