import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const status = req.nextUrl.searchParams.get('status') || 'active';
  const db = getDb();
  const sites = db.prepare(
    'SELECT * FROM job_sites WHERE company_id = ? AND status = ? ORDER BY created_at DESC'
  ).all(ctx.companyId, status);

  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const { name, address } = await req.json();
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO job_sites (company_id, name, address) VALUES (?, ?, ?)'
  ).run(ctx.companyId, name, address || '');
  return NextResponse.json({ id: result.lastInsertRowid });
}
