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
  const log: string[] = [];
  const browser = await createBrowserbaseBrowser();
  try {
    log.push('Creating browser page');
    const page = await createDeschenesPage(browser);
    log.push('Logging in to Deschênes');
    const loggedIn = await loginToDeschenes(page, username, password);
    if (!loggedIn) {
      log.push('Login failed');
      return { success: false, error: 'Login Deschênes échoué', log };
    }
    log.push('Login successful');

    // Build search query: try SKU from catalog first
    let searchQuery = product;
    try {
      const { getDb } = await import('./db');
      const row = (
        getDb().prepare("SELECT sku FROM products WHERE name = ? AND supplier = 'deschenes' LIMIT 1").get(product) ||
        getDb().prepare("SELECT sku FROM products WHERE name = ? LIMIT 1").get(product)
      ) as { sku: string } | undefined;
      if (row?.sku) searchQuery = row.sku.split('/')[0];
    } catch {}

    log.push(`Navigating to search: ${searchQuery}`);
    await page.goto(
      `https://www.deschenes.qc.ca/s/search?q=${encodeURIComponent(searchQuery)}&language=fr`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[Deschênes] Searching for: ${searchQuery}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a[href*="/s/"] .product-name, .product-tile a, h3 a, .tile-body a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      log.push('Product found, clicking');
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator('input[name="quantity"], input[id*="quantity"]').first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.push(`Setting quantity to ${quantity}`);
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button:has-text("Ajouter au panier"), button:has-text("Add to Cart"), button[class*="add-to-cart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        log.push('Clicking add to cart');
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        log.push('Added to cart');
        console.error(`[Deschênes] Added to cart: ${product}`);

        // ── Checkout automatique si adresse et paiement fournis ──
        if (deliveryAddress && payment) {
          try {
            // Step 1: Navigate to cart (Salesforce Commerce / B2B)
            log.push('Step 1: Navigating to cart');
            console.error('[Deschênes] Step 1: Navigating to cart');
            await page.goto('https://www.deschenes.qc.ca/s/cart?language=fr', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: process.cwd() + '/public/debug-deschenes-cart.png' }).catch(() => {});
            log.push(`Cart URL: ${page.url()}`);
            console.error('[Deschênes] Cart URL:', page.url());

            // Step 2: Click checkout / proceed
            log.push('Step 2: Clicking checkout');
            console.error('[Deschênes] Step 2: Clicking checkout');
            const checkoutBtn = page.locator('button:has-text("Commander"), button:has-text("Passer la commande"), button:has-text("Checkout"), button:has-text("Proceed"), a:has-text("Commander"), a[href*="checkout"]').first();
            await checkoutBtn.click({ timeout: 10000 });
            await page.waitForTimeout(5000);
            await page.screenshot({ path: process.cwd() + '/public/debug-deschenes-checkout.png' }).catch(() => {});
            log.push(`Checkout URL: ${page.url()}`);
            console.error('[Deschênes] Checkout URL:', page.url());

            // Step 3: Fill delivery address (B2B — may have PO number or saved addresses)
            log.push('Step 3: Filling delivery address');
            console.error('[Deschênes] Step 3: Filling delivery address');
            // Try PO number field first (common in B2B)
            const poField = page.locator('input[name*="poNumber"], input[name*="po_number"], input[placeholder*="PO"], input[placeholder*="bon de commande"]').first();
            if (await poField.isVisible({ timeout: 3000 }).catch(() => false)) {
              await poField.fill('AUTO-' + Date.now().toString().slice(-6));
              log.push('PO number filled');
              console.error('[Deschênes] PO number filled');
            }
            const addressField = page.locator('input[name*="address"], input[name*="street"], input[placeholder*="Adresse"], input[placeholder*="Address"]').first();
            if (await addressField.isVisible({ timeout: 5000 }).catch(() => false)) {
              await addressField.fill(deliveryAddress);
              log.push('Address filled');
              console.error('[Deschênes] Address filled');
            } else {
              log.push('No address field — may already be saved');
              console.error('[Deschênes] No address field — may already be saved');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-deschenes-address.png' }).catch(() => {});

            // Step 4: Continue to payment
            log.push('Step 4: Continue to payment');
            console.error('[Deschênes] Step 4: Continue to payment');
            const continueBtn = page.locator('button:has-text("Continuer"), button:has-text("Continue"), button:has-text("Suivant"), button:has-text("Next"), button[type="submit"]').first();
            if (await continueBtn.isVisible({ timeout: 5000 })) {
              await continueBtn.click();
              await page.waitForTimeout(4000);
              log.push('Continued to payment page');
            }
            await page.waitForTimeout(2000);
            await page.screenshot({ path: process.cwd() + '/public/debug-deschenes-payment.png' }).catch(() => {});
            log.push(`Payment URL: ${page.url()}`);
            console.error('[Deschênes] Payment URL:', page.url());

            // Step 5: Fill card details
            log.push('Step 5: Filling card details');
            console.error('[Deschênes] Step 5: Filling card details');
            await page.waitForTimeout(2000);
            const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[title*="card"], iframe[id*="card"], iframe[name*="card"]').first();
            const iframeCardInput = cardFrame.locator('input[name*="cardnumber"], input[autocomplete="cc-number"], input').first();
            if (await iframeCardInput.isVisible({ timeout: 5000 }).catch(() => false)) {
              log.push('Card in iframe — filling');
              console.error('[Deschênes] Card in iframe — filling');
              await iframeCardInput.fill(payment.cardNumber);
              // Fill card holder name in iframe
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
              console.error('[Deschênes] Card direct input — filling');
              const cardNumberField = page.locator('input[name*="card"], input[id*="card"], input[autocomplete="cc-number"]').first();
              if (await cardNumberField.isVisible({ timeout: 5000 })) await cardNumberField.fill(payment.cardNumber);
              // Fill card holder name on page
              const nameField = page.locator('input[name*="name"], input[id*="name"], input[autocomplete="cc-name"]').first();
              if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
                await nameField.fill(payment.cardHolder);
                log.push('Card holder name filled (direct)');
              }
              const expiryField = page.locator('input[name*="expir"], input[placeholder*="MM"], input[autocomplete="cc-exp"]').first();
              if (await expiryField.isVisible({ timeout: 3000 })) await expiryField.fill(payment.cardExpiry);
              const cvvField = page.locator('input[name*="cvv"], input[name*="cvc"], input[autocomplete="cc-csc"]').first();
              if (await cvvField.isVisible({ timeout: 3000 })) await cvvField.fill(payment.cardCvv);
              log.push('Card details filled (direct)');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-deschenes-card-filled.png' }).catch(() => {});

            // Step 6: Place order
            log.push('Step 6: Placing order');
            console.error('[Deschênes] Step 6: Placing order');
            await page.waitForTimeout(2000);
            const placeOrderBtn = page.locator('button:has-text("Passer la commande"), button:has-text("Place Order"), button:has-text("Commander"), button:has-text("Confirmer")').first();
            if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
              await placeOrderBtn.click();
              await page.waitForTimeout(10000);
              log.push('Place order button clicked');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-deschenes-confirmation.png' }).catch(() => {});
            log.push(`Final URL: ${page.url()}`);
            console.error('[Deschênes] Final URL:', page.url());

            // Step 7: Capture order number
            log.push('Step 7: Capturing order number');
            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/confirmation\s*#?\s*([A-Z0-9-]{5,20})/i);
            const orderId = orderMatch?.[1];
            log.push(`Order ID: ${orderId || 'not found'}`);
            console.error('[Deschênes] Order ID:', orderId || 'not found');
            if (!orderId) {
              const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
              log.push(`Page body snippet: ${bodySnippet}`);
              console.error('[Deschênes] Page body snippet:', bodySnippet);
            }
            return { success: true, orderId, log };
          } catch (checkoutErr: any) {
            const errMsg = checkoutErr?.message || String(checkoutErr);
            log.push(`Checkout error: ${errMsg}`);
            console.error('[Deschênes] Checkout error:', errMsg);
            await page.screenshot({ path: process.cwd() + '/public/debug-deschenes-error.png' }).catch(() => {});
            return { success: false, inCart: true, error: `Checkout: ${errMsg}`, log };
          }
        }

        return { success: false, inCart: true, log };
      }
    }

    log.push(`Product "${product}" not found`);
    return { success: false, error: `Produit "${product}" introuvable sur Deschênes`, log };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    log.push(`Fatal error: ${errMsg}`);
    return { success: false, error: errMsg, log };
  } finally {
    await browser.close();
  }
}
