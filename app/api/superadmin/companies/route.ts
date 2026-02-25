import { NextRequest, NextResponse } from 'next/server';
import { getDb, seedCompanyDefaults } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/tenant';
import bcrypt from 'bcryptjs';

export async function GET() {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const companies = db.prepare(`
    SELECT c.*, c.stripe_customer_id, c.stripe_subscription_id, c.superadmin_created, COUNT(u.id) as user_count
    FROM companies c
    LEFT JOIN users u ON u.company_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();

  return NextResponse.json(companies);
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const { companyName, adminEmail, adminPassword, adminName } = await req.json();

  if (!companyName || !adminEmail || !adminPassword) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const db = getDb();

  const createCompany = db.transaction(() => {
    // 1. Créer la compagnie
    const companyResult = db.prepare(
      'INSERT INTO companies (name, subscription_status, superadmin_created) VALUES (?, \'active\', 1)'
    ).run(companyName);
    const companyId = companyResult.lastInsertRowid as number;

    // 2. Seeder les paramètres et catégories par défaut
    seedCompanyDefaults(db, companyId);

    // 3. Créer l'admin principal
    const hash = bcrypt.hashSync(adminPassword, 10);
    const userResult = db.prepare(
      "INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, 'admin')"
    ).run(companyId, adminName || adminEmail, adminEmail, hash);

    return { companyId, userId: userResult.lastInsertRowid };
  });

  try {
    const result = createCompany();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Email admin déjà utilisé dans cette compagnie' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
