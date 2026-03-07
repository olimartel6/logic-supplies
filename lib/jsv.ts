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

/** Parse "123 Rue X, Montréal, QC H2X 1Y4" into structured address */
function parseAddress(raw: string): {
  street: string; city: string; province: string; postalCode: string;
} {
  // Try pattern: street, city, PROV POSTAL
  const m = raw.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i);
  if (m) return { street: m[1].trim(), city: m[2].trim(), province: m[3].trim(), postalCode: m[4].trim() };
  // Fallback: split by commas
  const parts = raw.split(',').map(s => s.trim());
  const last = parts[parts.length - 1] || '';
  const postalMatch = last.match(/([A-Z]\d[A-Z]\s?\d[A-Z]\d)/i);
  return {
    street: parts[0] || raw,
    city: parts.length > 1 ? parts[1] : '',
    province: 'QC',
    postalCode: postalMatch ? postalMatch[1] : '',
  };
}

export async function testJsvConnection(username: string, password: string): Promise<ConnectionResult> {
  // JSV uses Shopify Customer Accounts with email OTP — no password login.
  // We verify the site is reachable and an email was provided.
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
    return typeof price === 'number' ? price : parseFloat(String(price).replace(',', '.'));
  } catch {
    return null;
  }
}

export async function placeJsvOrder(
  username: string,
  _password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const log: string[] = [];
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createJsvPage(browser);

    // Step 1: Search for product
    log.push(`Searching for: ${product}`);
    console.error(`[JSV] Searching for: ${product}`);
    await page.goto(
      `https://groupejsv.com/search?type=product&q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(3000);

    // Step 2: Click first product
    const firstProduct = page.locator(
      'a[href*="/products/"], .product-card a, .card__heading a, h3 a'
    ).first();
    if (!(await firstProduct.isVisible({ timeout: 5000 }).catch(() => false))) {
      log.push('No product found in search results');
      return { success: false, error: `Produit "${product}" introuvable sur JSV`, log };
    }

    log.push('Product found, navigating to product page');
    await firstProduct.click();
    await page.waitForTimeout(3000);
    log.push(`Product URL: ${page.url()}`);
    console.error(`[JSV] Product URL: ${page.url()}`);

    // Step 3: Set quantity
    const qtyInput = page.locator(
      'input[name="quantity"], input[id*="quantity"], input[class*="quantity"]'
    ).first();
    if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await qtyInput.click({ clickCount: 3 });
      await qtyInput.type(quantity.toString(), { delay: 50 });
      await page.waitForTimeout(300);
      log.push(`Quantity set to ${quantity}`);
    }

    // Step 4: Add to cart
    const addToCartBtn = page.locator(
      'button[name="add"], button:has-text("Add to cart"), button:has-text("Ajouter au panier"), [type="submit"][name="add"]'
    ).first();
    if (!(await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      log.push('Add to cart button not found');
      return { success: false, error: 'Bouton "Ajouter au panier" introuvable', log };
    }

    await addToCartBtn.click();
    await page.waitForTimeout(3000);
    log.push(`Added to cart: ${product}`);
    console.error(`[JSV] Added to cart: ${product}`);

    // If no payment info, stop at cart
    if (!deliveryAddress || !payment) {
      return { success: false, inCart: true, log };
    }

    // ── Checkout flow (single-page Shopify checkout) ──
    try {
      // Step 5: Navigate to checkout
      log.push('Step 5: Navigating to checkout');
      console.error('[JSV] Step 5: Navigating to checkout');
      await page.goto('https://groupejsv.com/checkout', {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await page.waitForTimeout(5000);
      log.push(`Checkout URL: ${page.url()}`);
      console.error(`[JSV] Checkout URL: ${page.url()}`);

      // Step 6: Fill contact email
      log.push('Step 6: Filling contact email');
      console.error('[JSV] Step 6: Filling contact email');
      const emailField = page.locator('input[name="email"]').first();
      await emailField.waitFor({ state: 'visible', timeout: 10000 });
      await emailField.fill(username);
      log.push(`Email filled: ${username}`);

      // Step 7: Fill shipping address
      log.push('Step 7: Filling shipping address');
      console.error('[JSV] Step 7: Filling shipping address');
      const addr = parseAddress(deliveryAddress);
      const nameParts = payment.cardHolder.split(/\s+/);
      const firstName = nameParts[0] || 'Client';
      const lastName = nameParts.slice(1).join(' ') || 'LogicSupplies';

      await page.locator('input[name="firstName"]').first().fill(firstName);
      await page.locator('input[name="lastName"]').first().fill(lastName);
      await page.locator('input[name="address1"]').first().fill(addr.street);
      await page.locator('input[name="city"]').first().fill(addr.city || 'Montréal');
      await page.locator('input[name="postalCode"]').first().fill(addr.postalCode || 'H2X 1Y4');
      log.push(`Address filled: ${addr.street}, ${addr.city}`);

      // Select province — Shopify uses a select or combobox
      const provinceSelect = page.locator('select[name="zone"], select[name="province"]').first();
      if (await provinceSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await provinceSelect.selectOption({ label: 'Québec' }).catch(() =>
          provinceSelect.selectOption('QC').catch(() => {})
        );
        log.push('Province selected: Québec');
      }

      // Phone (optional)
      const phoneField = page.locator('input[name="phone"]').first();
      if (await phoneField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await phoneField.fill('5141234567');
      }

      await page.waitForTimeout(2000);
      await page.screenshot({ path: process.cwd() + '/public/debug-jsv-address.png' }).catch(() => {});

      // Step 8: Fill card details (Shopify PCI iframes)
      log.push('Step 8: Filling card details (Shopify PCI iframes)');
      console.error('[JSV] Step 8: Filling card details');

      // Card number iframe
      const cardFrame = page.frameLocator('iframe[id*="card-fields-number"]').first();
      const cardInput = cardFrame.locator('input').first();
      await cardInput.waitFor({ state: 'visible', timeout: 10000 });
      await cardInput.fill(payment.cardNumber);
      log.push('Card number filled');
      console.error('[JSV] Card number filled');

      await page.waitForTimeout(500);

      // Expiry iframe
      const expiryFrame = page.frameLocator('iframe[id*="card-fields-expiry"]').first();
      await expiryFrame.locator('input').first().fill(payment.cardExpiry);
      log.push('Expiry filled');
      console.error('[JSV] Expiry filled');

      await page.waitForTimeout(500);

      // CVV iframe
      const cvvFrame = page.frameLocator('iframe[id*="card-fields-verification"]').first();
      await cvvFrame.locator('input').first().fill(payment.cardCvv);
      log.push('CVV filled');
      console.error('[JSV] CVV filled');

      await page.waitForTimeout(500);

      // Card holder name iframe
      const nameFrame = page.frameLocator('iframe[id*="card-fields-name"]').first();
      const nameInput = nameFrame.locator('input').first();
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.fill(payment.cardHolder);
        log.push('Card holder filled');
        console.error('[JSV] Card holder filled');
      }

      await page.waitForTimeout(1000);
      await page.screenshot({ path: process.cwd() + '/public/debug-jsv-card-filled.png' }).catch(() => {});

      // Step 9: Click "Payer maintenant"
      log.push('Step 9: Placing order');
      console.error('[JSV] Step 9: Placing order');
      const payBtn = page.locator(
        'button:has-text("Payer maintenant"), button:has-text("Pay now"), button[type="submit"]:has-text("Payer")'
      ).first();
      await payBtn.waitFor({ state: 'visible', timeout: 5000 });
      await payBtn.click();
      log.push('Pay button clicked, waiting for confirmation');
      console.error('[JSV] Pay button clicked');

      // Wait for order confirmation
      await page.waitForTimeout(10000);
      await page.screenshot({ path: process.cwd() + '/public/debug-jsv-confirmation.png' }).catch(() => {});
      log.push(`Final URL: ${page.url()}`);
      console.error(`[JSV] Final URL: ${page.url()}`);

      // Step 10: Capture order number
      const bodyText = await page.textContent('body').catch(() => '') || '';
      const orderMatch = bodyText.match(/order\s*#?\s*([A-Z0-9-]{3,20})/i)
        || bodyText.match(/commande\s*#?\s*([A-Z0-9-]{3,20})/i)
        || bodyText.match(/#(\d{4,})/);
      const orderId = orderMatch?.[1];

      if (orderId) {
        log.push(`Order confirmed: ${orderId}`);
        console.error(`[JSV] Order ID: ${orderId}`);
        return { success: true, orderId, log };
      }

      // Check if we're on a confirmation page
      const url = page.url();
      if (url.includes('thank_you') || url.includes('confirmation') || url.includes('orders/')) {
        log.push('Order appears successful (confirmation page detected)');
        return { success: true, log };
      }

      // Check for errors
      const errorBanner = page.locator('[role="alert"], [class*="error"], [class*="notice--error"]').first();
      if (await errorBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
        const errorText = await errorBanner.textContent().catch(() => '') || '';
        log.push(`Checkout error: ${errorText.trim()}`);
        return { success: false, inCart: true, error: `Erreur checkout: ${errorText.trim().slice(0, 200)}`, log };
      }

      const bodySnippet = bodyText.slice(0, 300).replace(/\s+/g, ' ');
      log.push(`Order ID not found. Page snippet: ${bodySnippet}`);
      return { success: false, inCart: true, error: 'Confirmation de commande non détectée', log };

    } catch (err: any) {
      const errorMsg = err.message || String(err);
      console.error('[JSV] Checkout error:', errorMsg);
      log.push(`Checkout error: ${errorMsg}`);
      await page.screenshot({ path: process.cwd() + '/public/debug-jsv-error.png' }).catch(() => {});
      return { success: false, inCart: true, error: `Checkout échoué: ${errorMsg}`, log };
    }

  } catch (err: any) {
    const errorMsg = err.message || String(err);
    log.push(`Fatal error: ${errorMsg}`);
    return { success: false, error: errorMsg, log };
  } finally {
    await browser.close();
  }
}
