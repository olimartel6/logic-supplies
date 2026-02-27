import type Database from 'better-sqlite3';
import { sendStatusEmail, sendOrderConfirmationEmail, sendCartNotificationEmail, sendBudgetAlertEmail } from './email';
import { selectAndOrder } from './supplier-router';
import { randomUUID } from 'crypto';
import { decrypt } from './encrypt';
import type { PaymentInfo } from './lumen';

/**
 * Approve a request and trigger auto-order.
 * Called both from the manual approval PATCH route and from POST /api/requests for auto-approve users.
 */
export async function triggerApproval(
  requestId: number | bigint,
  companyId: number,
  db: Database.Database,
  delivery_override?: 'office' | 'jobsite',
  office_comment?: string,
) {
  db.prepare(`
    UPDATE requests SET status = 'approved', office_comment = ?, decision_date = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).run(office_comment || '', requestId, companyId);

  const request = db.prepare(`
    SELECT r.*, u.email as electrician_email, u.name as electrician_name,
           j.name as job_site_name, j.address as job_site_address
    FROM requests r
    LEFT JOIN users u ON r.electrician_id = u.id
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    WHERE r.id = ? AND r.company_id = ?
  `).get(requestId, companyId) as any;

  if (!request) return;

  // ─── Budget tracking ───
  if (request.job_site_id) {
    try {
      const settings = db.prepare('SELECT large_order_threshold FROM company_settings WHERE company_id = ?').get(companyId) as any;
      const threshold: number = settings?.large_order_threshold ?? 2000;

      const productRow = db.prepare(
        "SELECT price FROM products WHERE LOWER(name) LIKE LOWER(?) ORDER BY price ASC LIMIT 1"
      ).get(`%${request.product}%`) as any;
      const unitPrice: number = productRow?.price ?? 0;
      const orderAmount: number = unitPrice * request.quantity;

      if (orderAmount > 0) {
        db.prepare('UPDATE job_sites SET budget_committed = COALESCE(budget_committed, 0) + ? WHERE id = ? AND company_id = ?')
          .run(orderAmount, request.job_site_id, companyId);
      }

      const site = db.prepare(
        'SELECT budget_total, budget_committed FROM job_sites WHERE id = ? AND company_id = ?'
      ).get(request.job_site_id, companyId) as any;

      const officeEmails = db.prepare(
        "SELECT email FROM users WHERE role IN ('office', 'admin') AND company_id = ?"
      ).all(companyId) as { email: string }[];

      if (site?.budget_total && orderAmount > 0) {
        const prevCommitted = (site.budget_committed ?? 0) - orderAmount;
        const oldPct = (prevCommitted / site.budget_total) * 100;
        const newPct = ((site.budget_committed ?? 0) / site.budget_total) * 100;

        if (oldPct < 80 && newPct >= 80 && newPct < 100) {
          db.prepare(
            "INSERT INTO budget_alerts (company_id, job_site_id, type, amount, message) VALUES (?, ?, '80_percent', ?, ?)"
          ).run(companyId, request.job_site_id, site.budget_committed, `80% du budget atteint pour ${request.job_site_name}`);
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
          ).run(companyId, request.job_site_id, site.budget_committed, `Budget dépassé pour ${request.job_site_name}`);
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
        ).run(companyId, request.job_site_id, orderAmount, `Commande de ${orderAmount.toFixed(2)}$ pour ${request.product}`);
        for (const u of officeEmails) {
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

  // Send status email to electrician
  if (request.electrician_email) {
    sendStatusEmail(request.electrician_email, {
      product: request.product,
      quantity: request.quantity,
      unit: request.unit,
      status: 'approved',
      officeComment: office_comment,
    }).catch(console.error);
  }

  // Trigger auto-order async
  const companySettings = db.prepare('SELECT supplier_preference, office_address, default_delivery FROM company_settings WHERE company_id = ?').get(companyId) as any;
  const preference: 'cheapest' | 'fastest' = companySettings?.supplier_preference || 'cheapest';
  const deliveryMode: 'office' | 'jobsite' = delivery_override || companySettings?.default_delivery || 'office';
  const deliveryAddress: string =
    deliveryMode === 'office'
      ? (companySettings?.office_address || '')
      : (request.job_site_address || companySettings?.office_address || '');

  let payment: PaymentInfo | undefined;
  const pm = db.prepare('SELECT card_holder, card_number_encrypted, card_expiry, card_last4, card_cvv_encrypted FROM company_payment_methods WHERE company_id = ?').get(companyId) as any;
  if (pm) {
    payment = {
      cardHolder: pm.card_holder,
      cardNumber: decrypt(pm.card_number_encrypted),
      cardExpiry: pm.card_expiry,
      cardCvv: decrypt(pm.card_cvv_encrypted),
    };
  }

  ;(async () => {
    try {
      const { result, supplier, reason } = await selectAndOrder(
        preference,
        request.job_site_address || '',
        request.product,
        request.quantity,
        request.supplier || undefined,
        companyId,
        deliveryAddress || undefined,
        payment,
      );

      const cancelToken = randomUUID();
      const cancelExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const orderStatus = result.success ? 'confirmed' : result.inCart ? 'pending' : 'failed';

      db.prepare(`
        INSERT INTO supplier_orders (company_id, request_id, supplier, supplier_order_id, status, cancel_token, cancel_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, requestId, supplier, result.orderId || null, orderStatus, cancelToken, cancelExpiresAt);

      const officeUsers = db.prepare("SELECT email FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(companyId) as { email: string }[];
      const allEmails = [...officeUsers.map(u => u.email), request.electrician_email].filter(Boolean);

      if (result.success) {
        for (const email of allEmails) {
          sendOrderConfirmationEmail(email, {
            product: request.product, quantity: request.quantity, unit: request.unit,
            jobSite: request.job_site_name, supplier, reason, orderId: result.orderId!, cancelToken,
          }).catch(console.error);
        }
      } else if (result.inCart) {
        for (const email of allEmails) {
          sendCartNotificationEmail(email, {
            product: request.product, quantity: request.quantity, unit: request.unit,
            jobSite: request.job_site_name, supplier, reason,
          }).catch(console.error);
        }
      }
    } catch (err) {
      console.error('Supplier ordering failed:', err);
    }
  })();
}
