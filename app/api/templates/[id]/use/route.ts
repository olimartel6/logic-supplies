import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const db = getDb();
  const template = db.prepare(
    'SELECT * FROM order_templates WHERE id = ? AND company_id = ?'
  ).get(id, ctx.companyId) as any;
  if (!template) return NextResponse.json({ error: 'Modèle non trouvé' }, { status: 404 });
  db.prepare('UPDATE order_templates SET use_count = use_count + 1 WHERE id = ?').run(id);
  return NextResponse.json({ items: JSON.parse(template.items) });
}
