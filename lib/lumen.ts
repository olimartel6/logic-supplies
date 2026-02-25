import { chromium } from 'playwright';
import type { Branch } from './canac';

export const LUMEN_BRANCHES: Branch[] = [
  { name: 'Lumen Montréal (Anjou)', address: '7375 Boul. Métropolitain E, Anjou, QC',         lat: 45.6118, lng: -73.5575 },
  { name: 'Lumen Laval',            address: '2205 Boul. de la Concorde O, Laval, QC',        lat: 45.5756, lng: -73.7019 },
  { name: 'Lumen Longueuil',        address: '1100 Boul. Curé-Poirier E, Longueuil, QC',      lat: 45.5292, lng: -73.4708 },
  { name: 'Lumen Québec',           address: '1185 Boul. Charest O, Québec, QC',              lat: 46.8100, lng: -71.2255 },
  { name: 'Lumen Sherbrooke',       address: '175 Boul. Industriel, Sherbrooke, QC',          lat: 45.3799, lng: -71.9000 },
  { name: 'Lumen Trois-Rivières',   address: '3985 Rue des Forges, Trois-Rivières, QC',       lat: 46.3432, lng: -72.5477 },
  { name: 'Lumen Gatineau',         address: '260 Boul. Saint-René E, Gatineau, QC',          lat: 45.4765, lng: -75.7013 },
];

export interface LumenOrderResult {
  success: boolean;
  inCart?: boolean;
  orderId?: string;
  error?: string;
}

export interface ConnectionResult {
  success: boolean;
  error?: string;
}

// Creates a browser context that minimises bot-detection signals
async function createStealthPage(browser: any) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  // Hide the webdriver flag that reCAPTCHA / bot-detection reads
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToLumen(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.lumen.ca/en/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Dismiss cookie consent BEFORE interacting with the form
  const cookieBtn = page.locator(
    '#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept all"), button:has-text("Accepter tout"), button:has-text("Accepter")'
  ).first();
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(800);
  }

  await page.screenshot({ path: process.cwd() + '/public/debug-login-page.png' }).catch(() => {});

  // Scope to the login form (contains a password field)
  const loginForm = page.locator('form:has(input[type="password"])').first();
  await loginForm.waitFor({ timeout: 10000 });

  // Use type() with delays to simulate real keystrokes — required for React forms and reCAPTCHA
  const usernameField = loginForm.locator(
    'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])'
  ).first();
  await usernameField.click();
  await usernameField.type(username, { delay: 60 });

  await page.waitForTimeout(400);

  const passwordField = loginForm.locator('input[type="password"]').first();
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });

  await page.waitForTimeout(400);

  await page.screenshot({ path: process.cwd() + '/public/debug-login-filled.png' }).catch(() => {});

  // Press Enter in password field — more reliable than clicking submit (avoids button-type/scope issues)
  await passwordField.press('Enter');

  // Wait for navigation to settle
  await page.waitForTimeout(6000);

  await page.screenshot({ path: process.cwd() + '/public/debug-after-login.png' }).catch(() => {});

  // Definitive login check: navigate to the account page.
  // If not logged in, Lumen redirects back to /account/login.
  await page.goto('https://www.lumen.ca/en/account', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);
  const verifyUrl = page.url();
  return !verifyUrl.includes('/account/login') && !verifyUrl.includes('/login');
}

