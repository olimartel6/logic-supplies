import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const db = getDb();

  const settings = db.prepare('SELECT onboarding_dismissed FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;
  if (settings?.onboarding_dismissed) {
    return NextResponse.json({ dismissed: true, steps: [] });
  }

  const hasSupplierAccount = !!(db.prepare('SELECT 1 FROM supplier_accounts WHERE company_id = ? LIMIT 1').get(ctx.companyId));
  const hasEmployee = !!(db.prepare("SELECT 1 FROM users WHERE company_id = ? AND role = 'worker' LIMIT 1").get(ctx.companyId));
  const hasOrder = !!(db.prepare('SELECT 1 FROM requests WHERE company_id = ? LIMIT 1').get(ctx.companyId));

  return NextResponse.json({
    dismissed: false,
    steps: [
      { key: 'supplier', label: 'Configurer un compte fournisseur', done: hasSupplierAccount, link: '/settings' },
      { key: 'employee', label: 'Ajouter un travailleur', done: hasEmployee, link: '/admin' },
      { key: 'order', label: 'Passer une première commande', done: hasOrder, link: '/new-request' },
    ],
  });
}
