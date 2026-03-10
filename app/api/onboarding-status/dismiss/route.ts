import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  db.prepare('UPDATE company_settings SET onboarding_dismissed = 1 WHERE company_id = ?').run(ctx.companyId);
  return NextResponse.json({ ok: true });
}
