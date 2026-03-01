import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { sendNewRequestEmail } from '@/lib/email';
import { triggerApproval } from '@/lib/approval';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  let requests;

  if (ctx.role === 'electrician') {
    requests = db.prepare(`
      SELECT r.*, j.name as job_site_name, u.name as electrician_name,
             (SELECT p.price FROM products p WHERE LOWER(p.name) LIKE '%' || LOWER(r.product) || '%' ORDER BY p.price ASC LIMIT 1) as unit_price
      FROM requests r
      LEFT JOIN job_sites j ON r.job_site_id = j.id
      LEFT JOIN users u ON r.electrician_id = u.id
      WHERE r.electrician_id = ? AND r.company_id = ?
      ORDER BY r.created_at DESC
    `).all(ctx.userId, ctx.companyId);
  } else {
    requests = db.prepare(`
      SELECT r.*, j.name as job_site_name, u.name as electrician_name, u.email as electrician_email,
             so.status as lumen_order_status, so.supplier_order_id as lumen_order_id, so.supplier as order_supplier,
             (SELECT p.price FROM products p WHERE LOWER(p.name) LIKE '%' || LOWER(r.product) || '%' ORDER BY p.price ASC LIMIT 1) as unit_price
      FROM requests r
      LEFT JOIN job_sites j ON r.job_site_id = j.id
      LEFT JOIN users u ON r.electrician_id = u.id
      LEFT JOIN supplier_orders so ON so.request_id = r.id
      WHERE r.company_id = ?
      ORDER BY r.urgency DESC, r.created_at DESC
    `).all(ctx.companyId);
    // r.supplier is already included via r.*
  }

  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!ctx.companyId) {
    return NextResponse.json({ error: 'Contexte entreprise manquant' }, { status: 400 });
  }
  const companyId = ctx.companyId;

  const { product, quantity, unit, job_site_id, urgency, note, supplier } = await req.json();
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO requests (company_id, product, quantity, unit, job_site_id, electrician_id, urgency, note, status, supplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(companyId, product, quantity, unit, job_site_id, ctx.userId, urgency ? 1 : 0, note || '', supplier || null);

  const requestId = result.lastInsertRowid;

  // Check if this electrician has auto_approve enabled
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
        electrician: '',
        urgency: !!urgency,
        note: note || '',
      }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
    }
  }

  return NextResponse.json({ id: requestId });
}
