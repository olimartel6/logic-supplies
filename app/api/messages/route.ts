import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const withUser = req.nextUrl.searchParams.get('with');
  const channel = req.nextUrl.searchParams.get('channel');
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  // Messages for a specific 1-to-1 conversation
  if (withUser) {
    const recipientId = parseInt(withUser, 10);
    if (isNaN(recipientId)) return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });

    const messages = db.prepare(`
      SELECT m.id, m.sender_id, m.recipient_id, m.body, m.created_at,
             u.name as sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.company_id = ?
        AND m.recipient_id IS NOT NULL
        AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `).all(ctx.companyId, ctx.userId, recipientId, recipientId, ctx.userId, limit, offset);

    return NextResponse.json({ messages });
  }

  // Messages in the general channel
  if (channel === 'general') {
    const messages = db.prepare(`
      SELECT m.id, m.sender_id, m.body, m.created_at,
             u.name as sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.company_id = ? AND m.recipient_id IS NULL
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `).all(ctx.companyId, limit, offset);

    return NextResponse.json({ messages });
  }

  // List all conversations
  // 1. General channel: last message + unread count
  const generalLast = db.prepare(`
    SELECT m.id, m.sender_id, m.body, m.created_at, u.name as sender_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.company_id = ? AND m.recipient_id IS NULL
    ORDER BY m.created_at DESC LIMIT 1
  `).get(ctx.companyId) as any;

  const generalUnread = (db.prepare(`
    SELECT COUNT(*) as count FROM messages m
    WHERE m.company_id = ? AND m.recipient_id IS NULL AND m.sender_id != ?
      AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
  `).get(ctx.companyId, ctx.userId, ctx.userId) as any)?.count || 0;

  // 2. Direct conversations: group by conversation partner, get last message + unread
  const directMessages = db.prepare(`
    SELECT m.id, m.sender_id, m.recipient_id, m.body, m.created_at,
           u.name as sender_name,
           CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END as partner_id,
           CASE WHEN m.sender_id = ? THEN u2.name ELSE u.name END as partner_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN users u2 ON u2.id = m.recipient_id
    WHERE m.company_id = ?
      AND m.recipient_id IS NOT NULL
      AND (m.sender_id = ? OR m.recipient_id = ?)
    ORDER BY m.created_at DESC
  `).all(ctx.userId, ctx.userId, ctx.companyId, ctx.userId, ctx.userId) as any[];

  // Group by partner, keep only last message per conversation
  const conversationMap = new Map<number, any>();
  for (const msg of directMessages) {
    const partnerId = msg.partner_id;
    if (!conversationMap.has(partnerId)) {
      conversationMap.set(partnerId, {
        partnerId,
        partnerName: partnerId === msg.sender_id ? msg.sender_name : msg.partner_name,
        lastMessage: msg.body,
        lastMessageAt: msg.created_at,
        senderId: msg.sender_id,
      });
    }
  }

  // Count unread per partner
  for (const [partnerId, conv] of conversationMap) {
    const unread = (db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      WHERE m.company_id = ? AND m.sender_id = ? AND m.recipient_id = ?
        AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
    `).get(ctx.companyId, partnerId, ctx.userId, ctx.userId) as any)?.count || 0;
    conv.unread = unread;
  }

  const conversations = Array.from(conversationMap.values())
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  // Get list of company users for new conversation picker
  const users = db.prepare(
    'SELECT id, name, role FROM users WHERE company_id = ? AND id != ? ORDER BY name'
  ).all(ctx.companyId, ctx.userId);

  return NextResponse.json({
    general: {
      lastMessage: generalLast || null,
      unread: generalUnread,
    },
    conversations,
    users,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const { recipientId, body } = await req.json();
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return NextResponse.json({ error: 'Message vide' }, { status: 400 });
  }

  const db = getDb();

  // If sending to a specific user, verify they're in the same company
  if (recipientId) {
    const recipient = db.prepare(
      'SELECT id FROM users WHERE id = ? AND company_id = ?'
    ).get(recipientId, ctx.companyId);
    if (!recipient) {
      return NextResponse.json({ error: 'Destinataire introuvable' }, { status: 404 });
    }
  }

  const result = db.prepare(`
    INSERT INTO messages (company_id, sender_id, recipient_id, body)
    VALUES (?, ?, ?, ?)
  `).run(ctx.companyId, ctx.userId, recipientId || null, body.trim());

  // Auto-mark as read by sender
  db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)').run(
    result.lastInsertRowid,
    ctx.userId
  );

  return NextResponse.json({ id: result.lastInsertRowid });
}
