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

  // User info
  const settings = db.prepare('SELECT inventory_enabled, marketing_enabled FROM company_settings WHERE company_id = ?').get(cid) as any;
  const userRow = db.prepare('SELECT language, supplier_preference FROM users WHERE id = ?').get(session.userId) as any;

  // Supplier preference (user-level overrides company default)
  const preference = userRow?.supplier_preference || settings?.supplier_preference || 'cheapest';

  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      inventoryEnabled: !!settings?.inventory_enabled,
      marketingEnabled: !!settings?.marketing_enabled,
      language: userRow?.language ?? 'fr',
    },
    preference,
  });
}
