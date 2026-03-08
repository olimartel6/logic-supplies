import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const { messageIds } = await req.json();
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return NextResponse.json({ error: 'messageIds requis' }, { status: 400 });
  }

  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)');

  const markRead = db.transaction((ids: number[]) => {
    for (const id of ids) {
      // Only mark messages that belong to the user's company
      const msg = db.prepare('SELECT id FROM messages WHERE id = ? AND company_id = ?').get(id, ctx.companyId);
      if (msg) {
        insert.run(id, ctx.userId);
      }
    }
  });

  markRead(messageIds);
  return NextResponse.json({ ok: true });
}
