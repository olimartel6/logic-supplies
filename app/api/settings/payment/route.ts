import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { encrypt } from '@/lib/encrypt';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (!['admin', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  const pm = db.prepare(
    'SELECT card_holder, card_last4, card_expiry, updated_at FROM company_payment_methods WHERE company_id = ?'
  ).get(ctx.companyId) as { card_holder: string; card_last4: string; card_expiry: string; updated_at: string } | undefined;

  if (!pm) return NextResponse.json({ configured: false });

  return NextResponse.json({
    configured: true,
    card_holder: pm.card_holder,
    card_last4: pm.card_last4,
    card_expiry: pm.card_expiry,
    updated_at: pm.updated_at,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (!['admin', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  let body: { card_holder?: string; card_number?: string; card_expiry?: string; card_cvv?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }

  const { card_holder, card_number, card_expiry, card_cvv } = body;
  if (!card_holder || !card_number || !card_expiry || !card_cvv) {
    return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
  }

  const digits = card_number.replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(digits)) {
    return NextResponse.json({ error: 'Numéro de carte invalide' }, { status: 400 });
  }
  if (!/^\d{2}\/\d{2}$/.test(card_expiry)) {
    return NextResponse.json({ error: 'Format expiry invalide (MM/YY)' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO company_payment_methods (company_id, card_holder, card_number_encrypted, card_expiry, card_last4, card_cvv_encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET
      card_holder = excluded.card_holder,
      card_number_encrypted = excluded.card_number_encrypted,
      card_expiry = excluded.card_expiry,
      card_last4 = excluded.card_last4,
      card_cvv_encrypted = excluded.card_cvv_encrypted,
      updated_at = CURRENT_TIMESTAMP
  `).run(ctx.companyId, card_holder, encrypt(digits), card_expiry, digits.slice(-4), encrypt(card_cvv));

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (!['admin', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  db.prepare('DELETE FROM company_payment_methods WHERE company_id = ?').run(ctx.companyId);

  return NextResponse.json({ ok: true });
}
