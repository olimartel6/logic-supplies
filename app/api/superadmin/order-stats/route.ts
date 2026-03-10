import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/tenant';

export async function GET() {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const db = getDb();

  const stats = {
    totalJobs: (db.prepare('SELECT COUNT(*) as cnt FROM order_jobs').get() as any).cnt,
    pendingJobs: (db.prepare("SELECT COUNT(*) as cnt FROM order_jobs WHERE status = 'pending'").get() as any).cnt,
    processingJobs: (db.prepare("SELECT COUNT(*) as cnt FROM order_jobs WHERE status = 'processing'").get() as any).cnt,
    doneJobs: (db.prepare("SELECT COUNT(*) as cnt FROM order_jobs WHERE status = 'done'").get() as any).cnt,
    failedJobs: (db.prepare("SELECT COUNT(*) as cnt FROM order_jobs WHERE status = 'failed'").get() as any).cnt,
    recentAttempts: db.prepare(`
      SELECT oa.*, oj.request_id, r.product
      FROM order_attempts oa
      LEFT JOIN order_jobs oj ON oa.order_job_id = oj.id
      LEFT JOIN requests r ON oj.request_id = r.id
      ORDER BY oa.attempted_at DESC LIMIT 50
    `).all(),
    failedJobsList: db.prepare(`
      SELECT oj.*, r.product, r.quantity, c.name as company_name
      FROM order_jobs oj
      LEFT JOIN requests r ON oj.request_id = r.id
      LEFT JOIN companies c ON oj.company_id = c.id
      WHERE oj.status = 'failed'
      ORDER BY oj.created_at DESC LIMIT 20
    `).all(),
  };

  return NextResponse.json(stats);
}
