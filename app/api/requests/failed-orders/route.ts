import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const db = getDb();

  const failedJobs = db.prepare(`
    SELECT oj.id as job_id, oj.request_id, oj.last_error, oj.attempts, oj.created_at,
           r.product, r.quantity, r.unit
    FROM order_jobs oj
    LEFT JOIN requests r ON oj.request_id = r.id
    WHERE oj.company_id = ? AND oj.status = 'failed' AND COALESCE(oj.dismissed, 0) = 0
    ORDER BY oj.created_at DESC LIMIT 10
  `).all(ctx.companyId);

  return NextResponse.json(failedJobs);
}
