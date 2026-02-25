import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  db.prepare("UPDATE job_sites SET status = 'completed' WHERE id = ? AND company_id = ?").run(id, ctx.companyId);
  return NextResponse.json({ ok: true });
}
