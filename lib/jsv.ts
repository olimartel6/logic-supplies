import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const JSV_BRANCHES: Branch[] = [
  { name: 'JSV Montréal',     address: '8785 Boul. Taschereau, Brossard, QC',        lat: 45.4604, lng: -73.4616 },
  { name: 'JSV Laval',        address: '3000 Boul. Le Carrefour, Laval, QC',          lat: 45.5756, lng: -73.7019 },
  { name: 'JSV Québec',       address: '2525 Boul. Laurier, Québec, QC',              lat: 46.7784, lng: -71.3052 },
  { name: 'JSV Sherbrooke',   address: '4785 Boul. Bourque, Sherbrooke, QC',          lat: 45.4042, lng: -71.8929 },
];

async function createJsvPage(browser: any) {
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

async function loginToJsv(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://groupejsv.com/account/login', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input#customer_email',
    'input[name="customer[email]"]',
    'input[type="email"]',
    'input#username',
    'input[name="username"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input#customer_password',
    'input[name="customer[password]"]',
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
  return !url.includes('/login') && !url.includes('/account/login');
}

export async function testJsvConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createJsvPage(browser);
    const loggedIn = await loginToJsv(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants JSV invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getJsvPrice(username: string, password: string, product: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://groupejsv.com/search/suggest.json?q=${encodeURIComponent(product)}&resources[type]=product&resources[limit]=5`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.resources?.results?.products ?? [];
    if (items.length === 0) return null;
    const price = items[0]?.price;
    if (!price) return null;
    // Shopify suggest.json returns prices as decimal strings (e.g., "24.99")
    return typeof price === 'number' ? price : parseFloat(String(price).replace(',', '.'));
  } catch {
    return null;
  }
}

export async function placeJsvOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createJsvPage(browser);
    const loggedIn = await loginToJsv(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login JSV échoué' };

    await page.goto(
      `https://groupejsv.com/search?type=product&q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[JSV] Searching for: ${product}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a[href*="/products/"], .product-card a, .card__heading a, h3 a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[class*="quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button[name="add"], button:has-text("Add to cart"), button:has-text("Ajouter au panier"), [data-add-to-cart]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[JSV] Added to cart: ${product}`);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur JSV` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
