import Database from 'better-sqlite3';
import { vi, beforeEach } from 'vitest';

// ── In-memory test database ──

let testDb: Database.Database;

function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  // ── Main tables (mirrors initDb in lib/db.ts) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subscription_status TEXT DEFAULT 'active'
        CHECK(subscription_status IN ('active', 'suspended', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      superadmin_created INTEGER DEFAULT 0,
      features TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('worker', 'office', 'admin', 'superadmin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      supplier_preference TEXT DEFAULT NULL,
      auto_approve INTEGER DEFAULT 0,
      language TEXT DEFAULT 'fr',
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
      worker_id INTEGER REFERENCES users(id),
      urgency INTEGER DEFAULT 0,
      note TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      office_comment TEXT,
      supplier TEXT,
      decision_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      tracking_status TEXT DEFAULT NULL,
      picked_up_by INTEGER REFERENCES users(id),
      picked_up_at DATETIME,
      picked_up_job_site_id INTEGER REFERENCES job_sites(id),
      supplier_modified_by TEXT DEFAULT NULL
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
      ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      office_address TEXT,
      default_delivery TEXT DEFAULT 'office' CHECK(default_delivery IN ('office', 'jobsite')),
      inventory_enabled INTEGER DEFAULT 0,
      marketing_enabled INTEGER DEFAULT 0,
      google_review_url TEXT,
      company_logo_url TEXT,
      branding TEXT DEFAULT '{}'
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

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      barcode TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'unite',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      min_stock REAL DEFAULT NULL,
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

    CREATE TABLE IF NOT EXISTS push_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS request_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      url TEXT NOT NULL,
      type TEXT DEFAULT 'image',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_site_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_site_id INTEGER NOT NULL REFERENCES job_sites(id),
      company_id INTEGER NOT NULL REFERENCES companies(id),
      url TEXT NOT NULL,
      type TEXT DEFAULT 'image',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS review_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_site_id INTEGER NOT NULL REFERENCES job_sites(id),
      company_id INTEGER NOT NULL REFERENCES companies(id),
      client_email TEXT NOT NULL,
      client_name TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      request_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT,
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_job_id INTEGER,
      company_id INTEGER NOT NULL,
      request_id INTEGER,
      supplier TEXT NOT NULL,
      attempt_number INTEGER DEFAULT 1,
      status TEXT CHECK(status IN ('success','failed','timeout')),
      duration_ms INTEGER,
      error_message TEXT,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier TEXT NOT NULL,
      sku TEXT NOT NULL,
      price REAL NOT NULL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_sku ON price_history(supplier, sku, recorded_at);

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
    CREATE INDEX IF NOT EXISTS idx_job_sites_company ON job_sites(company_id);
    CREATE INDEX IF NOT EXISTS idx_requests_company ON requests(company_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_accounts_company ON supplier_accounts(company_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_categories_company ON supplier_categories(company_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_visibility_company ON supplier_visibility(company_id);
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_company ON budget_alerts(company_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_company ON inventory_items(company_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(company_id, barcode);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock_item ON inventory_stock(item_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock_location ON inventory_stock(location_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_logs_company ON inventory_logs(company_id);
    CREATE INDEX IF NOT EXISTS idx_product_favorites_user ON product_favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_company ON messages(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(company_id, recipient_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(company_id, sender_id);
    CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_push_tokens_company ON push_tokens(company_id);
    CREATE INDEX IF NOT EXISTS idx_requests_tracking ON requests(company_id, tracking_status);
  `);

  return db;
}

function seedTestData(db: Database.Database) {
  // Base company
  db.prepare(`
    INSERT INTO companies (id, name, subscription_status) VALUES (1, 'Test Company', 'active')
  `).run();

  // Base admin user (password = 'password')
  db.prepare(`
    INSERT INTO users (id, company_id, name, email, password, role, language)
    VALUES (1, 1, 'Test User', 'test@test.com', '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123', 'admin', 'fr')
  `).run();

  // Company settings
  db.prepare(`
    INSERT INTO company_settings (company_id, supplier_preference, large_order_threshold, office_address, default_delivery)
    VALUES (1, 'cheapest', 2000, '123 Test St', 'office')
  `).run();
}

// ── Mock lib/db ──
vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
  seedCompanyDefaults: vi.fn(),
  seedSuperadminCategories: vi.fn(),
  scheduleBackup: vi.fn(),
  backupDb: vi.fn(),
}));

// ── Mock lib/session ──
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: 1,
    companyId: 1,
    name: 'Test User',
    email: 'test@test.com',
    role: 'admin',
    save: vi.fn(),
    destroy: vi.fn(),
  }),
}));

// ── Reset DB before each test ──
beforeEach(() => {
  if (testDb) {
    testDb.close();
  }
  testDb = createTestDb();
  seedTestData(testDb);
});

export { testDb };
