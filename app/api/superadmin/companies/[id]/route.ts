import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/tenant';
import { getCompanyFeatures, setCompanyFeatures } from '@/lib/features';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const { id } = await params;
  const features = getCompanyFeatures(Number(id));
  return NextResponse.json({ features });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  // Update subscription status
  if (body.subscription_status) {
    if (!['active', 'suspended', 'cancelled'].includes(body.subscription_status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
    }
    const result = db.prepare(
      'UPDATE companies SET subscription_status = ? WHERE id = ?'
    ).run(body.subscription_status, id);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Compagnie non trouvée' }, { status: 404 });
    }
  }

  // Update features
  if (body.features && typeof body.features === 'object') {
    const current = getCompanyFeatures(Number(id));
    const updated = { ...current, ...body.features };
    setCompanyFeatures(Number(id), updated);
  }

  return NextResponse.json({ ok: true });
}
