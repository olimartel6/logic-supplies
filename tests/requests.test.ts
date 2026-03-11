import { describe, it, expect } from 'vitest';
import { getDb } from '@/lib/db';

describe('Requests CRUD', () => {
  it('inserts and reads back a request', () => {
    const db = getDb();

    // Create a job site first
    db.prepare(`
      INSERT INTO job_sites (id, company_id, name, address)
      VALUES (1, 1, 'Chantier A', '456 Main St')
    `).run();

    // Insert a request
    const result = db.prepare(`
      INSERT INTO requests (company_id, product, quantity, unit, job_site_id, worker_id, status)
      VALUES (1, 'Fil 14/2 NMD90', 10, 'rouleau', 1, 1, 'pending')
    `).run();

    const requestId = result.lastInsertRowid;

    // Read it back
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as any;
    expect(request).toBeDefined();
    expect(request.product).toBe('Fil 14/2 NMD90');
    expect(request.quantity).toBe(10);
    expect(request.unit).toBe('rouleau');
    expect(request.status).toBe('pending');
    expect(request.company_id).toBe(1);
  });

  it('updates request status', () => {
    const db = getDb();

    const result = db.prepare(`
      INSERT INTO requests (company_id, product, quantity, unit, status)
      VALUES (1, 'Disjoncteur 15A', 5, 'unité', 'pending')
    `).run();

    const requestId = result.lastInsertRowid;

    db.prepare(`
      UPDATE requests SET status = 'approved', decision_date = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `).run(requestId, 1);

    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as any;
    expect(updated.status).toBe('approved');
    expect(updated.decision_date).toBeTruthy();
  });

  it('deletes a request', () => {
    const db = getDb();

    const result = db.prepare(`
      INSERT INTO requests (company_id, product, quantity, unit, status)
      VALUES (1, 'Marrette jaune', 100, 'unité', 'pending')
    `).run();

    const requestId = result.lastInsertRowid;

    db.prepare('DELETE FROM requests WHERE id = ? AND company_id = ?').run(requestId, 1);

    const deleted = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    expect(deleted).toBeUndefined();
  });

  it('enforces tenant isolation between companies', () => {
    const db = getDb();

    // Create a second company
    db.prepare(`
      INSERT INTO companies (id, name, subscription_status) VALUES (2, 'Other Company', 'active')
    `).run();

    // Insert a request for company 1
    db.prepare(`
      INSERT INTO requests (company_id, product, quantity, unit, status)
      VALUES (1, 'Boîte 4x4', 20, 'unité', 'pending')
    `).run();

    // Insert a request for company 2
    db.prepare(`
      INSERT INTO requests (company_id, product, quantity, unit, status)
      VALUES (2, 'Conduit EMT 1/2', 50, 'longueur', 'pending')
    `).run();

    // Query for company 1 only
    const company1Requests = db.prepare('SELECT * FROM requests WHERE company_id = ?').all(1) as any[];
    expect(company1Requests).toHaveLength(1);
    expect(company1Requests[0].product).toBe('Boîte 4x4');

    // Query for company 2 only
    const company2Requests = db.prepare('SELECT * FROM requests WHERE company_id = ?').all(2) as any[];
    expect(company2Requests).toHaveLength(1);
    expect(company2Requests[0].product).toBe('Conduit EMT 1/2');

    // Company 2 cannot see company 1 requests
    const crossTenant = db.prepare('SELECT * FROM requests WHERE company_id = ? AND product = ?').get(2, 'Boîte 4x4');
    expect(crossTenant).toBeUndefined();
  });
});
