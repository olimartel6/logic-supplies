import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const db = getDb();
  const cid = ctx.companyId;

  // Monthly expenses (last 6 months)
  const monthlyExpenses = db.prepare(`
    SELECT strftime('%Y-%m', r.created_at) as month,
           SUM(COALESCE(p.price, 0) * r.quantity) as total
    FROM requests r
    LEFT JOIN products p ON LOWER(p.name) = LOWER(r.product) AND p.supplier = COALESCE(r.supplier, 'lumen')
    WHERE r.company_id = ? AND r.status = 'approved'
      AND r.created_at >= date('now', '-6 months')
    GROUP BY month
    ORDER BY month ASC
  `).all(cid);

  // Top 10 products by frequency
  const topProducts = db.prepare(`
    SELECT product, supplier, COUNT(*) as order_count,
           SUM(quantity) as total_quantity
    FROM requests
    WHERE company_id = ? AND status = 'approved'
    GROUP BY product, supplier
    ORDER BY order_count DESC
    LIMIT 10
  `).all(cid);

  // Supplier distribution
  const supplierDistribution = db.prepare(`
    SELECT COALESCE(so.supplier, r.supplier, 'inconnu') as supplier,
           COUNT(*) as order_count
    FROM requests r
    LEFT JOIN supplier_orders so ON so.request_id = r.id
    WHERE r.company_id = ? AND r.status = 'approved'
    GROUP BY 1
    ORDER BY order_count DESC
  `).all(cid);

  // KPIs
  const ordersThisMonth = (db.prepare(`
    SELECT COUNT(*) as cnt FROM requests
    WHERE company_id = ? AND status = 'approved'
      AND created_at >= date('now', 'start of month')
  `).get(cid) as any).cnt;

  const pendingRequests = (db.prepare(`
    SELECT COUNT(*) as cnt FROM requests
    WHERE company_id = ? AND status = 'pending'
  `).get(cid) as any).cnt;

  // Estimated savings: diff between max and min price for ordered products
  const savings = (db.prepare(`
    SELECT SUM((pmax.price - pmin.price) * r.quantity) as total_savings
    FROM requests r
    JOIN (
      SELECT LOWER(name) as lname, MAX(price) as price
      FROM products GROUP BY lname
    ) pmax ON LOWER(r.product) = pmax.lname
    JOIN (
      SELECT LOWER(name) as lname, MIN(price) as price
      FROM products GROUP BY lname
    ) pmin ON LOWER(r.product) = pmin.lname
    WHERE r.company_id = ? AND r.status = 'approved'
      AND pmax.price > pmin.price
  `).get(cid) as any)?.total_savings || 0;

  return NextResponse.json({
    monthlyExpenses,
    topProducts,
    supplierDistribution,
    kpis: {
      ordersThisMonth,
      pendingRequests,
      estimatedSavings: Math.round(savings * 100) / 100,
    },
  });
}
