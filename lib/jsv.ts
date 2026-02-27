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

export async function testJsvConnection(username: string, password: string): Promise<ConnectionResult> {
  // JSV uses Shopify Customer Accounts with email OTP — no password.
  // We can only verify the site is reachable and an email was provided.
  if (!username) return { success: false, error: 'Adresse email requise' };
  try {
    const res = await fetch('https://groupejsv.com', { method: 'HEAD' });
    if (res.ok || res.status < 500) return { success: true };
    return { success: false, error: `JSV inaccessible (${res.status})` };
  } catch (err: any) {
    return { success: false, error: err.message };
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
  // JSV uses email OTP — no automated login possible. Add to cart as guest.
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createJsvPage(browser);

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
