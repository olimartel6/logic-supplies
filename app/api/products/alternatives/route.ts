import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get('name') || '';
  if (!name) return NextResponse.json([]);

  const db = getDb();

  // Stage 1: exact name match
  let rows = db.prepare(
    'SELECT DISTINCT supplier FROM products WHERE LOWER(name) = LOWER(?)'
  ).all(name) as { supplier: string }[];

  // Stage 2: if not enough, use keyword search (all significant tokens must match)
  if (rows.length <= 1) {
    const tokens = name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9/]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(t => t.length >= 3);

    if (tokens.length > 0) {
      // Use the longest/most specific tokens (up to 3) for matching
      const searchTokens = tokens
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);

      const whereParts = searchTokens.map(() => 'normalize_text(name) LIKE ?');
      const params = searchTokens.map(t => `%${t}%`);

      rows = db.prepare(
        `SELECT DISTINCT supplier FROM products WHERE ${whereParts.join(' AND ')}`
      ).all(...params) as { supplier: string }[];
    }
  }

  return NextResponse.json(rows.map(r => r.supplier));
}
