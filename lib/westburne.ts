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

// Westburne is SAP Hybris (Rexel group) — /cwr/ prefix
// Login: Spring Security j_spring_security_check
// Search: /cwr/search/results JSON API
// Cart: POST to /cwr/cart/add

const BASE = 'https://www.westburne.ca';
const PREFIX = '/cwr';

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
  await page.goto(`${BASE}${PREFIX}/login`, {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  // Main login form uses #j_username_SAC and #j_password_SAC
  // Header form uses #j_username and #j_password — try main form first
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

  // Submit — use the main form's submit button
  const submitBtn = page.locator('#nfrDesktopAccountLoginGA, #loginForm button[type="submit"], button[type="submit"]').first();
  await submitBtn.click();
  console.error('[Westburne] Login submitted, waiting for redirect...');

  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(2000);

  const url = page.url();
  const loggedIn = !url.includes('/login') && url.includes('westburne.ca');
  console.error(`[Westburne] Login ${loggedIn ? 'succeeded' : 'failed'}, URL: ${url}`);
  return loggedIn;
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
  // Try the public search API first (returns list prices without auth)
  try {
    const query = encodeURIComponent(product);
    const res = await fetch(`${BASE}${PREFIX}/search/results?q=${query}&page=0&pageSize=3`, {
      headers: { 'Accept': 'application/json' },
    });
    const json = await res.json();
    const html = json.productListerHtml || '';
    // Parse price from productPrice attribute in the HTML
    const priceMatch = html.match(/productPrice="([\d.]+)"/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (price > 0) return price;
    }
  } catch {}

  // Fallback: browser-based price check with auth
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createWestburnePage(browser);
    const loggedIn = await loginToWestburne(page, username, password);
    if (!loggedIn) return null;

    await page.goto(`${BASE}${PREFIX}/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // SAP Hybris product cards: div.productListerDetails with productPrice attribute
    const price = await page.evaluate(() => {
      const card = document.querySelector('.productListerDetails[productprice]') as HTMLElement;
      if (card) {
        const p = parseFloat(card.getAttribute('productprice') || '0');
        if (p > 0) return p;
      }
      // Fallback: look for price text
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

/** Build search query: try SKU from catalog first */
function buildSearchQuery(product: string): string {
  try {
    const { getDb } = require('./db');
    const row = (
      getDb().prepare("SELECT sku FROM products WHERE name = ? AND supplier = 'westburne' LIMIT 1").get(product) ||
      getDb().prepare("SELECT sku FROM products WHERE name = ? LIMIT 1").get(product)
    ) as { sku: string } | undefined;
    if (row?.sku) return row.sku.split('/')[0];
  } catch {}
  return product;
}

export async function placeWestburneOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const log: string[] = [];
  const browser = await createBrowserbaseBrowser();
  try {
    log.push('Logging in to Westburne');
    const page = await createWestburnePage(browser);
    const loggedIn = await loginToWestburne(page, username, password);
    if (!loggedIn) {
      log.push('Login failed');
      return { success: false, error: 'Login Westburne échoué', log };
    }
    log.push('Login successful');

    const searchQuery = buildSearchQuery(product);
    log.push(`Searching for: ${searchQuery}`);
    console.error(`[Westburne] Searching for: ${searchQuery}`);

    await page.goto(`${BASE}${PREFIX}/search?q=${encodeURIComponent(searchQuery)}&text=${encodeURIComponent(searchQuery)}`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // SAP Hybris: product cards are div.productListerDetails with product data in attributes
    // The "Add to cart" button is inside a form.add_to_cart_form
    const productCard = page.locator('.productListerDetails').first();
    if (!await productCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      log.push(`Product "${product}" not found in search results`);
      return { success: false, error: `Produit "${product}" introuvable sur Westburne`, log };
    }

    const productName = await productCard.getAttribute('productname').catch(() => product);
    log.push(`Found product: ${productName}`);
    console.error(`[Westburne] Found: ${productName}`);

    // Set quantity if input exists
    const qtyInput = productCard.locator('input[name="qty"], input[id*="qty"], input.qty, input[name="quantity"]').first();
    if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await qtyInput.click({ clickCount: 3 });
      await qtyInput.type(quantity.toString(), { delay: 50 });
      log.push(`Quantity set to ${quantity}`);
    }

    // Click "Add to cart" button inside the product card's form
    const addBtn = productCard.locator('button[type="submit"], button:has-text("Add to cart"), button:has-text("Ajouter au panier"), .add-to-cart-btn').first();
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Fallback: click the product to go to detail page, then add from there
      const productUrl = await productCard.getAttribute('producturl').catch(() => '');
      if (productUrl) {
        log.push('No add-to-cart on list — navigating to product page');
        await page.goto(`${BASE}${productUrl}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const pdpQty = page.locator('input[name="qty"], input.qty, input#pdpQty').first();
        if (await pdpQty.isVisible({ timeout: 2000 }).catch(() => false)) {
          await pdpQty.click({ clickCount: 3 });
          await pdpQty.type(quantity.toString(), { delay: 50 });
        }
        const pdpAddBtn = page.locator('#addToCartButton, button:has-text("Add to cart"), button:has-text("Ajouter"), .add-to-cart-btn, form.add_to_cart_form button[type="submit"]').first();
        if (await pdpAddBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await pdpAddBtn.click();
          await page.waitForTimeout(2000);
          log.push('Added to cart from product page');
        } else {
          log.push('Add to cart button not found on product page');
          return { success: false, error: 'Bouton Ajouter au panier introuvable', log };
        }
      } else {
        log.push('Add to cart button not found');
        return { success: false, error: 'Bouton Ajouter au panier introuvable', log };
      }
    } else {
      await addBtn.click();
      await page.waitForTimeout(2000);
      log.push('Added to cart');
    }
    console.error(`[Westburne] Added to cart: ${product}`);

    // ── Checkout si adresse et paiement fournis ──
    if (deliveryAddress && payment) {
      try {
        // Step 1: Navigate to cart
        log.push('Step 1: Navigating to cart');
        console.error('[Westburne] Step 1: cart');
        await page.goto(`${BASE}${PREFIX}/cart`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: process.cwd() + '/public/debug-westburne-cart.png' }).catch(() => {});

        // Step 2: Click checkout
        log.push('Step 2: Checkout');
        console.error('[Westburne] Step 2: checkout');
        const checkoutBtn = page.locator(
          'a[href*="checkout"], button:has-text("Checkout"), button:has-text("Proceed"), button:has-text("Passer la commande"), #checkoutButtonTop, #checkoutButtonBottom'
        ).first();
        await checkoutBtn.click({ timeout: 10000 });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: process.cwd() + '/public/debug-westburne-checkout.png' }).catch(() => {});
        log.push(`Checkout URL: ${page.url()}`);

        // Step 3: PO number (B2B Hybris)
        log.push('Step 3: PO & delivery');
        console.error('[Westburne] Step 3: PO & delivery');
        const poField = page.locator('input[name*="purchaseOrderNumber"], input[id*="purchaseOrder"], input[name*="poNumber"], input[placeholder*="PO"]').first();
        if (await poField.isVisible({ timeout: 3000 }).catch(() => false)) {
          const poNumber = 'LS-' + Date.now().toString().slice(-6);
          await poField.fill(poNumber);
          log.push(`PO: ${poNumber}`);
        }

        // Delivery address
        const addressField = page.locator('input[name*="line1"], input[name*="address"], input[id*="address1"]').first();
        if (await addressField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addressField.fill(deliveryAddress);
          log.push('Address filled');
        } else {
          // Try selecting a saved address
          const savedAddr = page.locator('select[id*="address"], select[name*="address"], .address-select').first();
          if (await savedAddr.isVisible({ timeout: 3000 }).catch(() => false)) {
            await savedAddr.selectOption({ index: 1 });
            log.push('Selected saved address');
          } else {
            log.push('No address field — may use default');
          }
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-westburne-address.png' }).catch(() => {});

        // Step 4: Continue to payment
        log.push('Step 4: Continue');
        console.error('[Westburne] Step 4: continue to payment');
        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Continuer"), #addressSubmit, button[type="submit"]').first();
        if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await continueBtn.click();
          await page.waitForTimeout(4000);
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-westburne-payment.png' }).catch(() => {});

        // Step 5: Fill card details — Hybris uses select dropdowns for expiry
        log.push('Step 5: Card details');
        console.error('[Westburne] Step 5: card');
        await page.waitForTimeout(2000);

        // Try iframe first
        const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[title*="card"], iframe[id*="card"], iframe[name*="card"]').first();
        const iframeCard = cardFrame.locator('input').first();
        if (await iframeCard.isVisible({ timeout: 3000 }).catch(() => false)) {
          await iframeCard.fill(payment.cardNumber);
          const iframeName = cardFrame.locator('input[name*="name"], input[autocomplete="cc-name"]').first();
          if (await iframeName.isVisible({ timeout: 2000 }).catch(() => false)) await iframeName.fill(payment.cardHolder);
          const iframeExpiry = cardFrame.locator('input[name*="exp"], input[placeholder*="MM"]').first();
          if (await iframeExpiry.isVisible({ timeout: 2000 }).catch(() => false)) await iframeExpiry.fill(payment.cardExpiry);
          const iframeCvv = cardFrame.locator('input[name*="cvv"], input[name*="cvc"]').first();
          if (await iframeCvv.isVisible({ timeout: 2000 }).catch(() => false)) await iframeCvv.fill(payment.cardCvv);
          log.push('Card filled (iframe)');
        } else {
          // Direct input — Hybris card fields
          const cardNum = page.locator('input[id*="card_cardNumber"], input[name*="card_cardNumber"], input[id*="cardNumber"], input[autocomplete="cc-number"]').first();
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
          const cvvField = page.locator('input[id*="card_cvNumber"], input[name*="card_cvNumber"], input[autocomplete="cc-csc"]').first();
          if (await cvvField.isVisible({ timeout: 3000 }).catch(() => false)) await cvvField.fill(payment.cardCvv);
          log.push('Card filled (direct)');
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-westburne-card.png' }).catch(() => {});

        // Step 6: Place order
        log.push('Step 6: Place order');
        console.error('[Westburne] Step 6: place order');
        const placeBtn = page.locator('button:has-text("Place Order"), button:has-text("Passer la commande"), button:has-text("Submit Order"), button[id*="placeOrder"], #placeOrderForm button[type="submit"]').first();
        if (await placeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await placeBtn.click();
          await page.waitForTimeout(10000);
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-westburne-confirmation.png' }).catch(() => {});
        log.push(`Final URL: ${page.url()}`);

        // Step 7: Capture order number
        const bodyText = await page.textContent('body');
        const orderMatch = bodyText?.match(/order\s*#?\s*:?\s*([A-Z0-9-]{5,20})/i)
          || bodyText?.match(/commande\s*#?\s*:?\s*([A-Z0-9-]{5,20})/i)
          || bodyText?.match(/confirmation\s*:?\s*([A-Z0-9-]{5,20})/i);
        const orderId = orderMatch?.[1];
        console.error('[Westburne] Order ID:', orderId || 'not found');
        if (orderId) {
          log.push(`Order ID: ${orderId}`);
          return { success: true, orderId, log };
        }
        log.push('Order submitted but no confirmation number found');
        return { success: false, inCart: true, error: 'Commande soumise mais pas de numéro de confirmation', log };
      } catch (err: any) {
        log.push(`Checkout error: ${err.message}`);
        console.error('[Westburne] Checkout error:', err.message);
        await page.screenshot({ path: process.cwd() + '/public/debug-westburne-error.png' }).catch(() => {});
        return { success: false, inCart: true, error: `Checkout: ${err.message}`, log };
      }
    }

    return { success: false, inCart: true, log };
  } catch (err: any) {
    log.push(`Fatal error: ${err.message}`);
    return { success: false, error: err.message, log };
  } finally {
    await browser.close();
  }
}
