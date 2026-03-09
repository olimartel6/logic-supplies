import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

let db: Database.Database;

export function getDb() {
  if (!db) {
    const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'sparky.db');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    // Custom SQLite function: accent-insensitive, case-insensitive, dimension-normalized search
    // e.g. "Boîte 4 x 4 po" → "boite 4x4 po"  /  "Fil 12/2 AWG" → "fil 12/2 awg"
    db.function('normalize_text', (text: unknown) => {
      if (!text || typeof text !== 'string') return '';
      return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // strip accents: é→e, î→i, etc.
        .toLowerCase()
        .replace(/(\d)\s*[xX×]\s*(\d)/g, '$1x$2') // "4 x 4" / "4 X 4" → "4x4"
        .replace(/\s+/g, ' ')
        .trim();
    });
    initDb(db);
  }
  return db;
}

export function seedCompanyDefaults(db: Database.Database, companyId: number) {
  const seed = db.transaction(() => {
    // company_settings par défaut
    db.prepare(`
      INSERT OR IGNORE INTO company_settings (company_id, supplier_preference, large_order_threshold)
      VALUES (?, 'cheapest', 2000)
    `).run(companyId);

    // Catégories Lumen (toutes les catégories du site)
    const lumenCategories = [
      { name: 'Fils et câbles',           url: '/en/products/28-wire-cords-cables',                          enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/en/products/20-power-distribution',                         enabled: 1 },
      { name: 'Conduits et chemins',      url: '/en/products/11-conduit-raceway-strut',                      enabled: 1 },
      { name: 'Boîtes et boîtiers',       url: '/en/products/15-enclosures-boxes',                           enabled: 1 },
      { name: 'Éclairage',                url: '/en/products/18-lighting',                                   enabled: 1 },
      { name: 'Automatisation',           url: '/en/products/12-control-automation',                         enabled: 0 },
      { name: 'Outils',                   url: '/en/products/25-tools-instruments',                          enabled: 0 },
      { name: 'Prises et interrupteurs',  url: '/en/products/24-wiring-devices-wallplates',                  enabled: 1 },
      { name: 'Terminaison de fils',      url: '/en/products/27-wire-termination-wire-marking-supplies',     enabled: 0 },
      { name: 'Quincaillerie',            url: '/en/products/16-fasteners-hardwares',                        enabled: 0 },
      { name: 'Sécurité',                 url: '/en/products/22-safety-products',                            enabled: 0 },
      { name: 'Moteurs et sources',       url: '/en/products/21-power-sources-motors',                       enabled: 0 },
      { name: 'Datacom',                  url: '/en/products/13-datacom',                                    enabled: 0 },
      { name: 'Bornes de recharge VÉ',    url: '/en/products/32-ev-charging-stations',                       enabled: 0 },
      { name: 'Chauffage et ventilation', url: '/en/products/17-heat-ventilation',                           enabled: 0 },
      { name: 'Adhésifs et produits',     url: '/en/products/10-adhesives-chemicals-lubricants',             enabled: 0 },
      { name: 'Utilité électrique',       url: '/en/products/14-electric-utility-outside-plant-products',    enabled: 0 },
      { name: 'Liquidation',              url: '/en/products/50-clearance',                                  enabled: 0 },
    ];
    for (const c of lumenCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('lumen', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Canac (URLs SAP Commerce Cloud — format /canac/fr/2/c/<CODE>)
    const canacCategories = [
      { name: 'Fils et câbles',           url: '/canac/fr/2/c/EL25', enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/canac/fr/2/c/EL45', enabled: 1 },
      { name: 'Boîtes et conduits',       url: '/canac/fr/2/c/EL20', enabled: 0 },
      { name: 'Interrupteurs et prises',  url: '/canac/fr/2/c/EL55', enabled: 0 },
      { name: 'Éclairage',                url: '/canac/fr/2/c/EL35', enabled: 0 },
    ];
    for (const c of canacCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('canac', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Home Depot
    const hdCategories = [
      { name: 'Fils et câbles',           url: '/fr/b/Électricité-Câbles-et-câblage/N-5yc1vZbmg1',       enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/fr/b/Électricité-Disjoncteurs/N-5yc1vZc86v',             enabled: 1 },
      { name: 'Boîtes électriques',       url: '/fr/b/Électricité-Boîtes-électriques/N-5yc1vZbmde',      enabled: 0 },
      { name: 'Interrupteurs et prises',  url: '/fr/b/Électricité-Prises-et-interrupteurs/N-5yc1vZc7md', enabled: 0 },
      { name: 'Éclairage',                url: '/fr/b/Éclairage/N-5yc1vZbq6g',                           enabled: 0 },
    ];
    for (const c of hdCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('homedepot', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Guillevin (Shopify collections)
    const guillevinCategories = [
      { name: 'Fils et câbles',           url: '/collections/wire-cable',                                    enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/collections/breakers-load-centres',                         enabled: 1 },
      { name: 'Boîtes électriques',       url: '/collections/electrical-boxes',                              enabled: 1 },
      { name: 'Boîtiers et armoires',     url: '/collections/electrical-enclosures-cabinets',                enabled: 0 },
      { name: 'Prises électriques',       url: '/collections/electrical-receptacles',                        enabled: 1 },
      { name: 'Interrupteurs',            url: '/collections/switches',                                      enabled: 1 },
      { name: 'Plaques et couvercles',    url: '/collections/plates-covers',                                 enabled: 1 },
      { name: 'Conduits et tuyaux',       url: '/collections/conduits-pipes',                                enabled: 1 },
      { name: 'Luminaires',               url: '/collections/lighting',                                      enabled: 0 },
      { name: 'Outils',                   url: '/collections/tools',                                         enabled: 0 },
      { name: 'Rubans et adhésifs',       url: '/collections/tapes-adhesives',                               enabled: 0 },
      { name: 'Marrettes et connecteurs', url: '/collections/wire-connectors-twist-on-wire-caps-marrette',   enabled: 1 },
      { name: 'Fusibles',                 url: '/collections/fuses-accessories',                             enabled: 0 },
      { name: 'Mise à la terre',          url: '/collections/grounding-clamps-connectors',                   enabled: 0 },
      { name: 'Cosses et bornes',         url: '/collections/lugs-terminal-connectors',                      enabled: 0 },
      { name: 'Attaches et supports',     url: '/collections/cable-ties-accessories',                        enabled: 0 },
    ];
    for (const c of guillevinCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('guillevin', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories JSV (Shopify — handles réels du site groupejsv.com)
    const jsvCategories = [
      { name: 'Câbles électriques',     url: '/collections/cables-electriques',               enabled: 1 },
      { name: 'Outils électriques',     url: '/collections/outils-electriques',               enabled: 1 },
      { name: 'Outils sans-fil',        url: '/collections/outils-sans-fil',                  enabled: 1 },
      { name: 'Pinces d\'électricien',  url: '/collections/pinces-delectricien',              enabled: 1 },
      { name: 'Pinces à dénuder',       url: '/collections/pinces-a-denuder',                 enabled: 1 },
      { name: 'Rallonges électriques',  url: '/collections/devidoirs-et-rallonges-electriques', enabled: 1 },
      { name: 'Rubans isolants',        url: '/collections/rubans-adhesifs-isolants',         enabled: 1 },
      { name: 'Lampes de poche',        url: '/collections/lampes-de-poche',                  enabled: 0 },
      { name: 'Tournevis',              url: '/collections/tournevis',                        enabled: 0 },
      { name: 'Perceuses',              url: '/collections/perceuses',                        enabled: 0 },
    ];
    for (const c of jsvCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('jsv', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Westburne
    const westburneCategories = [
      { name: 'Fils et câbles',           url: '/cwr/c/WIRE/products?pageSize=100',     enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/cwr/c/BREAKERS/products?pageSize=100', enabled: 1 },
      { name: 'Boîtes et conduits',       url: '/cwr/c/CONDUIT/products?pageSize=100',  enabled: 0 },
      { name: 'Éclairage',                url: '/cwr/c/LIGHTING/products?pageSize=100', enabled: 0 },
    ];
    for (const c of westburneCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('westburne', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Nedco
    const nedcoCategories = [
      { name: 'Fils et câbles',           url: '/cnd/c/WIRE/products?pageSize=100',     enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/cnd/c/BREAKERS/products?pageSize=100', enabled: 1 },
      { name: 'Boîtes et conduits',       url: '/cnd/c/CONDUIT/products?pageSize=100',  enabled: 0 },
      { name: 'Éclairage',                url: '/cnd/c/LIGHTING/products?pageSize=100', enabled: 0 },
    ];
    for (const c of nedcoCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('nedco', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Futech
    const futechCategories = [
      { name: 'Distribution électrique', url: '/fr/c/distribution-electrique',  enabled: 1 },
      { name: 'Automatisation',          url: '/fr/c/automatisation',            enabled: 1 },
      { name: 'Éclairage',               url: '/fr/c/eclairage',                 enabled: 0 },
      { name: 'Outils',                  url: '/fr/c/outils',                    enabled: 0 },
    ];
    for (const c of futechCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('futech', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories Deschênes
    const deschenesCategories = [
      { name: 'Électricité',       url: '/s/electricite',        enabled: 1 },
      { name: 'Plomberie',         url: '/s/plomberie',          enabled: 0 },
      { name: 'CVC',               url: '/s/cvc',                enabled: 0 },
    ];
    for (const c of deschenesCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('deschenes', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Catégories BMR
    const bmrCategories = [
      { name: 'Fils et câbles',        url: '/fr/electricite/fils-prises-et-fiches.html',   enabled: 1 },
      { name: 'Disjoncteurs',          url: '/fr/electricite/disjoncteurs-et-fusibles.html', enabled: 1 },
      { name: 'Boîtes électriques',    url: '/fr/electricite/boites-electriques.html',       enabled: 1 },
      { name: 'Éclairage',             url: '/fr/luminaires-et-eclairage.html',               enabled: 0 },
    ];
    for (const c of bmrCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('bmr', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
    }

    // Visibilité fournisseurs — tous cachés par défaut
    for (const s of ['lumen','canac','homedepot','guillevin','jsv','westburne','nedco','futech','deschenes','bmr']) {
      db.prepare(
        'INSERT OR IGNORE INTO supplier_visibility (company_id, supplier, visible) VALUES (?, ?, 0)'
      ).run(companyId, s);
    }
  });
  seed();
}

export function seedSuperadminCategories(db: Database.Database) {
  // Utilise company_id = 0 comme sentinelle super admin
  // SQLite n'enforce pas les FK par défaut (pas de PRAGMA foreign_keys = ON)
  const seed = db.transaction(() => {
    const allCategories: Array<{ supplier: string; name: string; url: string }> = [
      // Lumen
      { supplier: 'lumen', name: 'Fils et câbles',           url: '/en/products/28-wire-cords-cables' },
      { supplier: 'lumen', name: 'Disjoncteurs et panneaux', url: '/en/products/20-power-distribution' },
      { supplier: 'lumen', name: 'Conduits et chemins',      url: '/en/products/11-conduit-raceway-strut' },
      { supplier: 'lumen', name: 'Boîtes et boîtiers',       url: '/en/products/15-enclosures-boxes' },
      { supplier: 'lumen', name: 'Éclairage',                url: '/en/products/18-lighting' },
      { supplier: 'lumen', name: 'Automatisation',           url: '/en/products/12-control-automation' },
      { supplier: 'lumen', name: 'Outils',                   url: '/en/products/25-tools-instruments' },
      { supplier: 'lumen', name: 'Prises et interrupteurs',  url: '/en/products/24-wiring-devices-wallplates' },
      { supplier: 'lumen', name: 'Terminaison de fils',      url: '/en/products/27-wire-termination-wire-marking-supplies' },
      { supplier: 'lumen', name: 'Quincaillerie',            url: '/en/products/16-fasteners-hardwares' },
      { supplier: 'lumen', name: 'Sécurité',                 url: '/en/products/22-safety-products' },
      { supplier: 'lumen', name: 'Moteurs et sources',       url: '/en/products/21-power-sources-motors' },
      { supplier: 'lumen', name: 'Datacom',                  url: '/en/products/13-datacom' },
      { supplier: 'lumen', name: 'Bornes de recharge VÉ',    url: '/en/products/32-ev-charging-stations' },
      { supplier: 'lumen', name: 'Chauffage et ventilation', url: '/en/products/17-heat-ventilation' },
      { supplier: 'lumen', name: 'Adhésifs et produits',     url: '/en/products/10-adhesives-chemicals-lubricants' },
      { supplier: 'lumen', name: 'Utilité électrique',       url: '/en/products/14-electric-utility-outside-plant-products' },
      { supplier: 'lumen', name: 'Liquidation',              url: '/en/products/50-clearance' },
      // Canac
      { supplier: 'canac', name: 'Fils et câbles',           url: '/canac/fr/2/c/EL25' },
      { supplier: 'canac', name: 'Disjoncteurs et panneaux', url: '/canac/fr/2/c/EL45' },
      { supplier: 'canac', name: 'Boîtes et conduits',       url: '/canac/fr/2/c/EL20' },
      { supplier: 'canac', name: 'Interrupteurs et prises',  url: '/canac/fr/2/c/EL55' },
      { supplier: 'canac', name: 'Éclairage',                url: '/canac/fr/2/c/EL35' },
      // Home Depot
      { supplier: 'homedepot', name: 'Fils et câbles',           url: '/fr/b/Électricité-Câbles-et-câblage/N-5yc1vZbmg1' },
      { supplier: 'homedepot', name: 'Disjoncteurs et panneaux', url: '/fr/b/Électricité-Disjoncteurs/N-5yc1vZc86v' },
      { supplier: 'homedepot', name: 'Boîtes électriques',       url: '/fr/b/Électricité-Boîtes-électriques/N-5yc1vZbmde' },
      { supplier: 'homedepot', name: 'Interrupteurs et prises',  url: '/fr/b/Électricité-Prises-et-interrupteurs/N-5yc1vZc7md' },
      { supplier: 'homedepot', name: 'Éclairage',                url: '/fr/b/Éclairage/N-5yc1vZbq6g' },
      // Guillevin
      { supplier: 'guillevin', name: 'Fils et câbles',           url: '/collections/wire-cable' },
      { supplier: 'guillevin', name: 'Disjoncteurs et panneaux', url: '/collections/breakers-load-centres' },
      { supplier: 'guillevin', name: 'Boîtes électriques',       url: '/collections/electrical-boxes' },
      { supplier: 'guillevin', name: 'Boîtiers et armoires',     url: '/collections/electrical-enclosures-cabinets' },
      { supplier: 'guillevin', name: 'Prises électriques',       url: '/collections/electrical-receptacles' },
      { supplier: 'guillevin', name: 'Interrupteurs',            url: '/collections/switches' },
      { supplier: 'guillevin', name: 'Plaques et couvercles',    url: '/collections/plates-covers' },
      { supplier: 'guillevin', name: 'Conduits et tuyaux',       url: '/collections/conduits-pipes' },
      { supplier: 'guillevin', name: 'Luminaires',               url: '/collections/lighting' },
      { supplier: 'guillevin', name: 'Outils',                   url: '/collections/tools' },
      { supplier: 'guillevin', name: 'Rubans et adhésifs',       url: '/collections/tapes-adhesives' },
      { supplier: 'guillevin', name: 'Marrettes et connecteurs', url: '/collections/wire-connectors-twist-on-wire-caps-marrette' },
      { supplier: 'guillevin', name: 'Fusibles',                 url: '/collections/fuses-accessories' },
      { supplier: 'guillevin', name: 'Mise à la terre',          url: '/collections/grounding-clamps-connectors' },
      { supplier: 'guillevin', name: 'Cosses et bornes',         url: '/collections/lugs-terminal-connectors' },
      { supplier: 'guillevin', name: 'Attaches et supports',     url: '/collections/cable-ties-accessories' },
      // JSV
      { supplier: 'jsv', name: 'Câbles électriques',     url: '/collections/cables-electriques' },
      { supplier: 'jsv', name: 'Outils électriques',     url: '/collections/outils-electriques' },
      { supplier: 'jsv', name: 'Outils sans-fil',        url: '/collections/outils-sans-fil' },
      { supplier: 'jsv', name: 'Pinces d\'électricien',  url: '/collections/pinces-delectricien' },
      { supplier: 'jsv', name: 'Pinces à dénuder',       url: '/collections/pinces-a-denuder' },
      { supplier: 'jsv', name: 'Rallonges électriques',  url: '/collections/devidoirs-et-rallonges-electriques' },
      { supplier: 'jsv', name: 'Rubans isolants',        url: '/collections/rubans-adhesifs-isolants' },
      { supplier: 'jsv', name: 'Lampes de poche',        url: '/collections/lampes-de-poche' },
      { supplier: 'jsv', name: 'Tournevis',              url: '/collections/tournevis' },
      { supplier: 'jsv', name: 'Perceuses',              url: '/collections/perceuses' },
      // Westburne
      { supplier: 'westburne', name: 'Fils et câbles',           url: '/cwr/c/WIRE/products?pageSize=100' },
      { supplier: 'westburne', name: 'Disjoncteurs et panneaux', url: '/cwr/c/BREAKERS/products?pageSize=100' },
      { supplier: 'westburne', name: 'Boîtes et conduits',       url: '/cwr/c/CONDUIT/products?pageSize=100' },
      { supplier: 'westburne', name: 'Éclairage',                url: '/cwr/c/LIGHTING/products?pageSize=100' },
      // Nedco
      { supplier: 'nedco', name: 'Fils et câbles',           url: '/cnd/c/WIRE/products?pageSize=100' },
      { supplier: 'nedco', name: 'Disjoncteurs et panneaux', url: '/cnd/c/BREAKERS/products?pageSize=100' },
      { supplier: 'nedco', name: 'Boîtes et conduits',       url: '/cnd/c/CONDUIT/products?pageSize=100' },
      { supplier: 'nedco', name: 'Éclairage',                url: '/cnd/c/LIGHTING/products?pageSize=100' },
      // Futech
      { supplier: 'futech', name: 'Distribution électrique', url: '/fr/c/distribution-electrique' },
      { supplier: 'futech', name: 'Automatisation',          url: '/fr/c/automatisation' },
      { supplier: 'futech', name: 'Éclairage',               url: '/fr/c/eclairage' },
      { supplier: 'futech', name: 'Outils',                  url: '/fr/c/outils' },
      // Deschênes
      { supplier: 'deschenes', name: 'Électricité', url: '/s/electricite' },
      { supplier: 'deschenes', name: 'Plomberie',   url: '/s/plomberie' },
      { supplier: 'deschenes', name: 'CVC',         url: '/s/cvc' },
      // BMR
      { supplier: 'bmr', name: 'Fils et câbles',     url: '/fr/electricite/fils-prises-et-fiches.html' },
      { supplier: 'bmr', name: 'Disjoncteurs',        url: '/fr/electricite/disjoncteurs-et-fusibles.html' },
      { supplier: 'bmr', name: 'Boîtes électriques',  url: '/fr/electricite/boites-electriques.html' },
      { supplier: 'bmr', name: 'Éclairage',           url: '/fr/luminaires-et-eclairage.html' },
    ];
    for (const c of allCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES (?, ?, ?, 1, 0)"
      ).run(c.supplier, c.name, c.url);
    }
  });
  seed();
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subscription_status TEXT DEFAULT 'active'
        CHECK(subscription_status IN ('active', 'suspended', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('electrician', 'office', 'admin', 'superadmin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, company_id)
    );

    CREATE TABLE IF NOT EXISTS job_sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      address TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed')),
      budget_total REAL DEFAULT NULL,
      budget_committed REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      product TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      job_site_id INTEGER REFERENCES job_sites(id),
      electrician_id INTEGER REFERENCES users(id),
      urgency INTEGER DEFAULT 0,
      note TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      office_comment TEXT,
      supplier TEXT,
      decision_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      supplier TEXT NOT NULL DEFAULT 'lumen',
      username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      session_cookies TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      request_id INTEGER REFERENCES requests(id),
      supplier TEXT NOT NULL DEFAULT 'lumen',
      supplier_order_id TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','failed')),
      cancel_token TEXT UNIQUE,
      cancel_expires_at DATETIME,
      ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier TEXT NOT NULL DEFAULT 'lumen',
      sku TEXT,
      name TEXT NOT NULL,
      image_url TEXT,
      price REAL,
      unit TEXT,
      category TEXT,
      last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(supplier, sku)
    );

    CREATE TABLE IF NOT EXISTS supplier_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      supplier TEXT NOT NULL DEFAULT 'lumen',
      category_name TEXT NOT NULL,
      category_url TEXT NOT NULL,
      enabled INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS supplier_visibility (
      company_id INTEGER NOT NULL,
      supplier   TEXT NOT NULL,
      visible    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, supplier)
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
      supplier_preference TEXT NOT NULL DEFAULT 'cheapest'
        CHECK(supplier_preference IN ('cheapest', 'fastest')),
      lumen_rep_email TEXT,
      large_order_threshold REAL DEFAULT 2000,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budget_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      job_site_id INTEGER REFERENCES job_sites(id),
      type TEXT NOT NULL CHECK(type IN ('80_percent', '100_percent', 'large_order')),
      amount REAL,
      message TEXT,
      seen INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_order_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      request_id INTEGER REFERENCES requests(id),
      action TEXT NOT NULL CHECK(action IN ('preview', 'download', 'email_sent')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
    CREATE INDEX IF NOT EXISTS idx_job_sites_company ON job_sites(company_id);
    CREATE INDEX IF NOT EXISTS idx_requests_company ON requests(company_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_accounts_company ON supplier_accounts(company_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_categories_company ON supplier_categories(company_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_visibility_company ON supplier_visibility(company_id);
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_company ON budget_alerts(company_id);

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      barcode TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'unité',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, barcode)
    );

    CREATE TABLE IF NOT EXISTS inventory_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'warehouse'
        CHECK(type IN ('warehouse', 'truck', 'jobsite')),
      job_site_id INTEGER REFERENCES job_sites(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
      company_id INTEGER NOT NULL REFERENCES companies(id),
      quantity REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(item_id, location_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      location_id INTEGER REFERENCES inventory_locations(id),
      action TEXT NOT NULL CHECK(action IN ('entry', 'exit', 'transfer')),
      quantity REAL NOT NULL,
      from_location_id INTEGER REFERENCES inventory_locations(id),
      to_location_id INTEGER REFERENCES inventory_locations(id),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_items_company ON inventory_items(company_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(company_id, barcode);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock_item ON inventory_stock(item_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock_location ON inventory_stock(location_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_logs_company ON inventory_logs(company_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_signups (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      admin_password_hash TEXT NOT NULL,
      stripe_session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      token TEXT,
      verified INTEGER DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      supplier TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT,
      price REAL,
      unit TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, supplier, sku)
    );

    CREATE INDEX IF NOT EXISTS idx_product_favorites_user ON product_favorites(user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      recipient_id INTEGER REFERENCES users(id),
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(message_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_company ON messages(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(company_id, recipient_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(company_id, sender_id);

    CREATE TABLE IF NOT EXISTS company_payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
      card_holder TEXT NOT NULL,
      card_number_encrypted TEXT NOT NULL,
      card_expiry TEXT NOT NULL,
      card_last4 TEXT NOT NULL DEFAULT '',
      card_cvv_encrypted TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Auto-checkout delivery columns
  const csColsDelivery = db.pragma('table_info(company_settings)') as { name: string }[];
  if (!csColsDelivery.find(c => c.name === 'office_address')) {
    db.exec(`ALTER TABLE company_settings ADD COLUMN office_address TEXT`);
  }
  if (!csColsDelivery.find(c => c.name === 'default_delivery')) {
    db.exec(`ALTER TABLE company_settings ADD COLUMN default_delivery TEXT DEFAULT 'office' CHECK(default_delivery IN ('office', 'jobsite'))`);
  }

  const pmCols = db.pragma('table_info(company_payment_methods)') as { name: string }[];
  if (!pmCols.find(c => c.name === 'card_last4')) {
    db.exec(`ALTER TABLE company_payment_methods ADD COLUMN card_last4 TEXT NOT NULL DEFAULT ''`);
  }

  // Inventory feature flag
  const csColumns = db.pragma('table_info(company_settings)') as { name: string }[];
  if (!csColumns.find(c => c.name === 'inventory_enabled')) {
    db.exec(`ALTER TABLE company_settings ADD COLUMN inventory_enabled INTEGER DEFAULT 0`);
  }
  if (!csColumns.find(c => c.name === 'marketing_enabled')) {
    db.exec(`ALTER TABLE company_settings ADD COLUMN marketing_enabled INTEGER DEFAULT 0`);
  }

  // Order tracking columns on requests
  const reqCols = db.pragma('table_info(requests)') as { name: string }[];
  if (!reqCols.find(c => c.name === 'tracking_status')) {
    db.exec("ALTER TABLE requests ADD COLUMN tracking_status TEXT DEFAULT NULL");
  }
  if (!reqCols.find(c => c.name === 'picked_up_by')) {
    db.exec("ALTER TABLE requests ADD COLUMN picked_up_by INTEGER REFERENCES users(id)");
  }
  if (!reqCols.find(c => c.name === 'picked_up_at')) {
    db.exec("ALTER TABLE requests ADD COLUMN picked_up_at DATETIME");
  }
  if (!reqCols.find(c => c.name === 'picked_up_job_site_id')) {
    db.exec("ALTER TABLE requests ADD COLUMN picked_up_job_site_id INTEGER REFERENCES job_sites(id)");
  }
  if (!reqCols.find(c => c.name === 'supplier_modified_by')) {
    db.exec("ALTER TABLE requests ADD COLUMN supplier_modified_by TEXT DEFAULT NULL");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_requests_tracking ON requests(company_id, tracking_status)");

  // Low-stock alert threshold
  const invItemCols = db.pragma('table_info(inventory_items)') as { name: string }[];
  if (!invItemCols.find(c => c.name === 'min_stock')) {
    db.exec('ALTER TABLE inventory_items ADD COLUMN min_stock REAL DEFAULT NULL');
  }

  // User-level supplier preference (overrides company setting when set)
  const userCols = db.pragma('table_info(users)') as { name: string }[];
  if (!userCols.find(c => c.name === 'supplier_preference')) {
    db.exec(`ALTER TABLE users ADD COLUMN supplier_preference TEXT DEFAULT NULL`);
  }
  if (!userCols.find(c => c.name === 'auto_approve')) {
    db.exec(`ALTER TABLE users ADD COLUMN auto_approve INTEGER DEFAULT 0`);
  }
  if (!userCols.find(c => c.name === 'language')) {
    db.exec(`ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'fr'`);
  }

  // Sentinel company id=0 for superadmin operations (needed when FK constraints are enforced)
  db.prepare("INSERT OR IGNORE INTO companies (id, name, subscription_status) VALUES (0, '_superadmin', 'active')").run();

  // Stripe fields on companies
  const compCols = db.pragma('table_info(companies)') as { name: string }[];
  if (!compCols.find(c => c.name === 'stripe_customer_id'))
    db.exec('ALTER TABLE companies ADD COLUMN stripe_customer_id TEXT');
  if (!compCols.find(c => c.name === 'stripe_subscription_id'))
    db.exec('ALTER TABLE companies ADD COLUMN stripe_subscription_id TEXT');
  if (!compCols.find(c => c.name === 'superadmin_created'))
    db.exec('ALTER TABLE companies ADD COLUMN superadmin_created INTEGER DEFAULT 0');
  if (!compCols.find(c => c.name === 'features'))
    db.exec("ALTER TABLE companies ADD COLUMN features TEXT DEFAULT '{}'");

  // Error message column on supplier_orders
  const soCols = db.pragma('table_info(supplier_orders)') as { name: string }[];
  if (!soCols.find(c => c.name === 'error_message'))
    db.exec('ALTER TABLE supplier_orders ADD COLUMN error_message TEXT');

  // Seed unique superadmin (company_id IS NULL — cross-tenant)
  const existingSuperAdmin = db.prepare("SELECT id FROM users WHERE email = 'superadmin@sparky.app'").get();
  if (!existingSuperAdmin) {
    const superPassword: string = process.env.SUPERADMIN_PASSWORD || require('crypto').randomBytes(16).toString('hex');
    if (!process.env.SUPERADMIN_PASSWORD) {
      console.log('========================================');
      console.log('[SUPERADMIN] No SUPERADMIN_PASSWORD env var set.');
      console.log(`[SUPERADMIN] Generated password: ${superPassword}`);
      console.log('[SUPERADMIN] Set SUPERADMIN_PASSWORD to use a fixed password.');
      console.log('========================================');
    }
    const superHash = bcrypt.hashSync(superPassword, 10);
    db.prepare(`
      INSERT INTO users (company_id, name, email, password, role)
      VALUES (NULL, 'Super Admin', 'superadmin@sparky.app', ?, 'superadmin')
    `).run(superHash);
  }

  // Seed default monthly price (99 CAD = 9900 cents)
  const priceSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'monthly_price_cents'").get();
  if (!priceSetting) {
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('monthly_price_cents', '9900')").run();
  }

  // Seed default Stripe payment link (empty — superadmin must configure)
  const linkSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'stripe_payment_link'").get();
  if (!linkSetting) {
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('stripe_payment_link', '')").run();
  }

  // Fix stale BMR category URLs (old paths returned 404 — missing .html and wrong subcategory paths)
  // Also broaden fils-electriques → parent fils-prises-et-fiches to get more products
  const bmrUrlFixes: Array<{ old: string; new: string }> = [
    { old: '/fr/electricite',                                             new: '/fr/electricite/fils-prises-et-fiches.html' },
    { old: '/fr/electricite/fils-cables',                                 new: '/fr/electricite/fils-prises-et-fiches.html' },
    { old: '/fr/electricite/fils-prises-et-fiches/fils-electriques.html', new: '/fr/electricite/fils-prises-et-fiches.html' },
    { old: '/fr/electricite/disjoncteurs',                                new: '/fr/electricite/disjoncteurs-et-fusibles.html' },
    { old: '/fr/electricite/eclairage',                                   new: '/fr/luminaires-et-eclairage.html' },
  ];
  for (const fix of bmrUrlFixes) {
    db.prepare(
      "UPDATE supplier_categories SET category_url = ? WHERE supplier = 'bmr' AND category_url = ?"
    ).run(fix.new, fix.old);
  }
  // Enable Disjoncteurs and Boîtes électriques for BMR; insert if missing
  db.prepare(`
    INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id)
    SELECT 'bmr', 'Disjoncteurs', '/fr/electricite/disjoncteurs-et-fusibles.html', 1, id FROM companies
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id)
    SELECT 'bmr', 'Boîtes électriques', '/fr/electricite/boites-electriques.html', 1, id FROM companies
  `).run();
  db.prepare(
    "UPDATE supplier_categories SET enabled = 1 WHERE supplier = 'bmr' AND category_name IN ('Disjoncteurs', 'Boîtes électriques')"
  ).run();

  // --- Fix JSV categories: replace placeholder handles with real groupejsv.com collection handles ---
  const jsvUrlFixes = [
    { old: '/collections/power-tools', new: '/collections/outils-electriques',  name: 'Outils électriques' },
    { old: '/collections/electrical',  new: '/collections/cables-electriques',  name: 'Câbles électriques' },
    { old: '/collections/safety',      new: '/collections/pinces-delectricien', name: 'Pinces d\'électricien' },
    { old: '/collections/fasteners',   new: '/collections/rubans-adhesifs-isolants', name: 'Rubans isolants' },
  ];
  for (const fix of jsvUrlFixes) {
    db.prepare(
      "UPDATE supplier_categories SET category_url = ?, category_name = ?, enabled = 1 WHERE supplier = 'jsv' AND category_url = ?"
    ).run(fix.new, fix.name, fix.old);
  }
  // Insert additional JSV categories if missing (check existence first to avoid duplicates)
  const extraJsvCats = [
    { name: 'Outils sans-fil',        url: '/collections/outils-sans-fil' },
    { name: 'Pinces à dénuder',       url: '/collections/pinces-a-denuder' },
    { name: 'Rallonges électriques',  url: '/collections/devidoirs-et-rallonges-electriques' },
  ];
  const jsvCompanyIds = db.prepare(
    "SELECT DISTINCT company_id FROM supplier_categories WHERE supplier = 'jsv'"
  ).all() as { company_id: number }[];
  for (const c of extraJsvCats) {
    for (const row of jsvCompanyIds) {
      const exists = db.prepare(
        "SELECT 1 FROM supplier_categories WHERE supplier = 'jsv' AND category_url = ? AND company_id = ? LIMIT 1"
      ).get(c.url, row.company_id);
      if (!exists) {
        db.prepare(
          "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('jsv', ?, ?, 1, ?)"
        ).run(c.name, c.url, row.company_id);
      }
    }
  }

  // --- Fix Lumen categories: rename "Boîtes et conduits" and add all missing categories ---
  db.prepare(
    "UPDATE supplier_categories SET category_name = 'Conduits et chemins' WHERE supplier = 'lumen' AND category_url = '/en/products/11-conduit-raceway-strut'"
  ).run();

  const extraLumenCats = [
    { name: 'Boîtes et boîtiers',       url: '/en/products/15-enclosures-boxes',                        enabled: 1 },
    { name: 'Prises et interrupteurs',   url: '/en/products/24-wiring-devices-wallplates',               enabled: 1 },
    { name: 'Terminaison de fils',       url: '/en/products/27-wire-termination-wire-marking-supplies',  enabled: 0 },
    { name: 'Quincaillerie',             url: '/en/products/16-fasteners-hardwares',                     enabled: 0 },
    { name: 'Sécurité',                  url: '/en/products/22-safety-products',                         enabled: 0 },
    { name: 'Moteurs et sources',        url: '/en/products/21-power-sources-motors',                    enabled: 0 },
    { name: 'Datacom',                   url: '/en/products/13-datacom',                                 enabled: 0 },
    { name: 'Bornes de recharge VÉ',     url: '/en/products/32-ev-charging-stations',                    enabled: 0 },
    { name: 'Chauffage et ventilation',  url: '/en/products/17-heat-ventilation',                        enabled: 0 },
    { name: 'Adhésifs et produits',      url: '/en/products/10-adhesives-chemicals-lubricants',          enabled: 0 },
    { name: 'Utilité électrique',        url: '/en/products/14-electric-utility-outside-plant-products', enabled: 0 },
    { name: 'Liquidation',               url: '/en/products/50-clearance',                               enabled: 0 },
  ];
  // Insert per company_id (not global check) to ensure all companies get the new categories
  const lumenCompanyIds = db.prepare(
    "SELECT DISTINCT company_id FROM supplier_categories WHERE supplier = 'lumen'"
  ).all() as { company_id: number }[];
  for (const c of extraLumenCats) {
    for (const row of lumenCompanyIds) {
      const exists = db.prepare(
        "SELECT 1 FROM supplier_categories WHERE supplier = 'lumen' AND category_url = ? AND company_id = ? LIMIT 1"
      ).get(c.url, row.company_id);
      if (!exists) {
        db.prepare(
          "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('lumen', ?, ?, ?, ?)"
        ).run(c.name, c.url, c.enabled, row.company_id);
      }
    }
  }

  // Also enable Éclairage for existing DBs (was disabled before)
  db.prepare(
    "UPDATE supplier_categories SET enabled = 1 WHERE supplier = 'lumen' AND category_url = '/en/products/18-lighting'"
  ).run();

  // --- Fix Guillevin categories: replace empty collection and add missing ones ---
  db.prepare(
    "UPDATE supplier_categories SET category_name = 'Boîtes électriques', category_url = '/collections/electrical-boxes', enabled = 1 WHERE supplier = 'guillevin' AND category_url = '/collections/conduit-fittings-boxes'"
  ).run();

  const extraGuillevinCats = [
    { name: 'Boîtiers et armoires',     url: '/collections/electrical-enclosures-cabinets',               enabled: 0 },
    { name: 'Prises électriques',       url: '/collections/electrical-receptacles',                       enabled: 1 },
    { name: 'Interrupteurs',            url: '/collections/switches',                                     enabled: 1 },
    { name: 'Plaques et couvercles',    url: '/collections/plates-covers',                                enabled: 1 },
    { name: 'Conduits et tuyaux',       url: '/collections/conduits-pipes',                               enabled: 1 },
    { name: 'Rubans et adhésifs',       url: '/collections/tapes-adhesives',                              enabled: 0 },
    { name: 'Marrettes et connecteurs', url: '/collections/wire-connectors-twist-on-wire-caps-marrette',  enabled: 1 },
    { name: 'Fusibles',                 url: '/collections/fuses-accessories',                            enabled: 0 },
    { name: 'Mise à la terre',          url: '/collections/grounding-clamps-connectors',                  enabled: 0 },
    { name: 'Cosses et bornes',         url: '/collections/lugs-terminal-connectors',                     enabled: 0 },
    { name: 'Attaches et supports',     url: '/collections/cable-ties-accessories',                       enabled: 0 },
  ];
  const guillevinCompanyIds = db.prepare(
    "SELECT DISTINCT company_id FROM supplier_categories WHERE supplier = 'guillevin'"
  ).all() as { company_id: number }[];
  for (const c of extraGuillevinCats) {
    for (const row of guillevinCompanyIds) {
      const exists = db.prepare(
        "SELECT 1 FROM supplier_categories WHERE supplier = 'guillevin' AND category_url = ? AND company_id = ? LIMIT 1"
      ).get(c.url, row.company_id);
      if (!exists) {
        db.prepare(
          "INSERT INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('guillevin', ?, ?, ?, ?)"
        ).run(c.name, c.url, c.enabled, row.company_id);
      }
    }
  }

  // --- Marketing features ---
  try { db.exec('ALTER TABLE company_settings ADD COLUMN google_review_url TEXT'); } catch {}
  try { db.exec('ALTER TABLE company_settings ADD COLUMN company_logo_url TEXT'); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS request_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      url TEXT NOT NULL,
      type TEXT DEFAULT 'image',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_site_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_site_id INTEGER NOT NULL REFERENCES job_sites(id),
      company_id INTEGER NOT NULL REFERENCES companies(id),
      url TEXT NOT NULL,
      type TEXT DEFAULT 'image',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS review_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_site_id INTEGER NOT NULL REFERENCES job_sites(id),
      company_id INTEGER NOT NULL REFERENCES companies(id),
      client_email TEXT NOT NULL,
      client_name TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  scheduleBackup();
}

export async function backupDb(): Promise<string> {
  const db = getDb();
  const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupDir, `sparky-${timestamp}.db`);
  await db.backup(backupPath);
  console.log(`[Backup] Database backed up to ${backupPath}`);
  // Prune backups older than 7 days
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('sparky-') && f.endsWith('.db'));
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const f of files) {
    const fPath = path.join(backupDir, f);
    if (fs.statSync(fPath).mtimeMs < cutoff) {
      fs.unlinkSync(fPath);
      console.log(`[Backup] Pruned old backup: ${f}`);
    }
  }
  return backupPath;
}

let backupTimer: ReturnType<typeof setInterval> | null = null;
export function scheduleBackup() {
  if (backupTimer) return;
  backupDb().catch(err => console.error('[Backup] Initial backup failed:', err));
  backupTimer = setInterval(() => {
    backupDb().catch(err => console.error('[Backup] Scheduled backup failed:', err));
  }, 24 * 60 * 60 * 1000);
}
