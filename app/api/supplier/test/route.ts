import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { decrypt } from '@/lib/encrypt';
import { testLumenConnection } from '@/lib/lumen';
import { testCanacConnection } from '@/lib/canac';
import { testHomeDepotConnection } from '@/lib/homedepot';
import { testGuillevinConnection } from '@/lib/guillevin';

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const supplier: string = body.supplier || 'lumen';

  const db = getDb();
  const account = db.prepare(
    'SELECT * FROM supplier_accounts WHERE supplier = ? AND company_id = ? LIMIT 1'
  ).get(supplier, ctx.companyId) as any;
  if (!account) return NextResponse.json({ success: false, error: 'Aucun compte configuré' });

  const password = decrypt(account.password_encrypted);

  let result;
  if (supplier === 'canac') {
    result = await testCanacConnection(account.username, password);
  } else if (supplier === 'homedepot') {
    result = await testHomeDepotConnection(account.username, password);
  } else if (supplier === 'guillevin') {
    result = await testGuillevinConnection(account.username, password);
  } else {
    result = await testLumenConnection(account.username, password);
  }

  return NextResponse.json(result);
}
