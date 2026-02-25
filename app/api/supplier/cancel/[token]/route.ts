import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { decrypt } from '@/lib/encrypt';
import { cancelLumenOrder } from '@/lib/lumen';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const order = db.prepare(`
    SELECT so.*, r.product, r.quantity, r.unit
    FROM supplier_orders so
    JOIN requests r ON so.request_id = r.id
    WHERE so.cancel_token = ?
  `).get(token) as any;

  if (!order) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const expired = new Date() > new Date(order.cancel_expires_at);
  return NextResponse.json({ order, expired });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  const order = db.prepare(`
    SELECT so.*, r.product, r.quantity
    FROM supplier_orders so
    JOIN requests r ON so.request_id = r.id
    WHERE so.cancel_token = ? AND so.status = 'confirmed'
  `).get(token) as any;

  if (!order) return NextResponse.json({ error: 'Lien invalide ou déjà utilisé' }, { status: 404 });

  const expired = new Date() > new Date(order.cancel_expires_at);
  if (expired) return NextResponse.json({ error: "Délai d'annulation dépassé (2h)" }, { status: 410 });

  // Canac and Home Depot don't support automated cancellation yet
  if (order.supplier !== 'lumen') {
    return NextResponse.json({ error: `Annulation automatique non disponible pour ${order.supplier}. Contactez le fournisseur directement.` }, { status: 400 });
  }

  const account = db.prepare('SELECT * FROM supplier_accounts WHERE supplier = ? AND company_id = ? LIMIT 1').get(order.supplier, order.company_id) as any;
  if (!account) return NextResponse.json({ error: 'Compte fournisseur non configuré' }, { status: 500 });

  const password = decrypt(account.password_encrypted);
  const cancelled = await cancelLumenOrder(account.username, password, order.supplier_order_id);

  db.prepare('UPDATE supplier_orders SET status = ? WHERE cancel_token = ?')
    .run(cancelled ? 'cancelled' : 'failed', token);

  return NextResponse.json({ success: cancelled });
}
