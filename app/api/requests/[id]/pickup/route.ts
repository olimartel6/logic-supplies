import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const { id } = await params;
  const { job_site_id } = await req.json();
  const db = getDb();

  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Contexte entreprise manquant' }, { status: 400 });
  }

  const request = db.prepare(`
    SELECT r.*, so.supplier as order_supplier
    FROM requests r
    LEFT JOIN supplier_orders so ON so.request_id = r.id
    WHERE r.id = ? AND r.company_id = ? AND r.status = 'approved' AND r.tracking_status = 'received'
      AND r.picked_up_by IS NULL
  `).get(id, ctx.companyId) as any;

  if (!request) return NextResponse.json({ error: 'Non trouvé ou déjà récupéré' }, { status: 404 });

  const doPickup = db.transaction(() => {
    // Mark as picked up
    db.prepare(`
      UPDATE requests SET picked_up_by = ?, picked_up_at = CURRENT_TIMESTAMP, picked_up_job_site_id = ?
      WHERE id = ? AND company_id = ?
    `).run(ctx.userId, job_site_id || request.job_site_id, id, ctx.companyId);

    // Decrement inventory stock at Bureau
    const item = db.prepare(
      "SELECT id FROM inventory_items WHERE company_id = ? AND LOWER(name) = LOWER(?)"
    ).get(ctx.companyId, request.product) as { id: number } | undefined;

    const location = db.prepare(
      "SELECT id FROM inventory_locations WHERE company_id = ? AND type = 'warehouse' AND name = 'Bureau'"
    ).get(ctx.companyId) as { id: number } | undefined;

    if (item && location) {
      const stock = db.prepare(
        'SELECT quantity FROM inventory_stock WHERE item_id = ? AND location_id = ?'
      ).get(item.id, location.id) as { quantity: number } | undefined;

      const qtyToRemove = Math.min(request.quantity, stock?.quantity || 0);
      if (qtyToRemove > 0) {
        db.prepare(
          'UPDATE inventory_stock SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ? AND location_id = ?'
        ).run(qtyToRemove, item.id, location.id);

        db.prepare(`
          INSERT INTO inventory_logs (company_id, user_id, item_id, location_id, action, quantity, note)
          VALUES (?, ?, ?, ?, 'exit', ?, ?)
        `).run(ctx.companyId, ctx.userId, item.id, location.id, qtyToRemove,
          `Récupéré — commande #${request.id}`);
      }
    }
  });

  try {
    doPickup();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
