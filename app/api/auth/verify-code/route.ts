import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { email, code } = await req.json();

  if (!email || !code) {
    return NextResponse.json({ error: 'Champs manquants.' }, { status: 400 });
  }

  const db = getDb();

  const row = db.prepare(`
    SELECT * FROM email_verifications
    WHERE email = ? AND code = ? AND expires_at > datetime('now')
  `).get(email.toLowerCase(), String(code)) as any;

  if (!row) {
    return NextResponse.json({ error: 'Code invalide ou expiré.' }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`
    UPDATE email_verifications
    SET token = ?, verified = 1, expires_at = ?
    WHERE id = ?
  `).run(token, tokenExpiresAt, row.id);

  return NextResponse.json({ token });
}
