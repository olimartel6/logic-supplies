import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }

  const db = getDb();
  const cid = session.companyId;

  // User info
  const settings = db.prepare('SELECT inventory_enabled, marketing_enabled FROM company_settings WHERE company_id = ?').get(cid) as any;
  const userRow = db.prepare('SELECT language FROM users WHERE id = ?').get(session.userId) as any;

  // Requests for this worker
  const requests = db.prepare(`
    SELECT r.*, j.name as job_site_name, u.name as worker_name,
           pu.name as picked_up_by_name, pj.name as picked_up_job_site_name
    FROM requests r
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    LEFT JOIN users u ON r.worker_id = u.id
    LEFT JOIN users pu ON r.picked_up_by = pu.id
    LEFT JOIN job_sites pj ON r.picked_up_job_site_id = pj.id
    WHERE r.worker_id = ? AND r.company_id = ?
    ORDER BY r.created_at DESC
    LIMIT 100
  `).all(session.userId, cid);

  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      role: session.role,
      inventoryEnabled: !!settings?.inventory_enabled,
      marketingEnabled: !!settings?.marketing_enabled,
      language: userRow?.language ?? 'fr',
    },
    requests,
  });
}
