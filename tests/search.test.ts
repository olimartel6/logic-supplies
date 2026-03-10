import { describe, it, expect } from 'vitest';
import { getDb } from '@/lib/db';

describe('Product Search', () => {
  function seedProducts() {
    const db = getDb();
    const products = [
      { supplier: 'lumen', sku: 'FIL-14-2', name: 'Fil 14/2 NMD90 150m', price: 89.99, unit: 'rouleau', category: 'Fils et câbles' },
      { supplier: 'lumen', sku: 'FIL-12-2', name: 'Fil 12/2 NMD90 75m', price: 79.99, unit: 'rouleau', category: 'Fils et câbles' },
      { supplier: 'canac', sku: 'DISJ-15A', name: 'Disjoncteur 15A Siemens', price: 12.49, unit: 'unité', category: 'Disjoncteurs' },
      { supplier: 'canac', sku: 'DISJ-20A', name: 'Disjoncteur 20A Siemens', price: 13.99, unit: 'unité', category: 'Disjoncteurs' },
      { supplier: 'homedepot', sku: 'BOX-4X4', name: 'Boîte 4x4 métallique', price: 3.49, unit: 'unité', category: 'Boîtes' },
      { supplier: 'lumen', sku: 'MARR-YEL', name: 'Marrette jaune (100/boîte)', price: 8.99, unit: 'boîte', category: 'Connecteurs' },
    ];

    const stmt = db.prepare(`
      INSERT INTO products (supplier, sku, name, price, unit, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const p of products) {
      stmt.run(p.supplier, p.sku, p.name, p.price, p.unit, p.category);
    }
  }

  it('searches products by name (case-insensitive LIKE)', () => {
    seedProducts();
    const db = getDb();

    const results = db.prepare(
      "SELECT * FROM products WHERE LOWER(name) LIKE LOWER(?)"
    ).all('%fil%') as any[];

    expect(results.length).toBe(2);
    expect(results.every((r: any) => r.name.toLowerCase().includes('fil'))).toBe(true);
  });

  it('searches products case-insensitively', () => {
    seedProducts();
    const db = getDb();

    const upper = db.prepare(
      "SELECT * FROM products WHERE LOWER(name) LIKE LOWER(?)"
    ).all('%DISJONCTEUR%') as any[];

    const lower = db.prepare(
      "SELECT * FROM products WHERE LOWER(name) LIKE LOWER(?)"
    ).all('%disjoncteur%') as any[];

    expect(upper.length).toBe(lower.length);
    expect(upper.length).toBe(2);
  });

  it('filters products by supplier', () => {
    seedProducts();
    const db = getDb();

    const lumenProducts = db.prepare(
      "SELECT * FROM products WHERE supplier = ?"
    ).all('lumen') as any[];

    expect(lumenProducts.length).toBe(3);
    expect(lumenProducts.every((p: any) => p.supplier === 'lumen')).toBe(true);

    const canacProducts = db.prepare(
      "SELECT * FROM products WHERE supplier = ?"
    ).all('canac') as any[];

    expect(canacProducts.length).toBe(2);
    expect(canacProducts.every((p: any) => p.supplier === 'canac')).toBe(true);
  });

  it('combines name search with supplier filter', () => {
    seedProducts();
    const db = getDb();

    const results = db.prepare(
      "SELECT * FROM products WHERE LOWER(name) LIKE LOWER(?) AND supplier = ?"
    ).all('%fil%', 'lumen') as any[];

    expect(results.length).toBe(2);
    expect(results.every((r: any) => r.supplier === 'lumen' && r.name.toLowerCase().includes('fil'))).toBe(true);
  });

  it('returns empty results for non-existent products', () => {
    seedProducts();
    const db = getDb();

    const results = db.prepare(
      "SELECT * FROM products WHERE LOWER(name) LIKE LOWER(?)"
    ).all('%inexistant%') as any[];

    expect(results.length).toBe(0);
  });
});
