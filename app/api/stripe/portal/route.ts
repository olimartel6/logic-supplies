import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function POST() {
  const session = await getSession();
  if (!session.userId || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  const company = db.prepare('SELECT stripe_customer_id FROM companies WHERE id = ?')
    .get(session.companyId) as any;

  if (!company?.stripe_customer_id) {
    return NextResponse.json({ error: 'Aucun compte Stripe associé.' }, { status: 400 });
  }

  const APP_URL = process.env.APP_URL || 'http://localhost:3000';
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: company.stripe_customer_id,
    return_url: `${APP_URL}/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
