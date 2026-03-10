import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  const db = getDb();
  const users = db.prepare(
    'SELECT id, name, email, role, auto_approve, created_at FROM users WHERE company_id = ? ORDER BY name'
  ).all(ctx.companyId);
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const rl = checkRateLimit('users-post', String(ctx.userId), 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  const { name, email, password, role } = await req.json();
  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(
      'INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)'
    ).run(ctx.companyId, name, email, hash, role);
    return NextResponse.json({ id: result.lastInsertRowid });
  } catch {
    return NextResponse.json({ error: 'Email déjà utilisé dans cette compagnie' }, { status: 400 });
  }
}
