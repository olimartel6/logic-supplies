import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { sendNewRequestEmail } from '@/lib/email';
import { triggerApproval } from '@/lib/approval';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const db = getDb();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';
  const dateFrom = url.searchParams.get('dateFrom') || '';
  const dateTo = url.searchParams.get('dateTo') || '';
  const offset = (page - 1) * limit;

  // Build dynamic WHERE clauses and params
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (ctx.role === 'worker') {
    conditions.push('r.worker_id = ?', 'r.company_id = ?');
    params.push(ctx.userId, ctx.companyId);
  } else {
    conditions.push('r.company_id = ?');
    params.push(ctx.companyId);
  }

  if (search) {
    conditions.push('(LOWER(r.product) LIKE LOWER(?) OR LOWER(j.name) LIKE LOWER(?))');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  const tracking = url.searchParams.get('tracking') || '';
  if (tracking) {
    conditions.push('r.tracking_status = ?');
    params.push(tracking);
  }
  if (dateFrom) {
    conditions.push('r.created_at >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("r.created_at <= ? || 'T23:59:59'");
    params.push(dateTo);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  let requests;
  let total: number;

  if (ctx.role === 'worker') {
    const countRow = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM requests r
      LEFT JOIN job_sites j ON r.job_site_id = j.id
      ${whereClause}
    `).get(...params) as { cnt: number };
    total = countRow.cnt;

    requests = db.prepare(`
      SELECT r.*, j.name as job_site_name, u.name as worker_name,
             pu.name as picked_up_by_name, pj.name as picked_up_job_site_name,
             (SELECT p.price FROM products p WHERE LOWER(p.name) LIKE '%' || LOWER(r.product) || '%' ORDER BY p.price ASC LIMIT 1) as unit_price
      FROM requests r
      LEFT JOIN job_sites j ON r.job_site_id = j.id
      LEFT JOIN users u ON r.worker_id = u.id
      LEFT JOIN users pu ON r.picked_up_by = pu.id
      LEFT JOIN job_sites pj ON r.picked_up_job_site_id = pj.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  } else {
    const countRow = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM requests r
      LEFT JOIN job_sites j ON r.job_site_id = j.id
      ${whereClause}
    `).get(...params) as { cnt: number };
    total = countRow.cnt;

    requests = db.prepare(`
      SELECT r.*, j.name as job_site_name, u.name as worker_name, u.email as worker_email,
             so.status as lumen_order_status, so.supplier_order_id as lumen_order_id, so.supplier as order_supplier, so.error_message as order_error,
             pu.name as picked_up_by_name, pj.name as picked_up_job_site_name,
             (SELECT p.price FROM products p WHERE LOWER(p.name) LIKE '%' || LOWER(r.product) || '%' ORDER BY p.price ASC LIMIT 1) as unit_price
      FROM requests r
      LEFT JOIN job_sites j ON r.job_site_id = j.id
      LEFT JOIN users u ON r.worker_id = u.id
      LEFT JOIN supplier_orders so ON so.request_id = r.id
      LEFT JOIN users pu ON r.picked_up_by = pu.id
      LEFT JOIN job_sites pj ON r.picked_up_job_site_id = pj.id
      ${whereClause}
      ORDER BY r.urgency DESC, r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  }

  const pages = Math.ceil(total / limit);
  return NextResponse.json({ requests, total, page, pages });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const rl = checkRateLimit('requests-post', String(ctx.userId), 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  if (ctx.role !== 'worker') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Contexte entreprise manquant' }, { status: 400 });
  }
  const companyId = ctx.companyId;

  const { product, quantity, unit, job_site_id, urgency, note, supplier } = await req.json();
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO requests (company_id, product, quantity, unit, job_site_id, worker_id, urgency, note, status, supplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(companyId, product, quantity, unit, job_site_id, ctx.userId, urgency ? 1 : 0, note || '', supplier || null);

  const requestId = result.lastInsertRowid;

  // Check if this worker has auto_approve enabled
  const userRow = db.prepare('SELECT auto_approve FROM users WHERE id = ? AND company_id = ?').get(ctx.userId, companyId) as any;

  if (userRow?.auto_approve) {
    // Auto-approve: skip pending, trigger approval immediately (fire-and-forget)
    triggerApproval(requestId, companyId, db).catch(console.error);
  } else {
    // Normal flow: notify office of pending request
    const officeUsers = db.prepare("SELECT email, language FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(companyId) as { email: string; language: string }[];
    const jobSite = db.prepare('SELECT name FROM job_sites WHERE id = ?').get(job_site_id) as { name: string } | undefined;
    for (const u of officeUsers) {
      sendNewRequestEmail(u.email, {
        product, quantity, unit,
        jobSite: jobSite?.name || '',
        worker: '',
        urgency: !!urgency,
        note: note || '',
      }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
    }
  }

  return NextResponse.json({ id: requestId });
}
