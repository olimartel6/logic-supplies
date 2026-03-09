import { getDb } from './db';

// Feature definitions — add new features here with defaultEnabled: false
// to gate them behind a flag. Existing features use defaultEnabled: true.
export const FEATURE_DEFS: Record<string, { label: string; defaultEnabled: boolean }> = {
  messaging: { label: 'Messagerie', defaultEnabled: true },
};

export function getCompanyFeatures(companyId: number): Record<string, boolean> {
  const db = getDb();
  const row = db.prepare('SELECT features FROM companies WHERE id = ?').get(companyId) as any;
  const saved: Record<string, boolean> = row?.features ? JSON.parse(row.features) : {};

  const result: Record<string, boolean> = {};
  for (const [key, def] of Object.entries(FEATURE_DEFS)) {
    result[key] = key in saved ? !!saved[key] : def.defaultEnabled;
  }
  return result;
}

export function isFeatureEnabled(companyId: number, feature: string): boolean {
  return !!getCompanyFeatures(companyId)[feature];
}

export function setCompanyFeatures(companyId: number, features: Record<string, boolean>) {
  const db = getDb();
  db.prepare('UPDATE companies SET features = ? WHERE id = ?').run(JSON.stringify(features), companyId);
}
