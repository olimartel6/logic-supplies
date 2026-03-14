import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  db.prepare(
    "UPDATE order_jobs SET dismissed = 1 WHERE company_id = ? AND status = 'failed' AND COALESCE(dismissed, 0) = 0"
  ).run(ctx.companyId);

  return NextResponse.json({ ok: true });
}
