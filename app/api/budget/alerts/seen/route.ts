import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function PATCH() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  db.prepare('UPDATE budget_alerts SET seen = 1 WHERE seen = 0 AND company_id = ?').run(ctx.companyId);

  return NextResponse.json({ ok: true });
}
