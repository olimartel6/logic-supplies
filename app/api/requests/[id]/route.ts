import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { sendStatusEmail, sendOrderConfirmationEmail, sendCartNotificationEmail, sendBudgetAlertEmail } from '@/lib/email';
import { selectAndOrder } from '@/lib/supplier-router';
import { randomUUID } from 'crypto';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { status, office_comment } = await req.json();
  const db = getDb();

  db.prepare(`
    UPDATE requests SET status = ?, office_comment = ?, decision_date = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?
  `).run(status, office_comment || '', id, ctx.companyId);

  const request = db.prepare(`
    SELECT r.*, u.email as electrician_email, u.name as electrician_name,
           j.name as job_site_name, j.address as job_site_address
    FROM requests r
    LEFT JOIN users u ON r.electrician_id = u.id
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    WHERE r.id = ? AND r.company_id = ?
  `).get(id, ctx.companyId) as any;

  // ─── Budget tracking (synchrone) ───
  if (status === 'approved' && request?.job_site_id) {
    try {
      const settings = db.prepare('SELECT large_order_threshold FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;
      const threshold: number = settings?.large_order_threshold ?? 2000;

      const productRow = db.prepare(
        "SELECT price FROM products WHERE LOWER(name) LIKE LOWER(?) ORDER BY price ASC LIMIT 1"
      ).get(`%${request.product}%`) as any;
      const unitPrice: number = productRow?.price ?? 0;
      const orderAmount: number = unitPrice * request.quantity;

      if (orderAmount > 0) {
        db.prepare('UPDATE job_sites SET budget_committed = COALESCE(budget_committed, 0) + ? WHERE id = ? AND company_id = ?')
          .run(orderAmount, request.job_site_id, ctx.companyId);
      }

      const site = db.prepare(
        'SELECT budget_total, budget_committed FROM job_sites WHERE id = ? AND company_id = ?'
      ).get(request.job_site_id, ctx.companyId) as any;

      const officeEmails = db.prepare(
        "SELECT email FROM users WHERE role IN ('office', 'admin') AND company_id = ?"
      ).all(ctx.companyId) as { email: string }[];

      if (site?.budget_total && orderAmount > 0) {
        const prevCommitted = (site.budget_committed ?? 0) - orderAmount;
        const oldPct = (prevCommitted / site.budget_total) * 100;
        const newPct = ((site.budget_committed ?? 0) / site.budget_total) * 100;

        if (oldPct < 80 && newPct >= 80 && newPct < 100) {
          db.prepare(
            "INSERT INTO budget_alerts (company_id, job_site_id, type, amount, message) VALUES (?, ?, '80_percent', ?, ?)"
          ).run(ctx.companyId, request.job_site_id, site.budget_committed, `80% du budget atteint pour ${request.job_site_name}`);
          for (const u of officeEmails) {
            sendBudgetAlertEmail(u.email, {
              type: '80_percent', jobSite: request.job_site_name,
              committed: site.budget_committed, total: site.budget_total,
            }).catch(console.error);
          }
        }

        if (oldPct < 100 && newPct >= 100) {
          db.prepare(
            "INSERT INTO budget_alerts (company_id, job_site_id, type, amount, message) VALUES (?, ?, '100_percent', ?, ?)"
          ).run(ctx.companyId, request.job_site_id, site.budget_committed, `Budget dépassé pour ${request.job_site_name}`);
          for (const u of officeEmails) {
            sendBudgetAlertEmail(u.email, {
              type: '100_percent', jobSite: request.job_site_name,
              committed: site.budget_committed, total: site.budget_total,
            }).catch(console.error);
          }
        }
      }

      if (orderAmount > threshold) {
        db.prepare(
          "INSERT INTO budget_alerts (company_id, job_site_id, type, amount, message) VALUES (?, ?, 'large_order', ?, ?)"
        ).run(ctx.companyId, request.job_site_id, orderAmount, `Commande de ${orderAmount.toFixed(2)}$ pour ${request.product}`);
        const officeEmailsForLarge = db.prepare(
          "SELECT email FROM users WHERE role IN ('office', 'admin') AND company_id = ?"
        ).all(ctx.companyId) as { email: string }[];
        for (const u of officeEmailsForLarge) {
          sendBudgetAlertEmail(u.email, {
            type: 'large_order', jobSite: request.job_site_name,
            amount: orderAmount, product: request.product, threshold,
          }).catch(console.error);
        }
      }
    } catch (err) {
      console.error('Budget tracking error:', err);
    }
  }
  // ─── Fin budget tracking ───

  // Send status email to electrician
  if (request?.electrician_email) {
    sendStatusEmail(request.electrician_email, {
      product: request.product,
      quantity: request.quantity,
      unit: request.unit,
      status,
      officeComment: office_comment,
    }).catch(console.error);
  }

  // If approved, trigger multi-supplier order async
  if (status === 'approved') {
    const settings = db.prepare('SELECT supplier_preference FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;
    const preference: 'cheapest' | 'fastest' = settings?.supplier_preference || 'cheapest';

    ;(async () => {
      try {
        const { result, supplier, reason } = await selectAndOrder(
          preference,
          request.job_site_address || '',
          request.product,
          request.quantity,
          request.supplier || undefined,
          ctx.companyId,
        );

        const cancelToken = randomUUID();
        const cancelExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

        const orderStatus = result.success ? 'confirmed' : result.inCart ? 'pending' : 'failed';
        db.prepare(`
          INSERT INTO supplier_orders (company_id, request_id, supplier, supplier_order_id, status, cancel_token, cancel_expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(ctx.companyId, id, supplier, result.orderId || null, orderStatus, cancelToken, cancelExpiresAt);

        const officeUsers = db.prepare("SELECT email FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(ctx.companyId) as { email: string }[];
        const allEmails = [...officeUsers.map(u => u.email), request.electrician_email].filter(Boolean);

        if (result.success) {
          for (const email of allEmails) {
            sendOrderConfirmationEmail(email, {
              product: request.product,
              quantity: request.quantity,
              unit: request.unit,
              jobSite: request.job_site_name,
              supplier,
              reason,
              orderId: result.orderId!,
              cancelToken,
            }).catch(console.error);
          }
        } else if (result.inCart) {
          for (const email of allEmails) {
            sendCartNotificationEmail(email, {
              product: request.product,
              quantity: request.quantity,
              unit: request.unit,
              jobSite: request.job_site_name,
              supplier,
              reason,
            }).catch(console.error);
          }
        }
      } catch (err) {
        console.error('Supplier ordering failed:', err);
      }
    })();
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
