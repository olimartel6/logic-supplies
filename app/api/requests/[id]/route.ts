import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { triggerApproval } from '@/lib/approval';
import { sendStatusEmail, sendOrderTrackingEmail } from '@/lib/email';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { status, office_comment, delivery_override, supplier_override } = await req.json();
  const db = getDb();

  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Contexte entreprise manquant' }, { status: 400 });
  }

  // Update supplier if admin changed it before approving
  if (supplier_override) {
    const currentReq = db.prepare('SELECT supplier FROM requests WHERE id = ? AND company_id = ?').get(id, ctx.companyId) as any;
    if (currentReq && currentReq.supplier !== supplier_override) {
      const user = db.prepare('SELECT name FROM users WHERE id = ?').get(ctx.userId) as any;
      db.prepare('UPDATE requests SET supplier = ?, supplier_modified_by = ? WHERE id = ? AND company_id = ?')
        .run(supplier_override, user?.name || 'Admin', id, ctx.companyId);
    }
  }

  if (status === 'approved') {
    await triggerApproval(parseInt(id, 10), ctx.companyId, db, delivery_override, office_comment);
  } else {
    // rejected
    db.prepare(`
      UPDATE requests SET status = ?, office_comment = ?, decision_date = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?
    `).run(status, office_comment || '', id, ctx.companyId);

    const request = db.prepare(`
      SELECT r.*, u.email as electrician_email, u.language as electrician_language FROM requests r
      LEFT JOIN users u ON r.electrician_id = u.id
      WHERE r.id = ? AND r.company_id = ?
    `).get(id, ctx.companyId) as any;

    if (request?.electrician_email) {
      sendStatusEmail(request.electrician_email, {
        product: request.product, quantity: request.quantity, unit: request.unit,
        status, officeComment: office_comment,
      }, (request.electrician_language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const db = getDb();

  // Verify ownership before deleting
  const req_row = db.prepare('SELECT id FROM requests WHERE id = ? AND company_id = ?').get(id, ctx.companyId);
  if (!req_row) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });

  db.prepare('DELETE FROM supplier_orders WHERE request_id = ?').run(id);
  db.prepare('DELETE FROM purchase_order_logs WHERE request_id = ?').run(id);
  db.prepare('DELETE FROM requests WHERE id = ? AND company_id = ?').run(id, ctx.companyId);

  return NextResponse.json({ ok: true });
}

// PUT — Update tracking status (ordered → shipped → received)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { tracking_status } = await req.json();
  const db = getDb();

  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Contexte entreprise manquant' }, { status: 400 });
  }

  const validTransitions: Record<string, string[]> = {
    ordered: ['shipped'],
    shipped: ['received'],
  };

  const request = db.prepare(`
    SELECT r.*, u.email as electrician_email, u.name as electrician_name,
           u.language as electrician_language,
           j.name as job_site_name,
           so.supplier as order_supplier, so.supplier_order_id as order_id
    FROM requests r
    LEFT JOIN users u ON r.electrician_id = u.id
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    LEFT JOIN supplier_orders so ON so.request_id = r.id
    WHERE r.id = ? AND r.company_id = ? AND r.status = 'approved'
  `).get(id, ctx.companyId) as any;

  if (!request) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });

  const currentTracking = request.tracking_status || 'ordered';
  const allowed = validTransitions[currentTracking];
  if (!allowed || !allowed.includes(tracking_status)) {
    return NextResponse.json({ error: 'Transition invalide' }, { status: 400 });
  }

  db.prepare("UPDATE requests SET tracking_status = ? WHERE id = ? AND company_id = ?")
    .run(tracking_status, id, ctx.companyId);

  // Auto-add to inventory when received
  if (tracking_status === 'received') {
    const doAdd = db.transaction(() => {
      // Ensure "Bureau" location exists
      let location = db.prepare(
        "SELECT id FROM inventory_locations WHERE company_id = ? AND type = 'warehouse' AND name = 'Bureau'"
      ).get(ctx.companyId) as { id: number } | undefined;
      if (!location) {
        const res = db.prepare(
          "INSERT INTO inventory_locations (company_id, name, type) VALUES (?, 'Bureau', 'warehouse')"
        ).run(ctx.companyId);
        location = { id: Number(res.lastInsertRowid) };
      }

      // Find or create inventory item by name
      let item = db.prepare(
        "SELECT id FROM inventory_items WHERE company_id = ? AND LOWER(name) = LOWER(?)"
      ).get(ctx.companyId, request.product) as { id: number } | undefined;
      if (!item) {
        const barcode = `CMD-${ctx.companyId}-${Date.now()}`;
        const res = db.prepare(
          "INSERT INTO inventory_items (company_id, barcode, name, unit) VALUES (?, ?, ?, ?)"
        ).run(ctx.companyId, barcode, request.product, request.unit || 'unité');
        item = { id: Number(res.lastInsertRowid) };
      }

      // Add stock
      db.prepare(`
        INSERT INTO inventory_stock (item_id, location_id, company_id, quantity)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(item_id, location_id) DO UPDATE SET
          quantity = quantity + excluded.quantity,
          updated_at = CURRENT_TIMESTAMP
      `).run(item.id, location.id, ctx.companyId, request.quantity);

      // Log entry
      db.prepare(`
        INSERT INTO inventory_logs (company_id, user_id, item_id, location_id, action, quantity, note)
        VALUES (?, ?, ?, ?, 'entry', ?, ?)
      `).run(ctx.companyId, ctx.userId, item.id, location.id, request.quantity,
        `Commande reçue #${request.id} — ${request.order_supplier || request.supplier || 'fournisseur'}`);
    });
    doAdd();
  }

  // Send tracking email
  if (request.electrician_email) {
    sendOrderTrackingEmail(request.electrician_email, {
      product: request.product, quantity: request.quantity, unit: request.unit,
      supplier: request.order_supplier || request.supplier || '',
      orderId: request.order_id || '', trackingStatus: tracking_status,
      jobSite: request.job_site_name || '',
    }, (request.electrician_language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
