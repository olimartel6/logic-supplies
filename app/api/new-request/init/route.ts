import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { getCompanyFeatures } from '@/lib/features';
import { getCompanyBranding } from '@/lib/branding';

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }

  const db = getDb();
  const cid = session.companyId;

  // User info (same as /api/auth/me)
  const settings = db.prepare('SELECT inventory_enabled, marketing_enabled, supplier_preference FROM company_settings WHERE company_id = ?').get(cid) as any;
  const userRow = db.prepare('SELECT language FROM users WHERE id = ?').get(session.userId) as any;

  // Job sites
  const jobSites = db.prepare('SELECT id, name, address FROM job_sites WHERE company_id = ? ORDER BY name').all(cid);

  // Favorites
  const favoriteRows = db.prepare(`
    SELECT p.name, p.sku, p.image_url, p.price, p.unit, p.category, p.supplier
    FROM product_favorites f
    JOIN products p ON f.supplier = p.supplier AND f.sku = p.sku
    WHERE f.company_id = ?
    ORDER BY f.created_at DESC
  `).all(cid);

  // Templates
  const templates = db.prepare(
    'SELECT t.id, t.name, t.use_count, u.name as creator_name FROM order_templates t LEFT JOIN users u ON t.created_by = u.id WHERE t.company_id = ? ORDER BY t.use_count DESC, t.created_at DESC'
  ).all(cid);

  return NextResponse.json({
    user: {
      id: session.userId,
      companyId: cid,
      name: session.name,
      email: session.email,
      role: session.role,
      inventoryEnabled: !!settings?.inventory_enabled,
      marketingEnabled: !!settings?.marketing_enabled,
      language: userRow?.language ?? 'fr',
      features: cid ? getCompanyFeatures(cid) : {},
      branding: cid ? getCompanyBranding(cid) : null,
    },
    jobSites,
    preference: settings?.supplier_preference || 'cheapest',
    favorites: favoriteRows,
    templates,
  });
}
