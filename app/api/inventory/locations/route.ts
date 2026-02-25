import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  const locations = db.prepare(`
    SELECT l.*, j.name as job_site_name
    FROM inventory_locations l
    LEFT JOIN job_sites j ON l.job_site_id = j.id
    WHERE l.company_id = ?
    ORDER BY l.name
  `).all(ctx.companyId);
  return NextResponse.json(locations);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const { name, type, job_site_id } = await req.json();
  if (!name || !type) return NextResponse.json({ error: 'name et type requis' }, { status: 400 });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO inventory_locations (company_id, name, type, job_site_id) VALUES (?, ?, ?, ?)'
  ).run(ctx.companyId, name, type, job_site_id || null);
  return NextResponse.json({ id: result.lastInsertRowid });
}
