import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { triggerApproval } from '@/lib/approval';

export async function PATCH(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { ids, status, office_comment } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'ids requis' }, { status: 400 });
  if (ids.length > 50) return NextResponse.json({ error: 'Maximum 50' }, { status: 400 });

  const db = getDb();
  for (const id of ids) {
    if (status === 'approved') {
      await triggerApproval(id, ctx.companyId!, db);
    } else if (status === 'rejected') {
      db.prepare("UPDATE requests SET status = 'rejected', office_comment = ?, decision_date = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?")
        .run(office_comment || '', id, ctx.companyId);
    }
  }
  return NextResponse.json({ ok: true });
}
