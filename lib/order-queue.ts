import type Database from 'better-sqlite3';
import { selectAndOrder } from './supplier-router';
import { sendOrderConfirmationEmail, sendCartNotificationEmail, sendOrderFailureEmail, sendOrderTrackingEmail } from './email';
import { randomUUID } from 'crypto';
import type { PaymentInfo } from './lumen';

interface JobPayload {
  product: string;
  quantity: number;
  unit: string;
  supplier: string | null;
  preference: 'cheapest' | 'fastest';
  jobSiteAddress: string;
  jobSiteName: string;
  deliveryAddress: string;
  payment?: PaymentInfo;
  workerEmail: string;
  workerName: string;
  workerLanguage: string;
  officeComment?: string;
}

const ORDER_GLOBAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Process a single order job: call selectAndOrder, record attempt, update status.
 */
export async function processOrderJob(db: Database.Database, job: any): Promise<void> {
  const payload: JobPayload = JSON.parse(job.payload);
  const startMs = Date.now();

  db.prepare("UPDATE order_jobs SET status = 'processing', attempts = attempts + 1 WHERE id = ?").run(job.id);

  let orderError: string | null = null;
  let orderStatus: 'confirmed' | 'pending' | 'failed' = 'failed';
  let result: any = null;
  let supplier = payload.supplier || 'unknown';
  let reason = '';

  try {
    const orderPromise = selectAndOrder(
      payload.preference,
      payload.jobSiteAddress,
      payload.product,
      payload.quantity,
      payload.supplier || undefined,
      job.company_id,
      payload.deliveryAddress || undefined,
      payload.payment,
    );

    const ordered = await new Promise<Awaited<ReturnType<typeof selectAndOrder>>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timeout global: commande non complétée après 5 minutes')),
        ORDER_GLOBAL_TIMEOUT_MS,
      );
      orderPromise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });

    result = ordered.result;
    supplier = ordered.supplier;
    reason = ordered.reason;
    orderStatus = result.success ? 'confirmed' : result.inCart ? 'pending' : 'failed';
    orderError = result.error || null;
  } catch (err: any) {
    console.error('[OrderQueue] Job failed:', err);
    orderError = err?.message || 'Erreur inconnue';
    orderStatus = 'failed';
  }

  const durationMs = Date.now() - startMs;

  // Record attempt
  db.prepare(`
    INSERT INTO order_attempts (order_job_id, company_id, request_id, supplier, attempt_number, status, duration_ms, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id, job.company_id, job.request_id, supplier, job.attempts + 1,
    orderStatus === 'confirmed' ? 'success' : orderError?.toLowerCase().includes('timeout') ? 'timeout' : 'failed',
    durationMs, orderError,
  );

  if (orderStatus !== 'failed') {
    // Success or in-cart — mark job done
    db.prepare("UPDATE order_jobs SET status = 'done', last_error = NULL WHERE id = ?").run(job.id);

    // Write supplier_orders row
    const cancelToken = randomUUID();
    const cancelExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO supplier_orders (company_id, request_id, supplier, supplier_order_id, status, cancel_token, cancel_expires_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(job.company_id, job.request_id, supplier, result?.orderId || null, orderStatus, cancelToken, cancelExpiresAt, null);

    if (orderStatus === 'confirmed') {
      db.prepare("UPDATE requests SET tracking_status = 'ordered' WHERE id = ? AND company_id = ?")
        .run(job.request_id, job.company_id);

      if (payload.workerEmail) {
        sendOrderTrackingEmail(payload.workerEmail, {
          product: payload.product, quantity: payload.quantity, unit: payload.unit,
          supplier, orderId: result?.orderId || '', trackingStatus: 'ordered',
          jobSite: payload.jobSiteName || '',
        }, (payload.workerLanguage as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
      }
    }

    // Notify
    const officeUsers = db.prepare("SELECT email, language FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(job.company_id) as { email: string; language: string }[];
    const allRecipients = [
      ...officeUsers,
      { email: payload.workerEmail, language: payload.workerLanguage },
    ].filter(u => u.email);

    if (orderStatus === 'confirmed' && result) {
      for (const u of allRecipients) {
        sendOrderConfirmationEmail(u.email, {
          product: payload.product, quantity: payload.quantity, unit: payload.unit,
          jobSite: payload.jobSiteName, supplier, reason, orderId: result.orderId!, cancelToken,
        }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
      }
    } else if (orderStatus === 'pending' && result) {
      for (const u of allRecipients) {
        sendCartNotificationEmail(u.email, {
          product: payload.product, quantity: payload.quantity, unit: payload.unit,
          jobSite: payload.jobSiteName, supplier, reason,
        }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
      }
    }
  } else {
    // Failed — schedule retry or mark as final failure
    const currentAttempts = (job.attempts || 0) + 1;
    if (currentAttempts >= job.max_attempts) {
      db.prepare("UPDATE order_jobs SET status = 'failed', last_error = ? WHERE id = ?").run(orderError, job.id);

      // Write failed supplier_orders row
      db.prepare(`
        INSERT INTO supplier_orders (company_id, request_id, supplier, supplier_order_id, status, error_message)
        VALUES (?, ?, ?, NULL, 'failed', ?)
      `).run(job.company_id, job.request_id, supplier, orderError);

      // Notify office of final failure
      const officeUsers = db.prepare("SELECT email, language FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(job.company_id) as { email: string; language: string }[];
      for (const u of officeUsers) {
        sendOrderFailureEmail(u.email, {
          product: payload.product, quantity: payload.quantity, unit: payload.unit,
          jobSite: payload.jobSiteName, errorMessage: orderError || 'Erreur inconnue',
        }).catch(console.error);
      }
    } else {
      // Exponential backoff: 5min, 15min, 45min
      const backoffMinutes = 5 * Math.pow(3, currentAttempts - 1);
      const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
      db.prepare("UPDATE order_jobs SET status = 'pending', last_error = ?, next_attempt_at = ? WHERE id = ?")
        .run(orderError, nextAttempt, job.id);
      console.log(`[OrderQueue] Job ${job.id} retry #${currentAttempts + 1} scheduled in ${backoffMinutes}min`);
    }
  }
}
