import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }

  const db = getDb();
  const cid = session.companyId;
  const uid = session.userId;

  // User info
  const settings = db.prepare('SELECT inventory_enabled, marketing_enabled FROM company_settings WHERE company_id = ?').get(cid) as any;

  // General channel: last message + unread
  const generalLast = db.prepare(`
    SELECT m.id, m.sender_id, m.body, m.created_at, u.name as sender_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.company_id = ? AND m.recipient_id IS NULL
    ORDER BY m.created_at DESC LIMIT 1
  `).get(cid) as any;

  const generalUnread = (db.prepare(`
    SELECT COUNT(*) as count FROM messages m
    WHERE m.company_id = ? AND m.recipient_id IS NULL AND m.sender_id != ?
      AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
  `).get(cid, uid, uid) as any)?.count || 0;

  // Direct conversations
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
  `).all(uid, uid, cid, uid, uid) as any[];

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

  for (const [partnerId, conv] of conversationMap) {
    const unread = (db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      WHERE m.company_id = ? AND m.sender_id = ? AND m.recipient_id = ?
        AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
    `).get(cid, partnerId, uid, uid) as any)?.count || 0;
    conv.unread = unread;
  }

  const conversations = Array.from(conversationMap.values())
    .sort((a: any, b: any) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  // Company users for new conversation picker
  const users = db.prepare(
    'SELECT id, name, role FROM users WHERE company_id = ? AND id != ? ORDER BY name'
  ).all(cid, uid);

  return NextResponse.json({
    user: {
      id: uid,
      name: session.name,
      role: session.role,
      inventoryEnabled: !!settings?.inventory_enabled,
      marketingEnabled: !!settings?.marketing_enabled,
    },
    convList: {
      general: { lastMessage: generalLast || null, unread: generalUnread },
      conversations,
      users,
    },
  });
}
