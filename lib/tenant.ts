import { NextResponse } from 'next/server';
import { getSession } from './session';

export interface TenantContext {
  userId: number;
  companyId: number | null;
  role: string;
}

type TenantResult = TenantContext | { error: ReturnType<typeof NextResponse.json> };

export async function getTenantContext(): Promise<TenantResult> {
  const session = await getSession();
  if (!session.userId) {
    return { error: NextResponse.json({ error: 'Non connecté' }, { status: 401 }) };
  }
  // Check subscription for non-superadmin users
  if (session.companyId) {
    const { getDb } = await import('./db');
    const db = getDb();
    const company = db.prepare(
      'SELECT subscription_status FROM companies WHERE id = ?'
    ).get(session.companyId) as any;
    if (company && company.subscription_status !== 'active') {
      return { error: NextResponse.json({ error: 'subscription_required' }, { status: 402 }) };
    }
  }
  return {
    userId: session.userId,
    companyId: session.companyId ?? null,
    role: session.role || '',
  };
}

export async function requireSuperAdmin(): Promise<TenantResult> {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx;
  if (ctx.role !== 'superadmin') {
    return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) };
  }
  return ctx;
}

export async function requireAdmin(): Promise<TenantResult> {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx;
  if (!['admin', 'superadmin'].includes(ctx.role)) {
    return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) };
  }
  return ctx;
}
