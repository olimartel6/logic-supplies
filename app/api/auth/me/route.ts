import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });

  const { email, currentPassword, newPassword } = await req.json();
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId) as any;
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

  if (email && email !== user.email) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND company_id IS ?').get(email, user.company_id);
    if (existing) return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 });
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, user.id);
    session.email = email;
    await session.save();
  }

  if (newPassword) {
    if (!currentPassword) return NextResponse.json({ error: 'Mot de passe actuel requis.' }, { status: 400 });
    const valid = bcrypt.compareSync(currentPassword, user.password);
    if (!valid) return NextResponse.json({ error: 'Mot de passe actuel incorrect.' }, { status: 400 });
    if (newPassword.length < 6) return NextResponse.json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' }, { status: 400 });
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
  }

  return NextResponse.json({ success: true });
}

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }
  const db = getDb();
  const settings = db.prepare('SELECT inventory_enabled FROM company_settings WHERE company_id = ?').get(session.companyId) as any;
  // Add this after getting settings
  const company = session.companyId
    ? db.prepare('SELECT subscription_status, superadmin_created FROM companies WHERE id = ?').get(session.companyId) as any
    : null;
  return NextResponse.json({
    id: session.userId,
    companyId: session.companyId,
    name: session.name,
    email: session.email,
    role: session.role,
    inventoryEnabled: !!settings?.inventory_enabled,
    subscriptionStatus: company?.subscription_status ?? 'active',
    superadminCreated: !!company?.superadmin_created,
  });
}
