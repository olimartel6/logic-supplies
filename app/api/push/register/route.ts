import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const { token, platform } = await req.json();
  if (!token || !platform) {
    return NextResponse.json({ error: 'Missing token or platform' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO push_tokens (user_id, company_id, token, platform)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, company_id = excluded.company_id
  `).run(ctx.userId, ctx.companyId, token, platform);

  return NextResponse.json({ ok: true });
}
