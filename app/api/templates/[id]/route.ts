import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM order_templates WHERE id = ? AND company_id = ?').run(id, ctx.companyId);
  return NextResponse.json({ ok: true });
}
