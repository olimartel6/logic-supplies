import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'sparky.db');

let db: Database.Database;

export function getDb() {
  if (!db) {
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

    // Catégories Lumen
    const lumenCategories = [
      { name: 'Fils et câbles',           url: '/en/products/28-wire-cords-cables',       enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/en/products/20-power-distribution',       enabled: 1 },
      { name: 'Boîtes et conduits',       url: '/en/products/11-conduit-raceway-strut',    enabled: 1 },
      { name: 'Éclairage',                url: '/en/products/18-lighting',                 enabled: 0 },
      { name: 'Automatisation',           url: '/en/products/12-control-automation',       enabled: 0 },
      { name: 'Outils',                   url: '/en/products/25-tools-instruments',        enabled: 0 },
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

    // Catégories Guillevin
    const guillevinCategories = [
      { name: 'Fils et câbles',           url: '/collections/wire-cable',             enabled: 1 },
      { name: 'Disjoncteurs et panneaux', url: '/collections/breakers-load-centres',  enabled: 1 },
      { name: 'Boîtes et conduits',       url: '/collections/conduit-fittings-boxes', enabled: 0 },
      { name: 'Luminaires',               url: '/collections/lighting',               enabled: 0 },
      { name: 'Outils',                   url: '/collections/tools',                  enabled: 0 },
    ];
    for (const c of guillevinCategories) {
      db.prepare(
        "INSERT OR IGNORE INTO supplier_categories (supplier, category_name, category_url, enabled, company_id) VALUES ('guillevin', ?, ?, ?, ?)"
      ).run(c.name, c.url, c.enabled, companyId);
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
      { supplier: 'lumen', name: 'Boîtes et conduits',       url: '/en/products/11-conduit-raceway-strut' },
      { supplier: 'lumen', name: 'Éclairage',                url: '/en/products/18-lighting' },
      { supplier: 'lumen', name: 'Automatisation',           url: '/en/products/12-control-automation' },
      { supplier: 'lumen', name: 'Outils',                   url: '/en/products/25-tools-instruments' },
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
      { supplier: 'guillevin', name: 'Boîtes et conduits',       url: '/collections/conduit-fittings-boxes' },
      { supplier: 'guillevin', name: 'Luminaires',               url: '/collections/lighting' },
      { supplier: 'guillevin', name: 'Outils',                   url: '/collections/tools' },
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

  // User-level supplier preference (overrides company setting when set)
  const userCols = db.pragma('table_info(users)') as { name: string }[];
  if (!userCols.find(c => c.name === 'supplier_preference')) {
    db.exec(`ALTER TABLE users ADD COLUMN supplier_preference TEXT DEFAULT NULL`);
  }

  // Stripe fields on companies
  const compCols = db.pragma('table_info(companies)') as { name: string }[];
  if (!compCols.find(c => c.name === 'stripe_customer_id'))
    db.exec('ALTER TABLE companies ADD COLUMN stripe_customer_id TEXT');
  if (!compCols.find(c => c.name === 'stripe_subscription_id'))
    db.exec('ALTER TABLE companies ADD COLUMN stripe_subscription_id TEXT');
  if (!compCols.find(c => c.name === 'superadmin_created'))
    db.exec('ALTER TABLE companies ADD COLUMN superadmin_created INTEGER DEFAULT 0');

  // Seed unique superadmin (company_id IS NULL — cross-tenant)
  // Guard: only hash+insert if not already seeded (bcryptjs is slow ~100ms)
  const existingSuperAdmin = db.prepare("SELECT id FROM users WHERE email = 'superadmin@sparky.app'").get();
  if (!existingSuperAdmin) {
    const superHash = bcrypt.hashSync('changeme123', 10);
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
}
