import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const NEDCO_BRANCHES: Branch[] = [
  { name: 'Nedco Montréal (St-Laurent)', address: '1000 Rue Décarie, Saint-Laurent, QC',     lat: 45.5017, lng: -73.6800 },
  { name: 'Nedco Laval',                 address: '2500 Boul. Industriel, Laval, QC',         lat: 45.5756, lng: -73.7019 },
  { name: 'Nedco Longueuil',             address: '900 Rue Jolibois, Longueuil, QC',          lat: 45.5313, lng: -73.5180 },
  { name: 'Nedco Québec',                address: '3000 Boul. Laurier, Québec, QC',            lat: 46.7784, lng: -71.3052 },
  { name: 'Nedco Sherbrooke',            address: '3500 Boul. Industriel, Sherbrooke, QC',    lat: 45.4042, lng: -71.8929 },
  { name: 'Nedco Gatineau',              address: '200 Boul. Saint-René E, Gatineau, QC',     lat: 45.4765, lng: -75.7013 },
  { name: 'Nedco Trois-Rivières',        address: '4050 Rue des Forges, Trois-Rivières, QC',  lat: 46.3432, lng: -72.5477 },
];

// Nedco is SAP Hybris (Rexel group) — /cnd/ prefix
// Identical to Westburne (same codebase), just different URL prefix
// Login: Spring Security j_spring_security_check
// Search: /cnd/search/results JSON API
// Cart: POST to /cnd/cart/add

const BASE = 'https://www.nedco.ca';
const PREFIX = '/cnd';

