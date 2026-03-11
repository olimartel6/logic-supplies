import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { id } = await params;
  const db = getDb();

  // Find the failed job for this request
  const job = db.prepare(`
    SELECT * FROM order_jobs WHERE request_id = ? AND company_id = ? AND status = 'failed'
    ORDER BY created_at DESC LIMIT 1
  `).get(parseInt(id), ctx.companyId) as any;

  if (!job) return NextResponse.json({ error: 'Aucun job échoué trouvé' }, { status: 404 });

  // Reset job for retry
  db.prepare(`
    UPDATE order_jobs SET status = 'pending', attempts = 0, next_attempt_at = datetime('now'), last_error = NULL
    WHERE id = ?
  `).run(job.id);

  return NextResponse.json({ ok: true, jobId: job.id });
}
