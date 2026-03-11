import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const db = getDb();

  const elec = db.prepare("SELECT id FROM users WHERE company_id = ? AND role = 'worker' LIMIT 1").get(ctx.companyId) as { id: number } | undefined;
  const jobSite = db.prepare("SELECT id FROM job_sites WHERE company_id = ? LIMIT 1").get(ctx.companyId) as { id: number } | undefined;

  if (!elec || !jobSite) {
    return NextResponse.json({ error: 'Need at least 1 worker and 1 job site' }, { status: 400 });
  }

  const result = db.prepare(`
    INSERT INTO requests (company_id, product, quantity, unit, job_site_id, worker_id, urgency, note, status, tracking_status, supplier)
    VALUES (?, 'Fil 14/2 NMD90 150m', 3, 'rouleau', ?, ?, 0, 'Commande test pour suivi', 'approved', 'ordered', 'Lumen')
  `).run(ctx.companyId, jobSite.id, elec.id);

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const db = getDb();

  // Clean up test inventory item + stock + logs
  const item = db.prepare(
    "SELECT id FROM inventory_items WHERE company_id = ? AND LOWER(name) = LOWER('Fil 14/2 NMD90 150m')"
  ).get(ctx.companyId) as { id: number } | undefined;

  if (item) {
    db.prepare('DELETE FROM inventory_logs WHERE item_id = ?').run(item.id);
    db.prepare('DELETE FROM inventory_stock WHERE item_id = ?').run(item.id);
    db.prepare('DELETE FROM inventory_items WHERE id = ?').run(item.id);
  }

  // Clean up test requests
  const deleted = db.prepare(
    "DELETE FROM requests WHERE company_id = ? AND product = 'Fil 14/2 NMD90 150m'"
  ).run(ctx.companyId);

  return NextResponse.json({ ok: true, itemDeleted: !!item, requestsDeleted: deleted.changes });
}
