import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { encrypt } from '@/lib/encrypt';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';
  const db = getDb();
  const account = db.prepare(
    'SELECT id, supplier, username, active FROM supplier_accounts WHERE supplier = ? AND company_id = ? LIMIT 1'
  ).get(supplier, ctx.companyId) as any;
  return NextResponse.json(account || null);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const { username, password, supplier = 'lumen' } = await req.json();
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM supplier_accounts WHERE supplier = ? AND company_id = ? LIMIT 1'
  ).get(supplier, ctx.companyId) as any;
  if (existing) {
    if (password) {
      db.prepare('UPDATE supplier_accounts SET username = ?, password_encrypted = ?, active = 1 WHERE id = ? AND company_id = ?')
        .run(username, encrypt(password), existing.id, ctx.companyId);
    } else {
      db.prepare('UPDATE supplier_accounts SET username = ?, active = 1 WHERE id = ? AND company_id = ?')
        .run(username, existing.id, ctx.companyId);
    }
  } else {
    db.prepare('INSERT INTO supplier_accounts (supplier, username, password_encrypted, company_id) VALUES (?, ?, ?, ?)')
      .run(supplier, username, encrypt(password), ctx.companyId);
  }
  return NextResponse.json({ ok: true });
}
