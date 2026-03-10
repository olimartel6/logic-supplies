/**
 * Minimal DB wrapper — prépare le terrain pour une migration PostgreSQL future.
 *
 * Usage actuel : tout le code existant continue d'utiliser getDb() + db.prepare().
 * Le nouveau code PEUT utiliser ce wrapper pour être déjà compatible PG.
 *
 * Quand DATABASE_URL sera configuré sur Railway, ce wrapper utilisera pg au lieu de SQLite.
 * Pour l'instant, il délègue tout à better-sqlite3.
 *
 * Migration future :
 *   1. npm install pg
 *   2. Configurer DATABASE_URL sur Railway
 *   3. Convertir les appels db.prepare() vers dbQuery() progressivement
 */

import { getDb } from './db';

type ParamValue = string | number | null | boolean | bigint;

interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  lastId?: number | bigint;
}

const isPg = !!process.env.DATABASE_URL;

/**
 * Execute a SQL query with parameters.
 * SQLite uses ? placeholders, PG uses $1/$2/etc.
 * This wrapper accepts ? and converts for PG when needed.
 */
export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params: ParamValue[] = [],
): Promise<QueryResult<T>> {
  if (isPg) {
    // Future: use pg pool here
    // const { Pool } = await import('pg');
    // const pool = getPgPool();
    // const pgSql = sql.replace(/\?/g, (() => { let i = 0; return () => `$${++i}`; })());
    // const result = await pool.query(pgSql, params);
    // return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    throw new Error('PostgreSQL non configuré. Installez pg et configurez DATABASE_URL.');
  }

  const db = getDb();
  const trimmed = sql.trim();
  const isSelect = /^SELECT/i.test(trimmed);

  if (isSelect) {
    const rows = db.prepare(sql).all(...params) as T[];
    return { rows, rowCount: rows.length };
  } else {
    const result = db.prepare(sql).run(...params);
    return {
      rows: [] as T[],
      rowCount: result.changes,
      lastId: result.lastInsertRowid,
    };
  }
}

/**
 * Execute a SELECT and return all rows.
 */
export async function dbAll<T = Record<string, unknown>>(
  sql: string,
  params: ParamValue[] = [],
): Promise<T[]> {
  const { rows } = await dbQuery<T>(sql, params);
  return rows;
}

/**
 * Execute a SELECT and return the first row or null.
 */
export async function dbGet<T = Record<string, unknown>>(
  sql: string,
  params: ParamValue[] = [],
): Promise<T | null> {
  if (isPg) {
    const { rows } = await dbQuery<T>(sql, params);
    return rows[0] ?? null;
  }
  const db = getDb();
  return (db.prepare(sql).get(...params) as T) ?? null;
}

/**
 * Execute an INSERT/UPDATE/DELETE and return changes + lastId.
 */
export async function dbRun(
  sql: string,
  params: ParamValue[] = [],
): Promise<{ changes: number; lastId: number | bigint }> {
  const { rowCount, lastId } = await dbQuery(sql, params);
  return { changes: rowCount, lastId: lastId ?? 0 };
}

/**
 * Run multiple statements in a transaction.
 */
export async function dbTransaction<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  if (isPg) {
    // Future: BEGIN/COMMIT/ROLLBACK with pg client
    throw new Error('PostgreSQL transactions non implémentées.');
  }
  const db = getDb();
  return db.transaction(fn)();
}

/**
 * Helper: returns 'sqlite' or 'pg' for conditional SQL.
 */
export function dbDialect(): 'sqlite' | 'pg' {
  return isPg ? 'pg' : 'sqlite';
}

/**
 * Helper: normalize text for accent-insensitive search.
 * SQLite: uses custom normalize_text() function.
 * PG: will use unaccent(lower(...)) — requires CREATE EXTENSION unaccent.
 */
export function normalizeExpr(column: string): string {
  return isPg
    ? `unaccent(lower(${column}))`
    : `normalize_text(${column})`;
}

/**
 * Helper: current timestamp expression.
 */
export function nowExpr(): string {
  return isPg ? 'NOW()' : "datetime('now')";
}
