import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { triggerApproval } from '@/lib/approval';
import { sendStatusEmail } from '@/lib/email';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { status, office_comment, delivery_override } = await req.json();
  const db = getDb();

  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Contexte entreprise manquant' }, { status: 400 });
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
