import { NextRequest, NextResponse } from 'next/server';
import { getDb, seedSuperadminCategories } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/tenant';
import { encrypt } from '@/lib/encrypt';

const SUPERADMIN_COMPANY_ID = 0;
const SUPPLIERS = ['lumen', 'canac', 'homedepot', 'guillevin'] as const;

export async function GET() {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const accounts = SUPPLIERS.map(supplier => {
    const acc = db.prepare(
      'SELECT id, supplier, username, active FROM supplier_accounts WHERE supplier = ? AND company_id = ? LIMIT 1'
    ).get(supplier, SUPERADMIN_COMPANY_ID) as { id: number; supplier: string; username: string; active: number } | undefined;
    return { supplier, username: acc?.username ?? null, configured: !!acc };
  });

  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  let body: { supplier?: string; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }
  const { supplier, username, password } = body;
  if (!supplier || !username || !(SUPPLIERS as ReadonlyArray<string>).includes(supplier)) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM supplier_accounts WHERE supplier = ? AND company_id = ? LIMIT 1'
  ).get(supplier, SUPERADMIN_COMPANY_ID) as { id: number } | undefined;

  if (existing) {
    if (password) {
      db.prepare('UPDATE supplier_accounts SET username = ?, password_encrypted = ?, active = 1 WHERE id = ?')
        .run(username, encrypt(password), existing.id);
    } else {
      db.prepare('UPDATE supplier_accounts SET username = ?, active = 1 WHERE id = ?')
        .run(username, existing.id);
    }
  } else {
    if (!password) {
      return NextResponse.json({ error: 'Mot de passe requis pour le premier enregistrement' }, { status: 400 });
    }
    db.transaction(() => {
      db.prepare('INSERT INTO supplier_accounts (supplier, username, password_encrypted, company_id) VALUES (?, ?, ?, ?)')
        .run(supplier, username, encrypt(password), SUPERADMIN_COMPANY_ID);
      seedSuperadminCategories(db);
    })();
  }

  return NextResponse.json({ ok: true });
}
