import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { companyName, adminName, adminEmail, adminPassword, verificationToken } = await req.json();

  if (!companyName || !adminName || !adminEmail || !adminPassword || !verificationToken) {
    return NextResponse.json({ error: 'Tous les champs sont requis.' }, { status: 400 });
  }
  if (adminPassword.length < 6) {
    return NextResponse.json({ error: 'Mot de passe : 6 caractères minimum.' }, { status: 400 });
  }

  const db = getDb();

  // Validate verification token
  const verification = db.prepare(`
    SELECT * FROM email_verifications
    WHERE email = ? AND token = ? AND verified = 1 AND expires_at > datetime('now')
  `).get(adminEmail.toLowerCase(), verificationToken) as any;

  if (!verification) {
    return NextResponse.json({ error: 'Vérification email expirée. Recommencez.' }, { status: 400 });
  }

  // Check email not already used
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail.toLowerCase());
  if (existing) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 });
  }

  // Get configured Stripe payment link
  const linkSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'stripe_payment_link'").get() as any;
  const paymentLink = linkSetting?.value || '';
  if (!paymentLink) {
    return NextResponse.json({ error: 'Paiement non configuré. Contactez-nous.' }, { status: 503 });
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO pending_signups (id, company_name, admin_name, admin_email, admin_password_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, companyName, adminName, adminEmail.toLowerCase(), passwordHash, expiresAt);

  // Clean up verification row
  db.prepare('DELETE FROM email_verifications WHERE id = ?').run(verification.id);

  const url = `${paymentLink}?client_reference_id=${id}&prefilled_email=${encodeURIComponent(adminEmail)}`;

  return NextResponse.json({ url });
}
