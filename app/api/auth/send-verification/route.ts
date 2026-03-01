import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendVerificationCodeEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Email invalide.' }, { status: 400 });
  }

  const db = getDb();

  // Check email not already registered
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Upsert: replace any previous code for this email
  db.prepare(`
    DELETE FROM email_verifications WHERE email = ?
  `).run(email.toLowerCase());

  db.prepare(`
    INSERT INTO email_verifications (email, code, expires_at)
    VALUES (?, ?, ?)
  `).run(email.toLowerCase(), code, expiresAt);

  await sendVerificationCodeEmail(email, code);

  return NextResponse.json({ ok: true });
}
