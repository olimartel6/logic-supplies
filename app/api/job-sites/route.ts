import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  const sites = db.prepare(
    "SELECT * FROM job_sites WHERE company_id = ? AND status = 'active' ORDER BY name"
  ).all(ctx.companyId);
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const { name, address } = await req.json();
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO job_sites (company_id, name, address) VALUES (?, ?, ?)'
  ).run(ctx.companyId, name, address || '');
  return NextResponse.json({ id: result.lastInsertRowid });
}
