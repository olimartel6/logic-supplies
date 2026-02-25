import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { companyName, adminName, adminEmail, adminPassword } = await req.json();

  if (!companyName || !adminName || !adminEmail || !adminPassword) {
    return NextResponse.json({ error: 'Tous les champs sont requis.' }, { status: 400 });
  }
  if (adminPassword.length < 6) {
    return NextResponse.json({ error: 'Mot de passe : 6 caractères minimum.' }, { status: 400 });
  }

  const db = getDb();

  // Check email not already used
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (existing) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 });
  }

  // Get configured Stripe payment link
  const linkSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'stripe_payment_link'").get() as any;
  const paymentLink = linkSetting?.value || '';
  if (!paymentLink) {
    return NextResponse.json({ error: 'Paiement non configuré. Contactez-nous.' }, { status: 503 });
  }

  const passwordHash = bcrypt.hashSync(adminPassword, 10);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h

  db.prepare(`
    INSERT INTO pending_signups (id, company_name, admin_name, admin_email, admin_password_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, companyName, adminName, adminEmail, passwordHash, expiresAt);

  // Build payment link URL with client_reference_id for webhook matching
  const url = `${paymentLink}?client_reference_id=${id}&prefilled_email=${encodeURIComponent(adminEmail)}`;

  return NextResponse.json({ url });
}
