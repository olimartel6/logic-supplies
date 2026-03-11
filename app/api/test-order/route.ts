import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { placeOrderDryRun } from '@/lib/supplier-mock';

const TEST_NOTE = '[TEST-DRY-RUN]';

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin seulement' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const product: string = body.product || 'Fil 14/2 NMD90 150m';
  const supplier: string = body.supplier || 'lumen';
  const quantity: number = body.quantity || 1;

  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Aucune compagnie associée' }, { status: 400 });
  }

  // Run the dry-run mock directly — no job queue needed
  try {
    const result = await placeOrderDryRun(supplier, product, quantity);
    return NextResponse.json({
      ok: true,
      result: {
        supplier,
        product,
        quantity,
        success: result.success,
        orderId: result.orderId || null,
        log: result.log || [],
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || 'Erreur inconnue',
    }, { status: 500 });
  }
}

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin seulement' }, { status: 403 });
  }
  // No longer needed — results are returned directly from POST
  return NextResponse.json({ results: [] });
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

  // Clean up old test requests and related data
  const testRequests = db.prepare(
    "SELECT id FROM requests WHERE company_id = ? AND note = ?"
  ).all(ctx.companyId, TEST_NOTE) as { id: number }[];

  const ids = testRequests.map(r => r.id);

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
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
