import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const RONA_BRANCHES: Branch[] = [
  { name: 'Rona Montréal (Côte-des-Neiges)', address: '6700 Boul. Décarie, Montréal, QC',          lat: 45.4943, lng: -73.6313 },
  { name: 'Rona Laval',                       address: '3098 Boul. le Carrefour, Laval, QC',         lat: 45.5756, lng: -73.7400 },
  { name: 'Rona Longueuil',                   address: '3050 Boul. de Rome, Brossard, QC',           lat: 45.4604, lng: -73.4800 },
  { name: 'Rona Québec (Ste-Foy)',             address: '3175 Boul. Hochelaga, Québec, QC',           lat: 46.7784, lng: -71.3200 },
  { name: 'Rona Sherbrooke',                  address: '4255 Boul. Portland, Sherbrooke, QC',        lat: 45.3980, lng: -71.8929 },
  { name: 'Rona Gatineau',                    address: '705 Boul. de la Gappe, Gatineau, QC',        lat: 45.4765, lng: -75.7400 },
  { name: 'Rona Trois-Rivières',              address: '4995 Boul. Gene-H.-Kruger, Trois-Rivières, QC', lat: 46.3432, lng: -72.5100 },
  { name: 'Rona Drummondville',               address: '1500 Boul. Lemire, Drummondville, QC',       lat: 45.8747, lng: -72.4900 },
];

async function createRonaPage(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-CA', 'fr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  });
  return context.newPage();
}

async function loginToRona(page: any, username: string, password: string): Promise<boolean> {
  // networkidle waits for the React SPA to finish rendering the login form
  await page.goto('https://www.rona.ca/fr/connexion', {
    waitUntil: 'networkidle', timeout: 45000,
  }).catch(() => page.goto('https://www.rona.ca/fr/connexion', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  }));
  await page.waitForTimeout(4000);

  // Dismiss OneTrust cookie banner — must happen before interacting with form
  const cookieBtn = page.locator([
    '#onetrust-accept-btn-handler',
    'button:has-text("Accepter tout")',
    'button:has-text("Accept All")',
    'button:has-text("Tout accepter")',
    'button:has-text("J\'accepte")',
  ].join(', ')).first();
  if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(1000);
  }

  // Log page state for debugging
  const pageUrl = page.url();
  const pageTitle = await page.title().catch(() => '?');
  const inputCount = await page.locator('input:not([type="hidden"])').count().catch(() => -1);
  console.error(`[Rona] login page: url=${pageUrl} title="${pageTitle}" visible-inputs=${inputCount}`);

  // Try to find ANY visible text/email input on the page
  const emailField = page.locator([
    'input[name="email"]',
    'input[id="email"]',
    'input[autocomplete="email"]',
    'input[type="email"]',
    'input[name="logonId"]',
    'input[id*="logon"]',
    'input[placeholder*="courriel"]',
    'input[placeholder*="email"]',
    'input[type="text"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 20000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input[name="password"]',
    'input[id="password"]',
    'input[type="password"]',
    'input[name="logonPassword"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.includes('/connexion') && !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(2000);

  const url = page.url();
  return !url.includes('/connexion') && !url.includes('/login') && url.includes('rona.ca');
}

export async function testRonaConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createRonaPage(browser);
    const loggedIn = await loginToRona(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Rona invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getRonaPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createRonaPage(browser);
    const loggedIn = await loginToRona(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.rona.ca/fr/search?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(3000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"]):not([class*="was"]):not([class*="strike"])').first();
    if (await priceEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await priceEl.textContent().catch(() => '');
      const match = text?.match(/[\d]+[.,][\d]{2}/);
      if (match) return parseFloat(match[0].replace(',', '.'));
    }
    return null;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

export async function placeRonaOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createRonaPage(browser);
    const loggedIn = await loginToRona(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Rona échoué' };

    await page.goto(
      `https://www.rona.ca/fr/search?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[Rona] Searching for: ${product}`);
    await page.waitForTimeout(3000);

    const firstProduct = page.locator(
      'a[class*="product-name"], a[href*="/fr/p/"], .product-card a, h3 a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[aria-label*="quantit"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button:has-text("Ajouter au panier"), button:has-text("Add to Cart"), button[data-test*="add-to-cart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[Rona] Added to cart: ${product}`);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Rona` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
