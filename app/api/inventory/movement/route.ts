import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const body = await req.json();
  const { item_id, action, quantity, location_id, from_location_id, to_location_id, note } = body;
  if (!item_id || !action || !quantity || quantity <= 0) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
  }
  const db = getDb();
  const item = db.prepare('SELECT id FROM inventory_items WHERE id = ? AND company_id = ?').get(item_id, ctx.companyId);
  if (!item) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 });

  const doMovement = db.transaction(() => {
    if (action === 'entry') {
      db.prepare(`
        INSERT INTO inventory_stock (item_id, location_id, company_id, quantity)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(item_id, location_id) DO UPDATE SET
          quantity = quantity + excluded.quantity,
          updated_at = CURRENT_TIMESTAMP
      `).run(item_id, location_id, ctx.companyId, quantity);
      db.prepare(`
        INSERT INTO inventory_logs (company_id, user_id, item_id, location_id, action, quantity, note)
        VALUES (?, ?, ?, ?, 'entry', ?, ?)
      `).run(ctx.companyId, ctx.userId, item_id, location_id, quantity, note || null);
    } else if (action === 'exit') {
      const stock = db.prepare('SELECT quantity FROM inventory_stock WHERE item_id = ? AND location_id = ?').get(item_id, location_id) as { quantity: number } | undefined;
      if (!stock || stock.quantity < quantity) throw new Error('Stock insuffisant');
      db.prepare(`UPDATE inventory_stock SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ? AND location_id = ?`).run(quantity, item_id, location_id);
      db.prepare(`INSERT INTO inventory_logs (company_id, user_id, item_id, location_id, action, quantity, note) VALUES (?, ?, ?, ?, 'exit', ?, ?)`).run(ctx.companyId, ctx.userId, item_id, location_id, quantity, note || null);
    } else if (action === 'transfer') {
      const stock = db.prepare('SELECT quantity FROM inventory_stock WHERE item_id = ? AND location_id = ?').get(item_id, from_location_id) as { quantity: number } | undefined;
      if (!stock || stock.quantity < quantity) throw new Error('Stock insuffisant');
      db.prepare(`UPDATE inventory_stock SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ? AND location_id = ?`).run(quantity, item_id, from_location_id);
      db.prepare(`INSERT INTO inventory_stock (item_id, location_id, company_id, quantity) VALUES (?, ?, ?, ?) ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`).run(item_id, to_location_id, ctx.companyId, quantity);
      db.prepare(`INSERT INTO inventory_logs (company_id, user_id, item_id, action, quantity, from_location_id, to_location_id, note) VALUES (?, ?, ?, 'transfer', ?, ?, ?, ?)`).run(ctx.companyId, ctx.userId, item_id, quantity, from_location_id, to_location_id, note || null);
    }
  });

  try {
    doMovement();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'Stock insuffisant') return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
