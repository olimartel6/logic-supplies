import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'superadmin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const db = getDb();
  const priceSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'monthly_price_cents'").get() as any;
  const linkSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'stripe_payment_link'").get() as any;

  return NextResponse.json({
    monthly_price_cents: priceSetting ? parseInt(priceSetting.value) : 9900,
    stripe_payment_link: linkSetting ? linkSetting.value : '',
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'superadmin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const body = await req.json();
  const db = getDb();

  if (body.monthly_price_cents !== undefined) {
    if (!body.monthly_price_cents || body.monthly_price_cents < 100) {
      return NextResponse.json({ error: 'Prix invalide (minimum 1 $).' }, { status: 400 });
    }
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('monthly_price_cents', ?)")
      .run(String(Math.round(body.monthly_price_cents)));
  }

  if (body.stripe_payment_link !== undefined) {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('stripe_payment_link', ?)")
      .run(String(body.stripe_payment_link));
  }

  return NextResponse.json({ ok: true });
}
