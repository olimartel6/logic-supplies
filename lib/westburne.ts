import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const WESTBURNE_BRANCHES: Branch[] = [
  { name: 'Westburne Montréal (St-Laurent)',  address: '990 Rue Décarie, Saint-Laurent, QC',          lat: 45.5017, lng: -73.6800 },
  { name: 'Westburne Laval',                  address: '2440 Boul. Industriel, Laval, QC',             lat: 45.5756, lng: -73.7019 },
  { name: 'Westburne Longueuil',              address: '850 Rue Jolibois, Longueuil, QC',              lat: 45.5313, lng: -73.5180 },
  { name: 'Westburne Québec',                 address: '2970 Boul. Laurier, Québec, QC',               lat: 46.7784, lng: -71.3052 },
  { name: 'Westburne Sherbrooke',             address: '3440 Boul. Industriel, Sherbrooke, QC',        lat: 45.4042, lng: -71.8929 },
  { name: 'Westburne Gatineau',               address: '205 Boul. Saint-René E, Gatineau, QC',         lat: 45.4765, lng: -75.7013 },
  { name: 'Westburne Trois-Rivières',         address: '4025 Rue des Forges, Trois-Rivières, QC',      lat: 46.3432, lng: -72.5477 },
];

async function createWestburnePage(browser: any) {
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

async function loginToWestburne(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.westburne.ca/cwr/login', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input#j_username',
    'input[name="j_username"]',
    'input[name="username"]',
    'input[type="email"]',
    'input[id*="email"]',
    'input[id*="user"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input#j_password',
    'input[name="j_password"]',
    'input[name="password"]',
    'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.includes('/login') && url.includes('westburne.ca');
}

export async function testWestburneConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createWestburnePage(browser);
    const loggedIn = await loginToWestburne(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Westburne invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getWestburnePrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createWestburnePage(browser);
    const loggedIn = await loginToWestburne(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.westburne.ca/cwr/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"]):not([class*="was"])').first();
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

export async function placeWestburneOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createWestburnePage(browser);
    const loggedIn = await loginToWestburne(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Westburne échoué' };

    await page.goto(
      `https://www.westburne.ca/cwr/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[Westburne] Searching for: ${product}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a.product-item__name, .product-name a, h3 a[href*="/p/"], .product-list__item a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="qty"], input[id*="qty"], input[class*="qty"], input[name="quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button:has-text("Add to Cart"), button:has-text("Ajouter au panier"), button[class*="add-to-cart"], .js-add-to-cart'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[Westburne] Added to cart: ${product}`);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Westburne` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
