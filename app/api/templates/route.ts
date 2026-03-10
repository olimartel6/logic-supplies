import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  const templates = db.prepare(
    'SELECT t.*, u.name as creator_name FROM order_templates t LEFT JOIN users u ON t.created_by = u.id WHERE t.company_id = ? ORDER BY t.use_count DESC, t.created_at DESC'
  ).all(ctx.companyId);
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const { name, items } = await req.json();
  if (!name || !items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Nom et items requis' }, { status: 400 });
  }
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO order_templates (company_id, created_by, name, items) VALUES (?, ?, ?, ?)'
  ).run(ctx.companyId, ctx.userId, name, JSON.stringify(items));
  return NextResponse.json({ id: result.lastInsertRowid });
}