export async function testLumenConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    const page = await createStealthPage(browser);

    const response = await page.goto('https://www.lumen.ca/en/account/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    if (!response || response.status() >= 400) {
      return { success: false, error: `Page inaccessible (HTTP ${response?.status()})` };
    }

    await page.waitForTimeout(3000);

    const cookieBtn = page.locator(
      '#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept all"), button:has-text("Accepter tout")'
    ).first();
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(800);
    }

    const loginForm = page.locator('form:has(input[type="password"])').first();
    await loginForm.waitFor({ timeout: 10000 });

    const usernameField = loginForm.locator(
      'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])'
    ).first();
    await usernameField.click();
    await usernameField.type(username, { delay: 60 });
    await page.waitForTimeout(300);

    const passwordField = loginForm.locator('input[type="password"]').first();
    await passwordField.click();
    await passwordField.type(password, { delay: 60 });
    await page.waitForTimeout(300);

    await passwordField.press('Enter');
    await page.waitForTimeout(6000);

    // Verify via account page redirect
    await page.goto('https://www.lumen.ca/en/account', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    const url = page.url();
    if (!url.includes('/account/login') && !url.includes('/login')) {
      return { success: true };
    }

    // Check for error message on login page
    const errorText = await page.locator('.message-error, .error-msg, [class*="error"], .alert').first().textContent().catch(() => '');
    return {
      success: false,
      error: errorText?.trim() || 'Identifiants invalides ou accès refusé',
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function placeLumenOrder(
  username: string,
  password: string,
  product: string,
  quantity: number
): Promise<LumenOrderResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    const page = await createStealthPage(browser);

    // Login
    const loggedIn = await loginToLumen(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Lumen échoué' };

    // Build search query: SKU from DB, or model number word, or first 3 words
    const { getDb } = await import('./db');
    const db = getDb();
    const localProduct = db.prepare('SELECT sku FROM products WHERE name = ? LIMIT 1').get(product) as
      | { sku: string }
      | undefined;

    let searchQuery: string;
    if (localProduct?.sku) {
      searchQuery = localProduct.sku.split('/')[0];
    } else {
      const words = product.split(/\s+/);
      const modelWord = words.find(
        (w) => /\d/.test(w) && w.length >= 3 && /^[A-Za-z0-9\-\/]+$/.test(w)
      );
      if (modelWord) {
        const brand = words[0];
        searchQuery = brand !== modelWord ? `${brand} ${modelWord}` : modelWord;
      } else {
        searchQuery = words.slice(0, 3).join(' ');
      }
    }

    // Navigate to homepage — search results page crashes in headless mode,
    // but the typeahead dropdown works and has its own add-to-cart buttons
    await page.goto('https://www.lumen.ca/en', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Intercept the add-to-cart response to confirm success (HTTP 302 = success)
    let addToCartStatus = 0;
    page.on('response', async (res: any) => {
      if (res.url().includes('additemtocart')) {
        addToCartStatus = res.status();
      }
    });

    // Type into the header search bar to trigger the HTMX typeahead dropdown
    const searchBar = page.locator('input[placeholder*="Search"], input[placeholder*="search"]').first();
    await searchBar.click();
    await searchBar.type(searchQuery, { delay: 150 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: process.cwd() + '/public/debug-order-search.png' }).catch(() => {});

    // Check if the typeahead returned any product add-to-cart forms
    const formCount = await page.locator('form[action*="additemtocart"]').count();
    if (formCount === 0) {
      return { success: false, error: `Produit "${product}" introuvable sur Lumen` };
    }

    // Click the first add-to-cart button in the typeahead dropdown
    await page.locator('.add-cart').first().click({ force: true });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: process.cwd() + '/public/debug-order-cart.png' }).catch(() => {});

    // HTTP 302 redirect to homepage = success; any other status = failure
    if (addToCartStatus !== 0 && addToCartStatus !== 302) {
      return { success: false, error: `Erreur ajout au panier (HTTP ${addToCartStatus})` };
    }

    // Product is now in the Lumen cart — admin must complete checkout manually
    return { success: false, inCart: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getLumenPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    const page = await createStealthPage(browser);
    const loggedIn = await loginToLumen(page, username, password);
    if (!loggedIn) return null;

    await page.goto('https://www.lumen.ca/en', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const searchBar = page.locator('input[placeholder*="Search"], input[placeholder*="search"]').first();
    await searchBar.click();
    await searchBar.type(product, { delay: 100 });
    await page.waitForTimeout(3000);

    const priceEl = page.locator('[class*="price"], [class*="Price"]').first();
    if (await priceEl.isVisible({ timeout: 2000 }).catch(() => false)) {
      const priceText = await priceEl.textContent().catch(() => '');
      const match = priceText?.match(/[\d]+[.,][\d]{2}/);
      if (match) return parseFloat(match[0].replace(',', '.'));
    }
    return null;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

export async function cancelLumenOrder(
  username: string,
  password: string,
  orderId: string
): Promise<boolean> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    const page = await createStealthPage(browser);
    const loggedIn = await loginToLumen(page, username, password);
    if (!loggedIn) return false;

    await page.goto('https://www.lumen.ca/en/account/orders', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const cancelBtn = page
      .locator(`text=${orderId}`)
      .locator('..')
      .locator('button:has-text("Cancel"), button:has-text("Annuler")');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await page.waitForTimeout(2000);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    await browser.close();
  }
}
