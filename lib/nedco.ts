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
  await page.goto('https://www.nedco.ca/cnd/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input#j_username', 'input[name="j_username"]', 'input[name="username"]', 'input[type="email"]', 'input[id*="user"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input#j_password', 'input[name="j_password"]', 'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const url = page.url();
  return !url.includes('/login') && url.includes('nedco.ca');
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
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createNedcoPage(browser);
    const loggedIn = await loginToNedco(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.nedco.ca/cnd/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`,
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

export async function placeNedcoOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createNedcoPage(browser);
    const loggedIn = await loginToNedco(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Nedco échoué' };

    await page.goto(
      `https://www.nedco.ca/cnd/search?q=${encodeURIComponent(product)}&text=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a.product-item__name, .product-name a, h3 a[href*="/p/"], .product-list__item a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator('input[name="qty"], input[id*="qty"], input[name="quantity"]').first();
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
        console.error(`[Nedco] Added to cart: ${product}`);

        // ── Checkout automatique si adresse et paiement fournis ──
        if (deliveryAddress && payment) {
          try {
            // Step 1: Navigate to cart (SAP Hybris)
            console.error('[Nedco] Step 1: Navigating to cart');
            await page.goto('https://www.nedco.ca/cnd/cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: process.cwd() + '/public/debug-nedco-cart.png' }).catch(() => {});
            console.error('[Nedco] Cart URL:', page.url());

            // Step 2: Click checkout (Hybris)
            console.error('[Nedco] Step 2: Clicking checkout');
            const checkoutBtn = page.locator('button:has-text("Checkout"), button:has-text("Proceed to Checkout"), a:has-text("Checkout"), a[href*="checkout"]').first();
            await checkoutBtn.click({ timeout: 10000 });
            await page.waitForTimeout(5000);
            await page.screenshot({ path: process.cwd() + '/public/debug-nedco-checkout.png' }).catch(() => {});
            console.error('[Nedco] Checkout URL:', page.url());

            // Step 3: Fill delivery/shipping info
            console.error('[Nedco] Step 3: Filling delivery address');
            // B2B Hybris often has PO number
            const poField = page.locator('input[name*="purchaseOrderNumber"], input[id*="purchaseOrder"], input[name*="poNumber"], input[placeholder*="PO"]').first();
            if (await poField.isVisible({ timeout: 3000 }).catch(() => false)) {
              await poField.fill('AUTO-' + Date.now().toString().slice(-6));
              console.error('[Nedco] PO number filled');
            }
            const addressField = page.locator('input[name*="address"], input[id*="address"], input[name*="line1"], input[placeholder*="Address"]').first();
            if (await addressField.isVisible({ timeout: 5000 }).catch(() => false)) {
              await addressField.fill(deliveryAddress);
              console.error('[Nedco] Address filled');
            } else {
              // Try selecting a saved address
              const savedAddr = page.locator('select[id*="address"], select[name*="address"]').first();
              if (await savedAddr.isVisible({ timeout: 3000 }).catch(() => false)) {
                // Select first non-empty option
                await savedAddr.selectOption({ index: 1 });
                console.error('[Nedco] Selected saved address');
              } else {
                console.error('[Nedco] No address field — may already be set');
              }
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-nedco-address.png' }).catch(() => {});

            // Step 4: Continue to payment
            console.error('[Nedco] Step 4: Continue to payment');
            const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Continuer"), button[type="submit"]').first();
            if (await continueBtn.isVisible({ timeout: 5000 })) {
              await continueBtn.click();
              await page.waitForTimeout(4000);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-nedco-payment.png' }).catch(() => {});
            console.error('[Nedco] Payment URL:', page.url());

            // Step 5: Fill card details
            console.error('[Nedco] Step 5: Filling card details');
            const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[title*="card"], iframe[id*="card"], iframe[name*="card"]').first();
            const iframeCardInput = cardFrame.locator('input[name*="cardnumber"], input[autocomplete="cc-number"], input').first();
            if (await iframeCardInput.isVisible({ timeout: 5000 }).catch(() => false)) {
              console.error('[Nedco] Card in iframe — filling');
              await iframeCardInput.fill(payment.cardNumber);
              const iframeExpiry = cardFrame.locator('input[name*="exp"], input[placeholder*="MM"]').first();
              if (await iframeExpiry.isVisible({ timeout: 2000 }).catch(() => false)) await iframeExpiry.fill(payment.cardExpiry);
              const iframeCvv = cardFrame.locator('input[name*="cvv"], input[name*="cvc"]').first();
              if (await iframeCvv.isVisible({ timeout: 2000 }).catch(() => false)) await iframeCvv.fill(payment.cardCvv);
            } else {
              console.error('[Nedco] Card direct input — filling');
              const cardNumberField = page.locator('input[id*="card_cardNumber"], input[name*="card_cardNumber"], input[id*="cardNumber"], input[autocomplete="cc-number"]').first();
              if (await cardNumberField.isVisible({ timeout: 5000 })) await cardNumberField.fill(payment.cardNumber);
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
              if (await cvvField.isVisible({ timeout: 3000 })) await cvvField.fill(payment.cardCvv);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-nedco-card-filled.png' }).catch(() => {});

            // Step 6: Place order
            console.error('[Nedco] Step 6: Placing order');
            const placeOrderBtn = page.locator('button:has-text("Place Order"), button:has-text("Passer la commande"), button:has-text("Submit Order"), button[id*="placeOrder"]').first();
            if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
              await placeOrderBtn.click();
              await page.waitForTimeout(10000);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-nedco-confirmation.png' }).catch(() => {});
            console.error('[Nedco] Final URL:', page.url());

            // Step 7: Capture order number
            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/confirmation\s*:?\s*([A-Z0-9-]{5,20})/i);
            const orderId = orderMatch?.[1];
            console.error('[Nedco] Order ID:', orderId || 'not found');
            if (!orderId) {
              const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
              console.error('[Nedco] Page body snippet:', bodySnippet);
            }
            return { success: true, orderId };
          } catch (checkoutErr: any) {
            console.error('[Nedco] Checkout error:', checkoutErr.message);
            await page.screenshot({ path: process.cwd() + '/public/debug-nedco-error.png' }).catch(() => {});
            return { success: false, inCart: true, error: `Checkout: ${checkoutErr.message}` };
          }
        }

        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Nedco` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
