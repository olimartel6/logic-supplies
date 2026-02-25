import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/tenant';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const { id } = await params;
  const { subscription_status } = await req.json();

  if (!['active', 'suspended', 'cancelled'].includes(subscription_status)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    'UPDATE companies SET subscription_status = ? WHERE id = ?'
  ).run(subscription_status, id);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Compagnie non trouvée' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
