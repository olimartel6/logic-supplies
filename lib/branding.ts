import { getDb } from './db';

export interface Branding {
  appName: string;
  primaryColor: string;
  sidebarBg: string;
  logoUrl: string | null;
}

const DEFAULTS: Branding = {
  appName: 'LogicSupplies',
  primaryColor: '#2563eb',  // blue-600
  sidebarBg: '#1e293b',     // slate-800
  logoUrl: null,
};

export function getCompanyBranding(companyId: number): Branding {
  const db = getDb();
  const row = db.prepare('SELECT branding, company_logo_url FROM company_settings WHERE company_id = ?').get(companyId) as any;

  const saved = row?.branding ? JSON.parse(row.branding) : {};
  return {
    appName: saved.appName || DEFAULTS.appName,
    primaryColor: saved.primaryColor || DEFAULTS.primaryColor,
    sidebarBg: saved.sidebarBg || DEFAULTS.sidebarBg,
    logoUrl: saved.logoUrl || row?.company_logo_url || DEFAULTS.logoUrl,
  };
}

export function setCompanyBranding(companyId: number, branding: Partial<Branding>) {
  const db = getDb();
  const current = getCompanyBranding(companyId);
  const updated = { ...current, ...branding };
  db.prepare('UPDATE company_settings SET branding = ? WHERE company_id = ?').run(JSON.stringify(updated), companyId);
}

export { DEFAULTS as BRANDING_DEFAULTS };
