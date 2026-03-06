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
  const log: string[] = [];
  const browser = await createBrowserbaseBrowser();
  try {
    log.push('Creating browser page');
    const page = await createRonaPage(browser);
    log.push('Logging in to Rona');
    const loggedIn = await loginToRona(page, username, password);
    if (!loggedIn) {
      log.push('Login failed');
      return { success: false, error: 'Login Rona échoué', log };
    }
    log.push('Login successful');

    log.push(`Searching for product: ${product}`);
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
      log.push('Product found — clicking');
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[aria-label*="quantit"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.push(`Setting quantity to ${quantity}`);
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button:has-text("Ajouter au panier"), button:has-text("Add to Cart"), button[data-test*="add-to-cart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        log.push('Clicking add to cart');
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        log.push('Added to cart');
        console.error(`[Rona] Added to cart: ${product}`);

        // ── Checkout automatique si adresse et paiement fournis ──
        if (deliveryAddress && payment) {
          try {
            // Step 1: Navigate to cart
            log.push('Step 1: Navigating to cart');
            console.error('[Rona] Step 1: Navigating to cart');
            await page.goto('https://www.rona.ca/fr/panier', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: process.cwd() + '/public/debug-rona-cart.png' }).catch(() => {});
            log.push(`Cart URL: ${page.url()}`);
            console.error('[Rona] Cart URL:', page.url());

            // Step 2: Click checkout
            log.push('Step 2: Clicking checkout button');
            console.error('[Rona] Step 2: Clicking checkout');
            const checkoutBtn = page.locator('button:has-text("Passer à la caisse"), button:has-text("Checkout"), a:has-text("Passer à la caisse"), a:has-text("Proceed to Checkout"), a[href*="checkout"]').first();
            await checkoutBtn.click({ timeout: 10000 });
            await page.waitForTimeout(5000);
            await page.screenshot({ path: process.cwd() + '/public/debug-rona-checkout.png' }).catch(() => {});
            log.push(`Checkout URL: ${page.url()}`);
            console.error('[Rona] Checkout URL:', page.url());

            // Step 3: Fill delivery address
            log.push('Step 3: Filling delivery address');
            console.error('[Rona] Step 3: Filling delivery address');
            const addressField = page.locator('input[name*="address"], input[id*="address"], input[placeholder*="Adresse"], input[placeholder*="Address"], input[autocomplete="street-address"]').first();
            if (await addressField.isVisible({ timeout: 8000 })) {
              await addressField.fill(deliveryAddress);
              await page.waitForTimeout(1000);
              // Select first autocomplete suggestion if dropdown appears
              const suggestion = page.locator('[class*="suggestion"], [class*="autocomplete"] li, [role="option"]').first();
              if (await suggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
                await suggestion.click();
                await page.waitForTimeout(1000);
              }
              log.push('Address filled');
              console.error('[Rona] Address filled');
            } else {
              log.push('No address field visible — may already be saved');
              console.error('[Rona] No address field — may already be saved');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-rona-address.png' }).catch(() => {});

            // Step 4: Continue to payment
            log.push('Step 4: Continuing to payment');
            console.error('[Rona] Step 4: Continue to payment');
            const continueBtn = page.locator('button:has-text("Continuer"), button:has-text("Continue"), button[type="submit"]').first();
            if (await continueBtn.isVisible({ timeout: 5000 })) {
              await continueBtn.click();
              await page.waitForTimeout(4000);
              log.push('Clicked continue button');
            } else {
              log.push('No continue button visible — may already be on payment');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-rona-payment.png' }).catch(() => {});
            log.push(`Payment page URL: ${page.url()}`);
            console.error('[Rona] Payment URL:', page.url());

            // Step 5: Fill card details (try iframe first, then direct)
            log.push('Step 5: Filling card details');
            console.error('[Rona] Step 5: Filling card details');
            await page.waitForTimeout(2000);
            const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[title*="card"], iframe[name*="card"], iframe[id*="card"], iframe[title*="credit"]').first();
            const iframeCardInput = cardFrame.locator('input[name*="cardnumber"], input[autocomplete="cc-number"], input').first();
            if (await iframeCardInput.isVisible({ timeout: 5000 }).catch(() => false)) {
              log.push('Card input found in iframe');
              console.error('[Rona] Card in iframe — filling');
              await iframeCardInput.fill(payment.cardNumber);
              const iframeExpiry = cardFrame.locator('input[name*="exp"], input[placeholder*="MM"]').first();
              if (await iframeExpiry.isVisible({ timeout: 2000 }).catch(() => false)) await iframeExpiry.fill(payment.cardExpiry);
              const iframeCvv = cardFrame.locator('input[name*="cvv"], input[name*="cvc"]').first();
              if (await iframeCvv.isVisible({ timeout: 2000 }).catch(() => false)) await iframeCvv.fill(payment.cardCvv);
              // Fill cardholder name in iframe
              const iframeNameField = cardFrame.locator('input[name*="name"], input[id*="name"], input[autocomplete="cc-name"]').first();
              if (await iframeNameField.isVisible({ timeout: 2000 }).catch(() => false)) {
                await iframeNameField.fill(payment.cardHolder);
                log.push('Card holder name filled (iframe)');
              }
            } else {
              log.push('Card input found directly on page');
              console.error('[Rona] Card direct input — filling');
              const cardNumberField = page.locator('input[name*="card"], input[id*="card-number"], input[autocomplete="cc-number"]').first();
              if (await cardNumberField.isVisible({ timeout: 5000 })) await cardNumberField.fill(payment.cardNumber);
              // Fill cardholder name (direct)
              const nameField = page.locator('input[name*="name"], input[id*="name"], input[autocomplete="cc-name"]').first();
              if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
                await nameField.fill(payment.cardHolder);
                log.push('Card holder name filled (direct)');
              }
              const expiryField = page.locator('input[name*="expir"], input[placeholder*="MM"], input[autocomplete="cc-exp"]').first();
              if (await expiryField.isVisible({ timeout: 3000 })) await expiryField.fill(payment.cardExpiry);
              const cvvField = page.locator('input[name*="cvv"], input[name*="cvc"], input[autocomplete="cc-csc"]').first();
              if (await cvvField.isVisible({ timeout: 3000 })) await cvvField.fill(payment.cardCvv);
            }
            log.push('Card details filled');
            await page.screenshot({ path: process.cwd() + '/public/debug-rona-card-filled.png' }).catch(() => {});

            // Step 6: Place order
            log.push('Step 6: Placing order');
            console.error('[Rona] Step 6: Placing order');
            await page.waitForTimeout(2000);
            const placeOrderBtn = page.locator('button:has-text("Passer la commande"), button:has-text("Place Order"), button:has-text("Submit Order"), button:has-text("Commander")').first();
            if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
              await placeOrderBtn.click();
              log.push('Clicked place order button — waiting for confirmation');
              await page.waitForTimeout(10000);
            } else {
              log.push('Place order button not visible');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-rona-confirmation.png' }).catch(() => {});
            log.push(`Final URL: ${page.url()}`);
            console.error('[Rona] Final URL:', page.url());

            // Step 7: Capture order number
            log.push('Step 7: Capturing order number');
            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/confirmation\s*#?\s*([A-Z0-9-]{5,20})/i);
            const orderId = orderMatch?.[1];
            console.error('[Rona] Order ID:', orderId || 'not found');
            if (orderId) {
              log.push(`Order confirmed: ${orderId}`);
            } else {
              const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
              log.push(`Order ID not found. Page snippet: ${bodySnippet.slice(0, 200)}`);
              console.error('[Rona] Page body snippet:', bodySnippet);
            }
            return { success: true, orderId, log };
          } catch (checkoutErr: any) {
            const errMsg = checkoutErr?.message || String(checkoutErr);
            log.push(`Checkout error: ${errMsg}`);
            console.error('[Rona] Checkout error:', errMsg);
            await page.screenshot({ path: process.cwd() + '/public/debug-rona-error.png' }).catch(() => {});
            return { success: false, error: `Checkout: ${errMsg}`, log };
          }
        }

        return { success: false, inCart: true, log };
      }
    }

    log.push(`Product "${product}" not found on Rona`);
    return { success: false, error: `Produit "${product}" introuvable sur Rona`, log };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    log.push(`Fatal error: ${errMsg}`);
    return { success: false, error: errMsg, log };
  } finally {
    await browser.close();
  }
}
