import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

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

  return NextResponse.json({ requests, jobs, attempts, supplierOrders, guillevinAccount, hasPayment });
}
