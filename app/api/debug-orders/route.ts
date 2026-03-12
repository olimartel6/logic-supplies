import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { triggerApproval } from '@/lib/approval';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin seulement' }, { status: 403 });
  }

  const db = getDb();
  const cid = ctx.companyId;

  // Recent order jobs
  const jobs = db.prepare(`
    SELECT oj.id, oj.request_id, oj.status, oj.attempts, oj.max_attempts,
           oj.last_error, oj.next_attempt_at, oj.created_at,
           r.product, r.quantity, r.supplier
    FROM order_jobs oj
    JOIN requests r ON r.id = oj.request_id
    WHERE oj.company_id = ?
    ORDER BY oj.created_at DESC
    LIMIT 10
  `).all(cid);

  // Recent order attempts
  const attempts = db.prepare(`
    SELECT oa.order_job_id, oa.supplier, oa.attempt_number, oa.status,
           oa.duration_ms, oa.error_message, oa.attempted_at
    FROM order_attempts oa
    WHERE oa.company_id = ?
    ORDER BY oa.attempted_at DESC
    LIMIT 20
  `).all(cid);

  // Recent supplier orders
  const supplierOrders = db.prepare(`
    SELECT so.request_id, so.supplier, so.supplier_order_id, so.status,
           so.error_message, so.ordered_at
    FROM supplier_orders so
    WHERE so.company_id = ?
    ORDER BY so.ordered_at DESC
    LIMIT 10
  `).all(cid);

  // Recent requests
  const requests = db.prepare(`
    SELECT id, product, quantity, unit, supplier, status, tracking_status, note, created_at
    FROM requests WHERE company_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).all(cid);

  // Check if guillevin account exists
  const guillevinAccount = db.prepare(
    "SELECT supplier, username, active FROM supplier_accounts WHERE company_id = ? AND supplier = 'guillevin'"
  ).get(cid);

  // Check payment method
  const hasPayment = !!db.prepare(
    "SELECT 1 FROM company_payment_methods WHERE company_id = ?"
  ).get(cid);

  // Find stuck requests (approved but no order_job)
  const stuckRequests = db.prepare(`
    SELECT r.id, r.product, r.supplier, r.quantity
    FROM requests r
    LEFT JOIN order_jobs oj ON oj.request_id = r.id AND oj.company_id = r.company_id
    WHERE r.company_id = ? AND r.status = 'approved' AND oj.id IS NULL
    ORDER BY r.created_at DESC LIMIT 10
  `).all(cid);

  return NextResponse.json({ requests, jobs, attempts, supplierOrders, guillevinAccount, hasPayment, stuckRequests });
}

// POST — Retry stuck approved requests (re-trigger job creation)
export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin seulement' }, { status: 403 });
  }

  const db = getDb();
  const cid = ctx.companyId;
  if (!cid) {
    return NextResponse.json({ error: 'Aucune compagnie' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const requestId = body.requestId;

  if (!requestId) {
    return NextResponse.json({ error: 'requestId requis' }, { status: 400 });
  }

  // Verify the request is approved and has no job
  const request = db.prepare(
    "SELECT id, status FROM requests WHERE id = ? AND company_id = ? AND status = 'approved'"
  ).get(requestId, cid) as any;

  if (!request) {
    return NextResponse.json({ error: 'Demande non trouvée ou pas approuvée' }, { status: 404 });
  }

  const existingJob = db.prepare(
    "SELECT id FROM order_jobs WHERE request_id = ? AND company_id = ?"
  ).get(requestId, cid);

  if (existingJob) {
    return NextResponse.json({ error: 'Un job existe déjà pour cette demande' }, { status: 400 });
  }

  try {
    await triggerApproval(requestId, cid, db);
    return NextResponse.json({ ok: true, message: 'Job créé avec succès' });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erreur' }, { status: 500 });
  }
}
