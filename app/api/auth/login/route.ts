import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const db = getDb();

  // 1. Try superadmin first (company_id IS NULL)
  let user = db.prepare(
    "SELECT * FROM users WHERE email = ? AND company_id IS NULL AND role = 'superadmin'"
  ).get(email) as any;

  // 2. Fall back to regular user in an active company
  if (!user) {
    user = db.prepare(`
      SELECT u.* FROM users u
      JOIN companies c ON u.company_id = c.id
      WHERE u.email = ? AND c.subscription_status = 'active'
      LIMIT 1
    `).get(email) as any;
  }

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return NextResponse.json({ error: 'Email ou mot de passe invalide' }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.companyId = user.company_id ?? null;
  session.name = user.name;
  session.email = user.email;
  session.role = user.role;
  await session.save();

  return NextResponse.json({ role: user.role });
}
