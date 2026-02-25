import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { budget_total } = await req.json();
  const db = getDb();

  // Verify the job_site belongs to this company before updating
  const site = db.prepare('SELECT id FROM job_sites WHERE id = ? AND company_id = ?').get(id, ctx.companyId);
  if (!site) {
    return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });
  }

  db.prepare('UPDATE job_sites SET budget_total = ? WHERE id = ? AND company_id = ?').run(
    budget_total === '' || budget_total == null ? null : Number(budget_total),
    id,
    ctx.companyId
  );

  return NextResponse.json({ ok: true });
}
