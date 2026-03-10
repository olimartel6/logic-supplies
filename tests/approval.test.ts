import { describe, it, expect, vi } from 'vitest';
import { getDb } from '@/lib/db';

// Mock email to be a no-op
vi.mock('@/lib/email', () => ({
  sendStatusEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendCartNotificationEmail: vi.fn().mockResolvedValue(undefined),
  sendBudgetAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderFailureEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderTrackingEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock encrypt
vi.mock('@/lib/encrypt', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted-value'),
}));

import { triggerApproval } from '@/lib/approval';

describe('Approval Flow', () => {
  it('updates request status to approved', async () => {
    const db = getDb();

    // Create a job site
    db.prepare(`
      INSERT INTO job_sites (id, company_id, name, address)
      VALUES (1, 1, 'Chantier Test', '789 Test Ave')
    `).run();

    // Create a pending request
    const result = db.prepare(`
      INSERT INTO requests (company_id, product, quantity, unit, job_site_id, electrician_id, status, supplier)
      VALUES (1, 'Fil 14/2 NMD90', 5, 'rouleau', 1, 1, 'pending', 'lumen')
    `).run();

    const requestId = result.lastInsertRowid;

    // Call triggerApproval
    await triggerApproval(requestId, 1, db);

    // Verify status was updated to 'approved'
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as any;
    expect(request.status).toBe('approved');
  });

  it('stores office_comment when provided', async () => {
    const db = getDb();

    db.prepare(`
      INSERT INTO job_sites (id, company_id, name, address)
      VALUES (1, 1, 'Chantier B', '999 Rue Test')
    `).run();

    const result = db.prepare(`
      INSERT INTO requests (company_id, product, quantity, unit, job_site_id, electrician_id, status, supplier)
      VALUES (1, 'Disjoncteur 20A', 3, 'unité', 1, 1, 'pending', 'lumen')
    `).run();

    const requestId = result.lastInsertRowid;

    await triggerApproval(requestId, 1, db, undefined, 'Commande urgente');

    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as any;
    expect(request.status).toBe('approved');
    expect(request.office_comment).toBe('Commande urgente');
  });

  it('enqueues an order_jobs row for async processing', async () => {
    const db = getDb();

    db.prepare(`
      INSERT INTO job_sites (id, company_id, name, address)
      VALUES (1, 1, 'Chantier C', '100 Supplier Rd')
    `).run();

    const result = db.prepare(`
      INSERT INTO requests (company_id, product, quantity, unit, job_site_id, electrician_id, status, supplier)
      VALUES (1, 'Câble 12/2', 10, 'rouleau', 1, 1, 'pending', 'lumen')
    `).run();

    const requestId = result.lastInsertRowid;

    await triggerApproval(requestId, 1, db);

    // triggerApproval now enqueues an order_jobs row instead of calling selectAndOrder directly
    const job = db.prepare('SELECT * FROM order_jobs WHERE request_id = ?').get(requestId) as any;
    expect(job).toBeDefined();
    expect(job.company_id).toBe(1);
    expect(job.status).toBe('pending');

    // Verify the payload contains expected fields
    const payload = JSON.parse(job.payload);
    expect(payload.product).toBe('Câble 12/2');
    expect(payload.quantity).toBe(10);
    expect(payload.preference).toBe('cheapest');
  });
});
