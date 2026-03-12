import type Database from 'better-sqlite3';
import { sendStatusEmail, sendBudgetAlertEmail } from './email';
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
  dryRun?: boolean,
) {
  db.prepare(`
    UPDATE requests SET status = 'approved', office_comment = ?, decision_date = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).run(office_comment || '', requestId, companyId);

  const request = db.prepare(`
    SELECT r.*, u.email as worker_email, u.name as worker_name,
           u.language as worker_language,
           j.name as job_site_name, j.address as job_site_address
    FROM requests r
    LEFT JOIN users u ON r.worker_id = u.id
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    WHERE r.id = ? AND r.company_id = ?
  `).get(requestId, companyId) as any;

  if (!request) return;

  // ─── Budget tracking ───
  if (request.job_site_id) {
    try {
      const settings = db.prepare('SELECT large_order_threshold FROM company_settings WHERE company_id = ?').get(companyId) as any;
      const threshold: number = settings?.large_order_threshold ?? 2000;

      // Stage 1: exact name match on the request's supplier
      let productRow = db.prepare(
        "SELECT price FROM products WHERE LOWER(name) = LOWER(?) AND supplier = ? ORDER BY price ASC LIMIT 1"
      ).get(request.product, request.supplier || 'lumen') as any;

      // Stage 2: exact name match on any supplier
      if (!productRow) {
        productRow = db.prepare(
          "SELECT price FROM products WHERE LOWER(name) = LOWER(?) ORDER BY price ASC LIMIT 1"
        ).get(request.product) as any;
      }

      // Stage 3: LIKE fallback scoped to request's supplier
      if (!productRow) {
        productRow = db.prepare(
          "SELECT price FROM products WHERE LOWER(name) LIKE LOWER(?) AND supplier = ? ORDER BY price ASC LIMIT 1"
        ).get(`%${request.product}%`, request.supplier || 'lumen') as any;
      }
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
        "SELECT email, language FROM users WHERE role IN ('office', 'admin') AND company_id = ?"
      ).all(companyId) as { email: string; language: string }[];

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
            }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
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
            }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
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
          }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
        }
      }
    } catch (err) {
      console.error('Budget tracking error:', err);
    }
  }

  // Send status email to worker
  if (request.worker_email) {
    sendStatusEmail(request.worker_email, {
      product: request.product,
      quantity: request.quantity,
      unit: request.unit,
      status: 'approved',
      officeComment: office_comment,
    }, (request.worker_language as 'fr' | 'en' | 'es') || 'fr', dryRun).catch(console.error);
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
    try {
      payment = {
        cardHolder: pm.card_holder,
        cardNumber: decrypt(pm.card_number_encrypted),
        cardExpiry: pm.card_expiry,
        cardCvv: decrypt(pm.card_cvv_encrypted),
      };
    } catch (err) {
      console.error('[triggerApproval] Erreur déchiffrement paiement:', err);
      // Continue without payment — job will fail gracefully instead of never being created
    }
  }

  // Enqueue order job instead of executing directly (with retry support)
  try {
    const jobPayload = JSON.stringify({
      product: request.product,
      quantity: request.quantity,
      unit: request.unit,
      supplier: request.supplier || null,
      preference,
      jobSiteAddress: request.job_site_address || '',
      jobSiteName: request.job_site_name || '',
      deliveryAddress: deliveryAddress || '',
      payment,
      workerEmail: request.worker_email || '',
      workerName: request.worker_name || '',
      workerLanguage: request.worker_language || 'fr',
      officeComment: office_comment,
      ...(dryRun ? { dryRun: true } : {}),
    });

    db.prepare(`
      INSERT INTO order_jobs (company_id, request_id, status, payload)
      VALUES (?, ?, 'pending', ?)
    `).run(companyId, requestId, jobPayload);
  } catch (err) {
    console.error('[triggerApproval] Erreur création order_job:', err);
    throw err; // Re-throw so caller knows approval partially failed
  }
}
