import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const FUTECH_BRANCHES: Branch[] = [
  { name: 'Futech Québec',           address: '2985 Boul. Hamel, Québec, QC',                  lat: 46.8139, lng: -71.2080 },
  { name: 'Futech Montréal',         address: '5600 Boul. Métropolitain E, Montréal, QC',      lat: 45.5942, lng: -73.5550 },
  { name: 'Futech Sherbrooke',       address: '3200 Boul. Industriel, Sherbrooke, QC',         lat: 45.4042, lng: -71.8929 },
  { name: 'Futech Trois-Rivières',   address: '4200 Boul. des Forges, Trois-Rivières, QC',     lat: 46.3432, lng: -72.5477 },
];

async function createFutechPage(browser: any) {
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

async function loginToFutech(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://shop.futech.ca/fr/Account/Login', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const emailField = page.locator([
    'input[name="Email"]',
    'input[id="Email"]',
    'input[type="email"]',
    'input[name="username"]',
    'input[id*="email"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input[name="Password"]',
    'input[id="Password"]',
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
  return !url.toLowerCase().includes('/login') && url.includes('futech.ca');
}

export async function testFutechConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createFutechPage(browser);
    const loggedIn = await loginToFutech(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Futech invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getFutechPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createFutechPage(browser);
    const loggedIn = await loginToFutech(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://shop.futech.ca/fr/search?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('[class*="price"]:not([class*="old"])').first();
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

export async function placeFutechOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createFutechPage(browser);
    const loggedIn = await loginToFutech(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Futech échoué' };

    await page.goto(
      `https://shop.futech.ca/fr/search?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[Futech] Searching for: ${product}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a[href*="/fr/p/"], a[href*="/fr/Product"], .product-item a, .product-name a, h3 a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[name="Quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button[type="submit"]:has-text("Ajouter"), button:has-text("Add to Cart"), button[id*="addtocart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[Futech] Added to cart: ${product}`);

        // ── Checkout automatique si adresse et paiement fournis ──
        if (deliveryAddress && payment) {
          try {
            // Step 1: Navigate to cart
            console.error('[Futech] Step 1: Navigating to cart');
            await page.goto('https://shop.futech.ca/fr/Cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: process.cwd() + '/public/debug-futech-cart.png' }).catch(() => {});
            console.error('[Futech] Cart URL:', page.url());

            // Step 2: Click checkout
            console.error('[Futech] Step 2: Clicking checkout');
            const checkoutBtn = page.locator('button:has-text("Commander"), button:has-text("Checkout"), button:has-text("Passer la commande"), a:has-text("Commander"), a:has-text("Checkout"), a[href*="checkout"], a[href*="Checkout"]').first();
            await checkoutBtn.click({ timeout: 10000 });
            await page.waitForTimeout(5000);
            await page.screenshot({ path: process.cwd() + '/public/debug-futech-checkout.png' }).catch(() => {});
            console.error('[Futech] Checkout URL:', page.url());

            // Step 3: Fill shipping address
            console.error('[Futech] Step 3: Filling shipping address');
            const addressField = page.locator('input[name*="Address"], input[name*="address"], input[id*="Address"], input[placeholder*="Adresse"], input[placeholder*="Address"]').first();
            if (await addressField.isVisible({ timeout: 8000 }).catch(() => false)) {
              await addressField.fill(deliveryAddress);
              console.error('[Futech] Address filled');
            } else {
              console.error('[Futech] No address field — may already be saved');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-futech-address.png' }).catch(() => {});

            // Step 4: Continue to payment
            console.error('[Futech] Step 4: Continue to payment');
            const continueBtn = page.locator('button:has-text("Continuer"), button:has-text("Continue"), button:has-text("Suivant"), button[type="submit"]').first();
            if (await continueBtn.isVisible({ timeout: 5000 })) {
              await continueBtn.click();
              await page.waitForTimeout(4000);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-futech-payment.png' }).catch(() => {});
            console.error('[Futech] Payment URL:', page.url());

            // Step 5: Fill card details
            console.error('[Futech] Step 5: Filling card details');
            const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[title*="card"], iframe[id*="card"], iframe[name*="card"]').first();
            const iframeCardInput = cardFrame.locator('input[name*="cardnumber"], input[autocomplete="cc-number"], input').first();
            if (await iframeCardInput.isVisible({ timeout: 5000 }).catch(() => false)) {
              console.error('[Futech] Card in iframe — filling');
              await iframeCardInput.fill(payment.cardNumber);
              const iframeExpiry = cardFrame.locator('input[name*="exp"], input[placeholder*="MM"]').first();
              if (await iframeExpiry.isVisible({ timeout: 2000 }).catch(() => false)) await iframeExpiry.fill(payment.cardExpiry);
              const iframeCvv = cardFrame.locator('input[name*="cvv"], input[name*="cvc"]').first();
              if (await iframeCvv.isVisible({ timeout: 2000 }).catch(() => false)) await iframeCvv.fill(payment.cardCvv);
            } else {
              console.error('[Futech] Card direct input — filling');
              const cardNumberField = page.locator('input[name*="CardNumber"], input[name*="card"], input[id*="card"], input[autocomplete="cc-number"]').first();
              if (await cardNumberField.isVisible({ timeout: 5000 })) await cardNumberField.fill(payment.cardNumber);
              const expiryField = page.locator('input[name*="Expir"], input[name*="expir"], input[placeholder*="MM"], input[autocomplete="cc-exp"]').first();
              if (await expiryField.isVisible({ timeout: 3000 })) await expiryField.fill(payment.cardExpiry);
              const cvvField = page.locator('input[name*="Cvv"], input[name*="cvv"], input[name*="cvc"], input[autocomplete="cc-csc"]').first();
              if (await cvvField.isVisible({ timeout: 3000 })) await cvvField.fill(payment.cardCvv);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-futech-card-filled.png' }).catch(() => {});

            // Step 6: Place order
            console.error('[Futech] Step 6: Placing order');
            const placeOrderBtn = page.locator('button:has-text("Passer la commande"), button:has-text("Place Order"), button:has-text("Commander"), button:has-text("Confirmer"), button[type="submit"]:has-text("Order")').first();
            if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
              await placeOrderBtn.click();
              await page.waitForTimeout(10000);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-futech-confirmation.png' }).catch(() => {});
            console.error('[Futech] Final URL:', page.url());

            // Step 7: Capture order number
            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/confirmation\s*#?\s*([A-Z0-9-]{5,20})/i);
            const orderId = orderMatch?.[1];
            console.error('[Futech] Order ID:', orderId || 'not found');
            if (!orderId) {
              const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
              console.error('[Futech] Page body snippet:', bodySnippet);
            }
            return { success: true, orderId };
          } catch (checkoutErr: any) {
            console.error('[Futech] Checkout error:', checkoutErr.message);
            await page.screenshot({ path: process.cwd() + '/public/debug-futech-error.png' }).catch(() => {});
            return { success: false, inCart: true, error: `Checkout: ${checkoutErr.message}` };
          }
        }

        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur Futech` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
