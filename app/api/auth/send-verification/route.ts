import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendVerificationCodeEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { randomInt } from 'crypto';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const ipCheck = checkRateLimit('send-verification-ip', ip, 3, 60_000);
  if (!ipCheck.allowed) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, { status: 429 });
  }

  const { email } = await req.json();

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Email invalide.' }, { status: 400 });
  }

  const emailCheck = checkRateLimit('send-verification-email', email.toLowerCase(), 3, 300_000);
  if (!emailCheck.allowed) {
    return NextResponse.json({ error: 'Code déjà envoyé. Vérifiez vos emails.' }, { status: 429 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Envoi d\'email non configuré. Contactez le support.' }, { status: 503 });
  }

  const db = getDb();

  // Check email not already registered
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 });
  }

  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Upsert: replace any previous code for this email
  db.prepare(`
    DELETE FROM email_verifications WHERE email = ?
  `).run(email.toLowerCase());

  db.prepare(`
    INSERT INTO email_verifications (email, code, expires_at)
    VALUES (?, ?, ?)
  `).run(email.toLowerCase(), code, expiresAt);

  try {
    await sendVerificationCodeEmail(email, code);
    console.log(`[SMTP] Code sent to ${email}`);
  } catch (err: any) {
    console.error('[SMTP ERROR]', err.message, err.code);
    return NextResponse.json({ error: `Erreur d'envoi: ${err.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
