import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM messages m
    WHERE m.company_id = ?
      AND (m.recipient_id = ? OR m.recipient_id IS NULL)
      AND m.sender_id != ?
      AND NOT EXISTS (
        SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?
      )
  `).get(ctx.companyId, ctx.userId, ctx.userId, ctx.userId) as any;

  return NextResponse.json({ count: result?.count || 0 });
}
