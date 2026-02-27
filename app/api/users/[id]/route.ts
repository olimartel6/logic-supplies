import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id);
  if (userId === ctx.userId) {
    return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 });
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND company_id = ?').get(userId, ctx.companyId);
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

  db.prepare('DELETE FROM users WHERE id = ? AND company_id = ?').run(userId, ctx.companyId);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  if (!ctx.companyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id, 10);
  const body = await req.json();

  const db = getDb();
  const user = db.prepare('SELECT id, role FROM users WHERE id = ? AND company_id = ?').get(userId, ctx.companyId) as { id: number; role: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  if (user.role !== 'electrician') {
    return NextResponse.json({ error: "auto_approve ne s'applique qu'aux électriciens" }, { status: 400 });
  }

  if (typeof body.auto_approve !== 'boolean') {
    return NextResponse.json({ error: 'Champ auto_approve manquant ou invalide' }, { status: 400 });
  }
  db.prepare('UPDATE users SET auto_approve = ? WHERE id = ? AND company_id = ?')
    .run(body.auto_approve ? 1 : 0, userId, ctx.companyId);

  return NextResponse.json({ ok: true });
}
