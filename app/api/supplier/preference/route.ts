import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const db = getDb();
  // User-level preference overrides company default
  const userPref = db.prepare('SELECT supplier_preference FROM users WHERE id = ?').get(ctx.userId) as any;
  const settings = db.prepare(
    'SELECT supplier_preference, lumen_rep_email, large_order_threshold, office_address, default_delivery FROM company_settings WHERE company_id = ?'
  ).get(ctx.companyId) as any;
  return NextResponse.json({
    preference: userPref?.supplier_preference || settings?.supplier_preference || 'cheapest',
    lumenRepEmail: settings?.lumen_rep_email || '',
    largeOrderThreshold: settings?.large_order_threshold ?? 2000,
    officeAddress: settings?.office_address || '',
    defaultDelivery: settings?.default_delivery || 'office',
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const body = await req.json();
  const { preference, lumenRepEmail, largeOrderThreshold, officeAddress, defaultDelivery } = body;

  if (preference !== undefined && !['cheapest', 'fastest'].includes(preference)) {
    return NextResponse.json({ error: 'Préférence invalide' }, { status: 400 });
  }

  if (defaultDelivery !== undefined && !['office', 'jobsite'].includes(defaultDelivery)) {
    return NextResponse.json({ error: 'Livraison invalide' }, { status: 400 });
  }

  const db = getDb();

  if (ctx.role === 'electrician') {
    // Electricians update their own personal preference only
    if (preference !== undefined) {
      db.prepare('UPDATE users SET supplier_preference = ? WHERE id = ?').run(preference, ctx.userId);
    }
    return NextResponse.json({ ok: true });
  }

  // Office / admin update company-wide settings
  db.prepare(`
    UPDATE company_settings SET
      supplier_preference = COALESCE(?, supplier_preference),
      lumen_rep_email = COALESCE(?, lumen_rep_email),
      large_order_threshold = COALESCE(?, large_order_threshold),
      office_address = COALESCE(?, office_address),
      default_delivery = COALESCE(?, default_delivery),
      updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
  `).run(preference ?? null, lumenRepEmail ?? null, largeOrderThreshold ?? null, officeAddress ?? null, defaultDelivery ?? null, ctx.companyId);

  return NextResponse.json({ ok: true });
}
