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
  const sites = db.prepare(`
    SELECT j.id, j.name, j.address, j.status,
           j.budget_total,
           COALESCE(j.budget_committed, 0) as budget_committed,
           COUNT(CASE WHEN a.seen = 0 THEN 1 END) as unseen_alerts
    FROM job_sites j
    LEFT JOIN budget_alerts a ON a.job_site_id = j.id
    WHERE j.status = 'active'
      AND j.company_id = ?
    GROUP BY j.id
    ORDER BY j.name
  `).all(ctx.companyId);

  const totalUnseen = (
    db.prepare('SELECT COUNT(*) as count FROM budget_alerts a JOIN job_sites j ON a.job_site_id = j.id WHERE a.seen = 0 AND j.company_id = ?').get(ctx.companyId) as any
  ).count;

  return NextResponse.json({ sites, totalUnseen });
}
