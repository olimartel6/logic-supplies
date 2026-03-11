import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { triggerApproval } from '@/lib/approval';

const TEST_NOTE = '[TEST-DRY-RUN]';

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin seulement' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const product: string = body.product || 'Fil 14/2 NMD90 150m';
  const supplier: string | null = body.supplier || null;
  const quantity: number = body.quantity || 1;

  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Aucune compagnie associée' }, { status: 400 });
  }

  const db = getDb();

  // Find a worker and job site for the test request
  const worker = db.prepare(
    "SELECT id, email FROM users WHERE company_id = ? AND role = 'worker' LIMIT 1"
  ).get(ctx.companyId) as { id: number; email: string } | undefined;

  const jobSite = db.prepare(
    "SELECT id FROM job_sites WHERE company_id = ? LIMIT 1"
  ).get(ctx.companyId) as { id: number } | undefined;

  // Create test request
  const result = db.prepare(`
    INSERT INTO requests (company_id, product, quantity, unit, job_site_id, worker_id, urgency, note, status, supplier)
    VALUES (?, ?, ?, 'unité', ?, ?, 0, ?, 'pending', ?)
  `).run(
    ctx.companyId, product, quantity,
    jobSite?.id || null, worker?.id || ctx.userId,
    TEST_NOTE, supplier,
  );

  const requestId = Number(result.lastInsertRowid);

  // Trigger approval with dryRun=true
  await triggerApproval(requestId, ctx.companyId, db, undefined, 'Test automatique dry-run', true);

  return NextResponse.json({ ok: true, requestId });
}

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin seulement' }, { status: 403 });
  }
  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Aucune compagnie associée' }, { status: 400 });
  }

  const db = getDb();

  // Get all test requests with their order jobs, attempts, and supplier orders
  const requests = db.prepare(`
    SELECT r.id, r.product, r.quantity, r.unit, r.supplier, r.status, r.created_at,
           r.tracking_status
    FROM requests r
    WHERE r.company_id = ? AND r.note = ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(ctx.companyId, TEST_NOTE) as any[];

  const results = requests.map((r: any) => {
    const job = db.prepare(`
      SELECT id, status, attempts, last_error, payload, created_at
      FROM order_jobs WHERE request_id = ? AND company_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(r.id, ctx.companyId) as any;

    const attempts = job
      ? db.prepare(`
          SELECT supplier, attempt_number, status, duration_ms, error_message, attempted_at
          FROM order_attempts WHERE order_job_id = ? ORDER BY attempt_number ASC
        `).all(job.id) as any[]
      : [];

    const supplierOrder = db.prepare(`
      SELECT supplier, supplier_order_id, status, ordered_at, error_message
      FROM supplier_orders WHERE request_id = ? AND company_id = ?
      ORDER BY ordered_at DESC LIMIT 1
    `).get(r.id, ctx.companyId) as any;

    return {
      requestId: r.id,
      product: r.product,
      quantity: r.quantity,
      supplier: r.supplier,
      requestStatus: r.status,
      trackingStatus: r.tracking_status,
      createdAt: r.created_at,
      job: job ? {
        id: job.id,
        status: job.status,
        attempts: job.attempts,
        lastError: job.last_error,
      } : null,
      attempts,
      supplierOrder: supplierOrder ? {
        supplier: supplierOrder.supplier,
        orderId: supplierOrder.supplier_order_id,
        status: supplierOrder.status,
        orderedAt: supplierOrder.ordered_at,
        error: supplierOrder.error_message,
      } : null,
    };
  });

  return NextResponse.json({ results });
}

export async function DELETE() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin seulement' }, { status: 403 });
  }
  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Aucune compagnie associée' }, { status: 400 });
  }

  const db = getDb();

  // Get test request IDs
  const testRequests = db.prepare(
    "SELECT id FROM requests WHERE company_id = ? AND note = ?"
  ).all(ctx.companyId, TEST_NOTE) as { id: number }[];

  const ids = testRequests.map(r => r.id);

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    // Clean up order_attempts via order_jobs
    const jobs = db.prepare(
      `SELECT id FROM order_jobs WHERE request_id IN (${placeholders}) AND company_id = ?`
    ).all(...ids, ctx.companyId) as { id: number }[];
    const jobIds = jobs.map(j => j.id);
    if (jobIds.length > 0) {
      const jobPlaceholders = jobIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM order_attempts WHERE order_job_id IN (${jobPlaceholders})`).run(...jobIds);
    }
    db.prepare(`DELETE FROM order_jobs WHERE request_id IN (${placeholders}) AND company_id = ?`).run(...ids, ctx.companyId);
    db.prepare(`DELETE FROM supplier_orders WHERE request_id IN (${placeholders}) AND company_id = ?`).run(...ids, ctx.companyId);
    db.prepare(`DELETE FROM requests WHERE id IN (${placeholders}) AND company_id = ?`).run(...ids, ctx.companyId);
  }

  return NextResponse.json({ ok: true, deleted: ids.length });
}