async function createNedcoPage(browser: any) {
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

async function loginToNedco(page: any, username: string, password: string): Promise<boolean> {
  await page.goto(`${BASE}${PREFIX}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Main login form: #j_username_SAC / #j_password_SAC
  const emailField = page.locator('input#j_username_SAC, input#j_username').first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator('input#j_password_SAC, input#j_password').first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  const submitBtn = page.locator('#nfrDesktopAccountLoginGA, #loginForm button[type="submit"], button[type="submit"]').first();
  await submitBtn.click();
  console.error('[Nedco] Login submitted, waiting for redirect...');

  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(2000);

  const url = page.url();
  const loggedIn = !url.includes('/login') && url.includes('nedco.ca');
  console.error(`[Nedco] Login ${loggedIn ? 'succeeded' : 'failed'}, URL: ${url}`);
  return loggedIn;
}

export async function testNedcoConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createNedcoPage(browser);
    const loggedIn = await loginToNedco(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Nedco invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getNedcoPrice(username: string, password: string, product: string): Promise<number | null> {
  // Try the public search API first (returns list prices without auth)
  try {
    const query = encodeURIComponent(product);
    const res = await fetch(`${BASE}${PREFIX}/search/results?q=${query}&page=0&pageSize=3`, {
      headers: { 'Accept': 'application/json' },
    });
    const json = await res.json();
    const html = json.productListerHtml || '';
    const priceMatch = html.match(/productPrice="([\d.]+)"/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (price > 0) return price;
    }
  } catch {}

  // Fallback: browser-based price check with auth
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createNedcoPage(browser);
    const loggedIn = await loginToNedco(page, username, password);
    if (!loggedIn) return null;

    await page.goto(`${BASE}${PREFIX}/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(3000);

    const price = await page.evaluate(() => {
      const card = document.querySelector('.productListerDetails[productprice]') as HTMLElement;
      if (card) {
        const p = parseFloat(card.getAttribute('productprice') || '0');
        if (p > 0) return p;
      }
      const priceEl = document.querySelector('.product-price, [class*="price"]:not([class*="old"])');
      const text = priceEl?.textContent || '';
      const match = text.match(/\$?([\d,]+[.][\d]{2})/);
      return match ? parseFloat(match[1].replace(',', '')) : null;
    });
    return price;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

function buildSearchQuery(product: string): string {
  try {
    const { getDb } = require('./db');
    const row = (
      getDb().prepare("SELECT sku FROM products WHERE name = ? AND supplier = 'nedco' LIMIT 1").get(product) ||
      getDb().prepare("SELECT sku FROM products WHERE name = ? LIMIT 1").get(product)
    ) as { sku: string } | undefined;
    if (row?.sku) return row.sku.split('/')[0];
  } catch {}
  return product;
}

export async function placeNedcoOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const log: string[] = [];
  const browser = await createBrowserbaseBrowser();
  try {
    log.push('[Nedco] Logging in');
    const page = await createNedcoPage(browser);
    const loggedIn = await loginToNedco(page, username, password);
    if (!loggedIn) {
      log.push('[Nedco] Login failed');
      return { success: false, error: 'Login Nedco échoué', log };
    }
    log.push('[Nedco] Login successful');

    const searchQuery = buildSearchQuery(product);
    log.push(`[Nedco] Searching for: ${searchQuery}`);
    console.error(`[Nedco] Searching for: ${searchQuery}`);

    await page.goto(`${BASE}${PREFIX}/search?q=${encodeURIComponent(searchQuery)}&text=${encodeURIComponent(searchQuery)}`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // SAP Hybris product cards
    const productCard = page.locator('.productListerDetails').first();
    if (!await productCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      log.push(`[Nedco] Product "${product}" not found`);
      return { success: false, error: `Produit "${product}" introuvable sur Nedco`, log };
    }

    const productName = await productCard.getAttribute('productname').catch(() => product);
    log.push(`[Nedco] Found: ${productName}`);
    console.error(`[Nedco] Found: ${productName}`);

    // Set quantity
    const qtyInput = productCard.locator('input[name="qty"], input[id*="qty"], input.qty, input[name="quantity"]').first();
    if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await qtyInput.click({ clickCount: 3 });
      await qtyInput.type(quantity.toString(), { delay: 50 });
    }

    // Add to cart
    const addBtn = productCard.locator('button[type="submit"], button:has-text("Add to cart"), button:has-text("Ajouter au panier"), .add-to-cart-btn').first();
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const productUrl = await productCard.getAttribute('producturl').catch(() => '');
      if (productUrl) {
        log.push('[Nedco] Navigating to product page');
        await page.goto(`${BASE}${productUrl}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        const pdpQty = page.locator('input[name="qty"], input.qty, input#pdpQty').first();
        if (await pdpQty.isVisible({ timeout: 2000 }).catch(() => false)) {
          await pdpQty.click({ clickCount: 3 });
          await pdpQty.type(quantity.toString(), { delay: 50 });
        }
        const pdpAddBtn = page.locator('#addToCartButton, button:has-text("Add to cart"), button:has-text("Ajouter"), form.add_to_cart_form button[type="submit"]').first();
        if (await pdpAddBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await pdpAddBtn.click();
          await page.waitForTimeout(2000);
          log.push('[Nedco] Added from product page');
        } else {
          return { success: false, error: 'Bouton Ajouter introuvable', log };
        }
      } else {
        return { success: false, error: 'Bouton Ajouter introuvable', log };
      }
    } else {
      await addBtn.click();
      await page.waitForTimeout(2000);
      log.push('[Nedco] Added to cart');
    }
    console.error(`[Nedco] Added to cart: ${product}`);

    // ── Checkout ──
    if (deliveryAddress && payment) {
      try {
        log.push('[Nedco] Step 1: cart');
        console.error('[Nedco] Step 1: cart');
        await page.goto(`${BASE}${PREFIX}/cart`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: process.cwd() + '/public/debug-nedco-cart.png' }).catch(() => {});

        log.push('[Nedco] Step 2: checkout');
        console.error('[Nedco] Step 2: checkout');
        const checkoutBtn = page.locator('a[href*="checkout"], button:has-text("Checkout"), button:has-text("Proceed"), #checkoutButtonTop, #checkoutButtonBottom').first();
        await checkoutBtn.click({ timeout: 10000 });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: process.cwd() + '/public/debug-nedco-checkout.png' }).catch(() => {});

        log.push('[Nedco] Step 3: PO & delivery');
        console.error('[Nedco] Step 3: PO & delivery');
        const poField = page.locator('input[name*="purchaseOrderNumber"], input[id*="purchaseOrder"], input[name*="poNumber"]').first();
        if (await poField.isVisible({ timeout: 3000 }).catch(() => false)) {
          const poNum = 'LS-' + Date.now().toString().slice(-6);
          await poField.fill(poNum);
          log.push(`[Nedco] PO: ${poNum}`);
        }
        const addressField = page.locator('input[name*="line1"], input[name*="address"], input[id*="address1"]').first();
        if (await addressField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addressField.fill(deliveryAddress);
        } else {
          const savedAddr = page.locator('select[id*="address"], select[name*="address"]').first();
          if (await savedAddr.isVisible({ timeout: 3000 }).catch(() => false)) {
            await savedAddr.selectOption({ index: 1 });
            log.push('[Nedco] Selected saved address');
          }
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-nedco-address.png' }).catch(() => {});

        log.push('[Nedco] Step 4: continue');
        console.error('[Nedco] Step 4: continue');
        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), #addressSubmit, button[type="submit"]').first();
        if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await continueBtn.click();
          await page.waitForTimeout(4000);
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-nedco-payment.png' }).catch(() => {});

        log.push('[Nedco] Step 5: card');
        console.error('[Nedco] Step 5: card');
        await page.waitForTimeout(2000);
        const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[title*="card"], iframe[id*="card"]').first();
        const iframeCard = cardFrame.locator('input').first();
        if (await iframeCard.isVisible({ timeout: 3000 }).catch(() => false)) {
          await iframeCard.fill(payment.cardNumber);
          const iframeName = cardFrame.locator('input[name*="name"], input[autocomplete="cc-name"]').first();
          if (await iframeName.isVisible({ timeout: 2000 }).catch(() => false)) await iframeName.fill(payment.cardHolder);
          const iframeExpiry = cardFrame.locator('input[name*="exp"], input[placeholder*="MM"]').first();
          if (await iframeExpiry.isVisible({ timeout: 2000 }).catch(() => false)) await iframeExpiry.fill(payment.cardExpiry);
          const iframeCvv = cardFrame.locator('input[name*="cvv"], input[name*="cvc"]').first();
          if (await iframeCvv.isVisible({ timeout: 2000 }).catch(() => false)) await iframeCvv.fill(payment.cardCvv);
          log.push('[Nedco] Card filled (iframe)');
        } else {
          const cardNum = page.locator('input[id*="card_cardNumber"], input[name*="card_cardNumber"], input[autocomplete="cc-number"]').first();
          if (await cardNum.isVisible({ timeout: 5000 }).catch(() => false)) await cardNum.fill(payment.cardNumber);
          const nameField = page.locator('input[id*="card_nameOnCard"], input[name*="nameOnCard"], input[autocomplete="cc-name"]').first();
          if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) await nameField.fill(payment.cardHolder);
          const expiryMonth = page.locator('select[id*="ExpiryMonth"], select[name*="card_expirationMonth"]').first();
          if (await expiryMonth.isVisible({ timeout: 3000 }).catch(() => false)) {
            const [month] = payment.cardExpiry.split('/');
            await expiryMonth.selectOption(month.trim());
          }
          const expiryYear = page.locator('select[id*="ExpiryYear"], select[name*="card_expirationYear"]').first();
          if (await expiryYear.isVisible({ timeout: 3000 }).catch(() => false)) {
            const [, year] = payment.cardExpiry.split('/');
            await expiryYear.selectOption(`20${year.trim()}`);
          }
          const cvv = page.locator('input[id*="card_cvNumber"], input[name*="card_cvNumber"], input[autocomplete="cc-csc"]').first();
          if (await cvv.isVisible({ timeout: 3000 }).catch(() => false)) await cvv.fill(payment.cardCvv);
          log.push('[Nedco] Card filled (direct)');
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-nedco-card.png' }).catch(() => {});

        log.push('[Nedco] Step 6: place order');
        console.error('[Nedco] Step 6: place order');
        const placeBtn = page.locator('button:has-text("Place Order"), button:has-text("Passer la commande"), button:has-text("Submit Order"), #placeOrderForm button[type="submit"]').first();
        if (await placeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await placeBtn.click();
          await page.waitForTimeout(10000);
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-nedco-confirmation.png' }).catch(() => {});

        const bodyText = await page.textContent('body');
        const orderMatch = bodyText?.match(/order\s*#?\s*:?\s*([A-Z0-9-]{5,20})/i)
          || bodyText?.match(/commande\s*#?\s*:?\s*([A-Z0-9-]{5,20})/i)
          || bodyText?.match(/confirmation\s*:?\s*([A-Z0-9-]{5,20})/i);
        const orderId = orderMatch?.[1];
        console.error('[Nedco] Order ID:', orderId || 'not found');
        if (orderId) {
          log.push(`[Nedco] Order ID: ${orderId}`);
          return { success: true, orderId, log };
        }
        return { success: false, inCart: true, error: 'Commande soumise mais pas de numéro de confirmation', log };
      } catch (err: any) {
        log.push(`[Nedco] Checkout error: ${err.message}`);
        console.error('[Nedco] Checkout error:', err.message);
        await page.screenshot({ path: process.cwd() + '/public/debug-nedco-error.png' }).catch(() => {});
        return { success: false, inCart: true, error: `Checkout: ${err.message}`, log };
      }
    }

    return { success: false, inCart: true, log };
  } catch (err: any) {
    log.push(`[Nedco] Fatal error: ${err.message}`);
    return { success: false, error: err.message, log };
  } finally {
    await browser.close();
  }
}
