import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getDb, seedCompanyDefaults } from '@/lib/db';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature error:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const db = getDb();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const pendingId = session.client_reference_id || session.metadata?.pending_signup_id;
    if (!pendingId) return NextResponse.json({ ok: true });

    const pending = db.prepare('SELECT * FROM pending_signups WHERE id = ?').get(pendingId) as any;
    if (!pending) return NextResponse.json({ ok: true });

    try {
      db.transaction(() => {
        const companyResult = db.prepare(
          'INSERT INTO companies (name, subscription_status, stripe_customer_id, stripe_subscription_id) VALUES (?, ?, ?, ?)'
        ).run(pending.company_name, 'active', session.customer as string, session.subscription as string);
        const companyId = Number(companyResult.lastInsertRowid);

        seedCompanyDefaults(db, companyId);

        db.prepare(
          'INSERT INTO users (company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)'
        ).run(companyId, pending.admin_name, pending.admin_email, pending.admin_password_hash, 'admin');

        db.prepare('DELETE FROM pending_signups WHERE id = ?').run(pendingId);
      })();
    } catch (err) {
      console.error('Webhook transaction error:', err);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    db.prepare('UPDATE companies SET subscription_status = ? WHERE stripe_subscription_id = ?')
      .run('suspended', sub.id);
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const newStatus = ['canceled', 'unpaid', 'past_due'].includes(sub.status) ? 'suspended' : 'active';
    db.prepare('UPDATE companies SET subscription_status = ? WHERE stripe_subscription_id = ?')
      .run(newStatus, sub.id);
  }

  return NextResponse.json({ ok: true });
}
