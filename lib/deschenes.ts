import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const DESCHENES_BRANCHES: Branch[] = [
  { name: 'Deschênes Québec',         address: '2300 Boul. Hamel, Québec, QC',               lat: 46.8139, lng: -71.2080 },
  { name: 'Deschênes Montréal',       address: '7575 Boul. Métropolitain E, Montréal, QC',   lat: 45.5942, lng: -73.5550 },
  { name: 'Deschênes Laval',          address: '3300 Boul. de la Concorde E, Laval, QC',     lat: 45.5756, lng: -73.7019 },
  { name: 'Deschênes Sherbrooke',     address: '3600 Boul. Industriel, Sherbrooke, QC',      lat: 45.4042, lng: -71.8929 },
  { name: 'Deschênes Trois-Rivières', address: '4100 Boul. des Forges, Trois-Rivières, QC',  lat: 46.3432, lng: -72.5477 },
  { name: 'Deschênes Gatineau',       address: '180 Boul. Saint-René E, Gatineau, QC',       lat: 45.4765, lng: -75.7013 },
];

async function createDeschenesPage(browser: any) {
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

async function loginToDeschenes(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.deschenes.qc.ca/s/login?language=fr', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input[name="loginEmail"]',
    'input[id="loginEmail"]',
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
    'input[name="loginPassword"]',
    'input[id="loginPassword"]',
    'input[name="password"]',
    'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => !window.location.pathname.toLowerCase().includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.toLowerCase().includes('/login') && url.includes('deschenes.qc.ca');
}

export async function testDeschenesConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createDeschenesPage(browser);
    const loggedIn = await loginToDeschenes(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Deschênes invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getDeschenesPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createDeschenesPage(browser);
    const loggedIn = await loginToDeschenes(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.deschenes.qc.ca/s/search?q=${encodeURIComponent(product)}&language=fr`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"]):not([class*="strike"])').first();
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

export async function placeDeschenesOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createDeschenesPage(browser);
    const loggedIn = await loginToDeschenes(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Deschênes échoué' };

    await page.goto(
      `https://www.deschenes.qc.ca/s/search?q=${encodeURIComponent(product)}&language=fr`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[Deschênes] Searching for: ${product}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a[href*="/s/"] .product-name, .product-tile a, h3 a, .tile-body a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator('input[name="quantity"], input[id*="quantity"]').first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button:has-text("Ajouter au panier"), button:has-text("Add to Cart"), button[class*="add-to-cart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[Deschênes] Added to cart: ${product}`);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Deschênes` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
