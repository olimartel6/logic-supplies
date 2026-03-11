import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }

  const db = getDb();
  const cid = session.companyId;

  // User info
  const settings = db.prepare('SELECT inventory_enabled, marketing_enabled FROM company_settings WHERE company_id = ?').get(cid) as any;

  // Inventory items with total stock
  const items = db.prepare(`
    SELECT i.id, i.company_id, i.barcode, i.name, i.unit, i.description, i.min_stock, i.created_at,
      COALESCE(SUM(s.quantity), 0) as total_stock
    FROM inventory_items i
    LEFT JOIN inventory_stock s ON s.item_id = i.id
    WHERE i.company_id = ?
    GROUP BY i.id
    ORDER BY i.name
  `).all(cid);

  // Locations
  const locations = db.prepare(`
    SELECT l.*, j.name as job_site_name
    FROM inventory_locations l
    LEFT JOIN job_sites j ON l.job_site_id = j.id
    WHERE l.company_id = ?
    ORDER BY l.name
  `).all(cid);

  // Stock breakdown
  const stock = db.prepare(`
    SELECT s.item_id, s.location_id, s.quantity,
      i.name as item_name, i.barcode, i.unit,
      l.name as location_name, l.type as location_type
    FROM inventory_stock s
    JOIN inventory_items i ON i.id = s.item_id
    JOIN inventory_locations l ON l.id = s.location_id
    WHERE s.company_id = ? AND s.quantity > 0
    ORDER BY i.name, l.name
  `).all(cid);

  // Tracked orders (default: ordered)
  const trackedOrders = db.prepare(`
    SELECT r.id, r.product, r.quantity, r.unit, r.supplier, r.tracking_status,
           so.supplier as order_supplier, j.name as job_site_name,
           pu.name as picked_up_by_name, r.picked_up_at, pj.name as picked_up_job_site_name
    FROM requests r
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    LEFT JOIN supplier_orders so ON so.request_id = r.id
    LEFT JOIN users pu ON r.picked_up_by = pu.id
    LEFT JOIN job_sites pj ON r.picked_up_job_site_id = pj.id
    WHERE r.company_id = ? AND r.tracking_status = 'ordered'
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(cid);

  // Received orders
  const receivedOrders = db.prepare(`
    SELECT r.id, r.product, r.quantity, r.unit, r.supplier, r.tracking_status,
           so.supplier as order_supplier, j.name as job_site_name,
           pu.name as picked_up_by_name, r.picked_up_at, pj.name as picked_up_job_site_name
    FROM requests r
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    LEFT JOIN supplier_orders so ON so.request_id = r.id
    LEFT JOIN users pu ON r.picked_up_by = pu.id
    LEFT JOIN job_sites pj ON r.picked_up_job_site_id = pj.id
    WHERE r.company_id = ? AND r.tracking_status = 'received'
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(cid);

  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      role: session.role,
      inventoryEnabled: !!settings?.inventory_enabled,
      marketingEnabled: !!settings?.marketing_enabled,
    },
    items,
    locations,
    stock,
    trackedOrders,
    receivedOrders,
  });
}
