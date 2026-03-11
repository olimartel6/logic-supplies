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

    // Build search query: try SKU from catalog first (more precise than full name)
    let searchQuery = product;
    try {
      const { getDb } = await import('./db');
      const row = (
        getDb().prepare("SELECT sku FROM products WHERE name = ? AND supplier = 'westburne' LIMIT 1").get(product) ||
        getDb().prepare("SELECT sku FROM products WHERE name = ? LIMIT 1").get(product)
      ) as { sku: string } | undefined;
      if (row?.sku) searchQuery = row.sku.split('/')[0];
    } catch {}

    log.push(`Searching for product: ${searchQuery}`);
    await page.goto(
      `https://www.westburne.ca/cwr/search?q=${encodeURIComponent(searchQuery)}&text=${encodeURIComponent(searchQuery)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[Westburne] Searching for: ${searchQuery}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a.product-item__name, .product-name a, h3 a[href*="/p/"], .product-list__item a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      log.push('Product found, clicking');
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator(
        'input[name="qty"], input[id*="qty"], input[class*="qty"], input[name="quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.push(`Setting quantity to ${quantity}`);
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button:has-text("Add to Cart"), button:has-text("Ajouter au panier"), button[class*="add-to-cart"], .js-add-to-cart'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        log.push('Adding to cart');
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        log.push('Added to cart');
        console.error(`[Westburne] Added to cart: ${product}`);

        // ── Checkout automatique si adresse et paiement fournis ──
        if (deliveryAddress && payment) {
          try {
            // Step 1: Navigate to cart (SAP Hybris — same as Nedco, Rexel group)
            log.push('Step 1: Navigating to cart');
            console.error('[Westburne] Step 1: Navigating to cart');
            await page.goto('https://www.westburne.ca/cwr/cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: process.cwd() + '/public/debug-westburne-cart.png' }).catch(() => {});
            log.push(`Cart URL: ${page.url()}`);
            console.error('[Westburne] Cart URL:', page.url());

            // Step 2: Click checkout (Hybris)
            log.push('Step 2: Clicking checkout');
            console.error('[Westburne] Step 2: Clicking checkout');
            const checkoutBtn = page.locator('button:has-text("Checkout"), button:has-text("Proceed to Checkout"), a:has-text("Checkout"), a[href*="checkout"]').first();
            await checkoutBtn.click({ timeout: 10000 });
            await page.waitForTimeout(5000);
            await page.screenshot({ path: process.cwd() + '/public/debug-westburne-checkout.png' }).catch(() => {});
            log.push(`Checkout URL: ${page.url()}`);
            console.error('[Westburne] Checkout URL:', page.url());

            // Step 3: Fill delivery/shipping info
            log.push('Step 3: Filling delivery address');
            console.error('[Westburne] Step 3: Filling delivery address');
            // B2B Hybris often has PO number
            const poField = page.locator('input[name*="purchaseOrderNumber"], input[id*="purchaseOrder"], input[name*="poNumber"], input[placeholder*="PO"]').first();
            if (await poField.isVisible({ timeout: 3000 }).catch(() => false)) {
              const poNumber = 'AUTO-' + Date.now().toString().slice(-6);
              await poField.fill(poNumber);
              log.push(`PO number filled: ${poNumber}`);
              console.error('[Westburne] PO number filled');
            }
            const addressField = page.locator('input[name*="address"], input[id*="address"], input[name*="line1"], input[placeholder*="Address"]').first();
            if (await addressField.isVisible({ timeout: 5000 }).catch(() => false)) {
              await addressField.fill(deliveryAddress);
              log.push('Address filled');
              console.error('[Westburne] Address filled');
            } else {
              // Try selecting a saved address
              const savedAddr = page.locator('select[id*="address"], select[name*="address"]').first();
              if (await savedAddr.isVisible({ timeout: 3000 }).catch(() => false)) {
                await savedAddr.selectOption({ index: 1 });
                log.push('Selected saved address');
                console.error('[Westburne] Selected saved address');
              } else {
                log.push('No address field found — may already be set');
                console.error('[Westburne] No address field — may already be set');
              }
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-westburne-address.png' }).catch(() => {});

            // Step 4: Continue to payment
            log.push('Step 4: Continue to payment');
            console.error('[Westburne] Step 4: Continue to payment');
            const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Continuer"), button[type="submit"]').first();
            if (await continueBtn.isVisible({ timeout: 5000 })) {
              await continueBtn.click();
              await page.waitForTimeout(4000);
              log.push('Clicked continue');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-westburne-payment.png' }).catch(() => {});
            log.push(`Payment URL: ${page.url()}`);
            console.error('[Westburne] Payment URL:', page.url());

            // Step 5: Fill card details
            log.push('Step 5: Filling card details');
            console.error('[Westburne] Step 5: Filling card details');
            await page.waitForTimeout(2000);
            const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[title*="card"], iframe[id*="card"], iframe[name*="card"]').first();
            const iframeCardInput = cardFrame.locator('input[name*="cardnumber"], input[autocomplete="cc-number"], input').first();
            if (await iframeCardInput.isVisible({ timeout: 5000 }).catch(() => false)) {
              log.push('Card in iframe — filling');
              console.error('[Westburne] Card in iframe — filling');
              await iframeCardInput.fill(payment.cardNumber);
              // Fill cardholder name in iframe
              const iframeNameField = cardFrame.locator('input[name*="name"], input[id*="name"], input[autocomplete="cc-name"]').first();
              if (await iframeNameField.isVisible({ timeout: 2000 }).catch(() => false)) {
                await iframeNameField.fill(payment.cardHolder);
                log.push('Card holder name filled (iframe)');
              }
              const iframeExpiry = cardFrame.locator('input[name*="exp"], input[placeholder*="MM"]').first();
              if (await iframeExpiry.isVisible({ timeout: 2000 }).catch(() => false)) await iframeExpiry.fill(payment.cardExpiry);
              const iframeCvv = cardFrame.locator('input[name*="cvv"], input[name*="cvc"]').first();
              if (await iframeCvv.isVisible({ timeout: 2000 }).catch(() => false)) await iframeCvv.fill(payment.cardCvv);
              log.push('Card details filled (iframe)');
            } else {
              log.push('Card direct input — filling');
              console.error('[Westburne] Card direct input — filling');
              const cardNumberField = page.locator('input[id*="card_cardNumber"], input[name*="card_cardNumber"], input[id*="cardNumber"], input[autocomplete="cc-number"]').first();
              if (await cardNumberField.isVisible({ timeout: 5000 })) await cardNumberField.fill(payment.cardNumber);
              // Fill cardholder name (direct)
              const nameField = page.locator('input[name*="name"], input[id*="name"], input[autocomplete="cc-name"]').first();
              if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
                await nameField.fill(payment.cardHolder);
                log.push('Card holder name filled (direct)');
              }
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
              log.push('Card details filled (direct)');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-westburne-card-filled.png' }).catch(() => {});

            // Step 6: Place order
            log.push('Step 6: Placing order');
            console.error('[Westburne] Step 6: Placing order');
            await page.waitForTimeout(2000);
            const placeOrderBtn = page.locator('button:has-text("Place Order"), button:has-text("Passer la commande"), button:has-text("Submit Order"), button[id*="placeOrder"]').first();
            if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
              await placeOrderBtn.click();
              await page.waitForTimeout(10000);
              log.push('Place order clicked, waiting for confirmation');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-westburne-confirmation.png' }).catch(() => {});
            log.push(`Final URL: ${page.url()}`);
            console.error('[Westburne] Final URL:', page.url());

            // Step 7: Capture order number
            log.push('Step 7: Capturing order number');
            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/confirmation\s*:?\s*([A-Z0-9-]{5,20})/i);
            const orderId = orderMatch?.[1];
            console.error('[Westburne] Order ID:', orderId || 'not found');
            if (!orderId) {
              const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
              log.push(`Order ID not found. Page snippet: ${bodySnippet}`);
              console.error('[Westburne] Page body snippet:', bodySnippet);
            } else {
              log.push(`Order ID: ${orderId}`);
            }
            if (!orderId) {
              return { success: false, inCart: true, error: 'Commande soumise mais pas de numéro de confirmation', log };
            }
            return { success: true, orderId, log };
          } catch (checkoutErr: any) {
            const errMsg = checkoutErr?.message || String(checkoutErr);
            log.push(`Checkout error: ${errMsg}`);
            console.error('[Westburne] Checkout error:', errMsg);
            await page.screenshot({ path: process.cwd() + '/public/debug-westburne-error.png' }).catch(() => {});
            return { success: false, inCart: true, error: `Checkout: ${errMsg}`, log };
          }
        }

        return { success: false, inCart: true, log };
      }
      log.push('Add to cart button not found');
    } else {
      log.push(`Product "${product}" not found on search page`);
    }

    return { success: false, error: `Produit "${product}" introuvable sur Westburne`, log };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    log.push(`Fatal error: ${errMsg}`);
    return { success: false, error: errMsg, log };
  } finally {
    await browser.close();
  }
}
