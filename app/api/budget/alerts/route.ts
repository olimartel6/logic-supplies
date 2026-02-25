import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  const alerts = db.prepare(`
    SELECT a.*, j.name as job_site_name
    FROM budget_alerts a
    LEFT JOIN job_sites j ON a.job_site_id = j.id
    WHERE a.company_id = ?
    ORDER BY a.created_at DESC
    LIMIT 50
  `).all(ctx.companyId);

  return NextResponse.json(alerts);
}
