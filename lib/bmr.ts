import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult, PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const BMR_BRANCHES: Branch[] = [
  { name: 'BMR Montréal (St-Léonard)', address: '5500 Rue Jarry E, Montréal, QC',             lat: 45.5942, lng: -73.5590 },
  { name: 'BMR Laval',                 address: '4475 Autoroute 440 O, Laval, QC',             lat: 45.5700, lng: -73.7600 },
  { name: 'BMR Longueuil',             address: '3640 Chemin Chambly, Longueuil, QC',          lat: 45.5155, lng: -73.4856 },
  { name: 'BMR Québec',                address: '2625 Boul. Wilfrid-Hamel, Québec, QC',        lat: 46.8108, lng: -71.3250 },
  { name: 'BMR Sherbrooke',            address: '4200 Boul. Portland, Sherbrooke, QC',         lat: 45.4025, lng: -71.8929 },
  { name: 'BMR Gatineau',              address: '820 Boul. Maloney E, Gatineau, QC',            lat: 45.4620, lng: -75.7050 },
  { name: 'BMR Trois-Rivières',        address: '4525 Boul. Jean-XXIII, Trois-Rivières, QC',   lat: 46.3400, lng: -72.5850 },
  { name: 'BMR Drummondville',         address: '1495 Boul. Lemire, Drummondville, QC',        lat: 45.8747, lng: -72.4900 },
];

async function createBmrPage(browser: any) {
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

async function loginToBmr(page: any, username: string, password: string): Promise<boolean> {
  // Use networkidle so reCAPTCHA and Axeptio scripts are fully loaded before we interact
  await page.goto('https://www.bmr.ca/fr/customer/account/login/', {
    waitUntil: 'networkidle', timeout: 40000,
  }).catch(() => page.goto('https://www.bmr.ca/fr/customer/account/login/', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  }));
  await page.waitForTimeout(3000);

  // BMR uses Axeptio for cookie consent (not OneTrust)
  const cookieBtn = page.locator([
    '#axeptio_btn_acceptAll',
    '.axeptio-btn-accept',
    'button:has-text("D\'accord")',
    'button:has-text("Tout accepter")',
    'button:has-text("Accepter tout")',
    'button:has-text("Accept all")',
  ].join(', ')).first();
  if (await cookieBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(800);
  }

  const emailField = page.locator([
    'input#email',
    'input[name="login[username]"]',
    'input[autocomplete="email"]',
    'input[type="email"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  const passwordField = page.locator([
    'input#pass',
    'input[name="login[password]"]',
    'input[autocomplete="current-password"]',
    'input[type="password"]',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(500);

  // Click submit button explicitly — required to trigger invisible reCAPTCHA
  const submitBtn = page.locator([
    'button:has-text("Connexion")',
    'button[type="submit"]#send2',
    'button[type="submit"].action.login',
    'button[type="submit"]',
  ].join(', ')).first();
  if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await submitBtn.click();
  } else {
    await passwordField.press('Enter');
  }

  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 25000 }
  ).catch(() => {});
  await page.waitForTimeout(2000);

  const url = page.url();
  return !url.includes('/login') && url.includes('bmr.ca');
}

export async function testBmrConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createBmrPage(browser);
    const loggedIn = await loginToBmr(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants BMR invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getBmrPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createBmrPage(browser);
    const loggedIn = await loginToBmr(page, username, password);
    if (!loggedIn) return null;

    await page.goto(
      `https://www.bmr.ca/fr/search/?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    const priceEl = page.locator('.price .price, [data-price-type="finalPrice"] .price, .price-wrapper .price').first();
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

export async function placeBmrOrder(
  username: string, password: string, product: string, quantity: number,
  deliveryAddress?: string, payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const log: string[] = [];
  const browser = await createBrowserbaseBrowser();
  try {
    log.push('Creating browser page');
    const page = await createBmrPage(browser);

    log.push('Logging in to BMR');
    const loggedIn = await loginToBmr(page, username, password);
    if (!loggedIn) {
      log.push('Login failed');
      return { success: false, error: 'Login BMR échoué', log };
    }
    log.push('Login successful');

    log.push(`Searching for product: ${product}`);
    await page.goto(
      `https://www.bmr.ca/fr/search/?q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[BMR] Searching for: ${product}`);
    await page.waitForTimeout(2000);

    const firstProduct = page.locator(
      'a.product-item-link, .product-name a, h3 a[href*="/fr/"]'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      log.push('Found product, clicking');
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator('input#qty, input[name="qty"], input[title*="qty"]').first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.push(`Setting quantity to ${quantity}`);
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button#product-addtocart-button, button:has-text("Ajouter au panier"), button[class*="tocart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        log.push('Clicking add to cart');
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        log.push('Added to cart');
        console.error(`[BMR] Added to cart: ${product}`);

        // ── Checkout automatique si adresse et paiement fournis ──
        if (deliveryAddress && payment) {
          try {
            // Step 1: Navigate to cart (Magento)
            log.push('Step 1: Navigating to cart');
            console.error('[BMR] Step 1: Navigating to cart');
            await page.goto('https://www.bmr.ca/fr/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: process.cwd() + '/public/debug-bmr-cart.png' }).catch(() => {});
            log.push(`Cart URL: ${page.url()}`);
            console.error('[BMR] Cart URL:', page.url());

            // Step 2: Click checkout (Magento: "Passer à la caisse")
            log.push('Step 2: Clicking checkout button');
            console.error('[BMR] Step 2: Clicking checkout');
            const checkoutBtn = page.locator('button:has-text("Passer à la caisse"), button:has-text("Proceed to Checkout"), button[data-role="proceed-to-checkout"], a[href*="checkout"]').first();
            await checkoutBtn.click({ timeout: 10000 });
            await page.waitForTimeout(5000);
            await page.screenshot({ path: process.cwd() + '/public/debug-bmr-checkout.png' }).catch(() => {});
            log.push(`Checkout URL: ${page.url()}`);
            console.error('[BMR] Checkout URL:', page.url());

            // Step 3: Fill shipping address (Magento checkout)
            log.push('Step 3: Filling shipping address');
            console.error('[BMR] Step 3: Filling shipping address');
            const streetField = page.locator('input[name="street[0]"], input[name*="street"], input[id*="street"]').first();
            if (await streetField.isVisible({ timeout: 8000 })) {
              await streetField.fill(deliveryAddress);
              log.push('Address filled');
              console.error('[BMR] Address filled');
            } else {
              log.push('No street field visible — may already be saved');
              console.error('[BMR] No street field — may already be saved or different layout');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-bmr-address.png' }).catch(() => {});

            // Step 4: Select shipping method and continue
            log.push('Step 4: Selecting shipping method and continuing to payment');
            console.error('[BMR] Step 4: Continue to payment');
            const shippingMethodRadio = page.locator('input[type="radio"][name="ko_unique_1"], input[type="radio"][name*="shipping"]').first();
            if (await shippingMethodRadio.isVisible({ timeout: 3000 }).catch(() => false)) {
              await shippingMethodRadio.click();
              await page.waitForTimeout(1000);
              log.push('Shipping method selected');
            }
            const nextBtn = page.locator('button:has-text("Suivant"), button:has-text("Next"), button[data-role="opc-continue"]').first();
            if (await nextBtn.isVisible({ timeout: 5000 })) {
              await nextBtn.click();
              await page.waitForTimeout(5000);
              log.push('Clicked next/continue button');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-bmr-payment.png' }).catch(() => {});
            log.push(`Payment step URL: ${page.url()}`);
            console.error('[BMR] Payment step URL:', page.url());

            // Step 5: Fill card details (Magento — may use iframe or direct fields)
            log.push('Step 5: Filling card details');
            console.error('[BMR] Step 5: Filling card details');
            await page.waitForTimeout(2000);
            // Try Magento's Braintree/Moneris iframe
            const cardFrame = page.frameLocator('iframe[id*="braintree"], iframe[title*="Card"], iframe[id*="card"]').first();
            const iframeCardInput = cardFrame.locator('input[name*="number"], input[autocomplete="cc-number"], input').first();
            if (await iframeCardInput.isVisible({ timeout: 5000 }).catch(() => false)) {
              log.push('Card in iframe — filling');
              console.error('[BMR] Card in iframe — filling');
              await iframeCardInput.fill(payment.cardNumber);
              // Fill cardholder name in iframe
              const iframeName = cardFrame.locator('input[name*="name"], input[id*="name"], input[autocomplete="cc-name"]').first();
              if (await iframeName.isVisible({ timeout: 2000 }).catch(() => false)) {
                await iframeName.fill(payment.cardHolder);
                log.push('Cardholder name filled (iframe)');
              }
              const iframeExpiry = cardFrame.locator('input[name*="exp"], input[placeholder*="MM"]').first();
              if (await iframeExpiry.isVisible({ timeout: 2000 }).catch(() => false)) await iframeExpiry.fill(payment.cardExpiry);
              const iframeCvv = cardFrame.locator('input[name*="cvv"], input[name*="cvc"]').first();
              if (await iframeCvv.isVisible({ timeout: 2000 }).catch(() => false)) await iframeCvv.fill(payment.cardCvv);
              log.push('Card details filled (iframe)');
            } else {
              log.push('Card direct input — filling');
              console.error('[BMR] Card direct input — filling');
              const ccNumber = page.locator('input[id*="cc_number"], input[name*="cc_number"], input[id*="credit-card-number"], input[autocomplete="cc-number"]').first();
              if (await ccNumber.isVisible({ timeout: 5000 })) {
                await ccNumber.fill(payment.cardNumber);
                log.push('Card number filled');
              }
              // Fill cardholder name (direct)
              const ccName = page.locator('input[name*="name"], input[id*="name"], input[autocomplete="cc-name"]').first();
              if (await ccName.isVisible({ timeout: 2000 }).catch(() => false)) {
                await ccName.fill(payment.cardHolder);
                log.push('Cardholder name filled');
              }
              const ccExpMonth = page.locator('select[id*="cc_exp_month"], select[name*="cc_exp_month"]').first();
              if (await ccExpMonth.isVisible({ timeout: 3000 })) {
                const [month] = payment.cardExpiry.split('/');
                await ccExpMonth.selectOption(month.trim());
                log.push('Expiry month selected');
              }
              const ccExpYear = page.locator('select[id*="cc_exp_year"], select[name*="cc_exp_year"]').first();
              if (await ccExpYear.isVisible({ timeout: 3000 })) {
                const [, year] = payment.cardExpiry.split('/');
                await ccExpYear.selectOption(`20${year.trim()}`);
                log.push('Expiry year selected');
              }
              const ccCvv = page.locator('input[id*="cc_cid"], input[name*="cc_cid"], input[autocomplete="cc-csc"]').first();
              if (await ccCvv.isVisible({ timeout: 3000 })) {
                await ccCvv.fill(payment.cardCvv);
                log.push('CVV filled');
              }
              log.push('Card details filled (direct)');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-bmr-card-filled.png' }).catch(() => {});

            // Step 6: Place order
            log.push('Step 6: Placing order');
            console.error('[BMR] Step 6: Placing order');
            await page.waitForTimeout(2000);
            const placeOrderBtn = page.locator('button:has-text("Passer la commande"), button:has-text("Place Order"), button[title="Passer la commande"]').first();
            if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
              await placeOrderBtn.click();
              await page.waitForTimeout(10000);
              log.push('Place order button clicked, waiting for confirmation');
            } else {
              log.push('Place order button not visible');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-bmr-confirmation.png' }).catch(() => {});
            log.push(`Final URL: ${page.url()}`);
            console.error('[BMR] Final URL:', page.url());

            // Step 7: Capture order number
            log.push('Step 7: Capturing order number');
            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/numéro\s*:\s*([A-Z0-9-]{5,20})/i);
            const orderId = orderMatch?.[1];
            console.error('[BMR] Order ID:', orderId || 'not found');
            if (orderId) {
              log.push(`Order confirmed: ${orderId}`);
            } else {
              const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
              log.push(`Order ID not found. Page snippet: ${bodySnippet}`);
              console.error('[BMR] Page body snippet:', bodySnippet);
            }
            return { success: true, orderId, log };
          } catch (checkoutErr: any) {
            const errMsg = checkoutErr?.message || String(checkoutErr);
            log.push(`Checkout error: ${errMsg}`);
            console.error('[BMR] Checkout error:', errMsg);
            await page.screenshot({ path: process.cwd() + '/public/debug-bmr-error.png' }).catch(() => {});
            return { success: false, inCart: true, error: `Checkout: ${errMsg}`, log };
          }
        }

        return { success: false, inCart: true, log };
      }
    }

    log.push(`Product "${product}" not found on BMR`);
    return { success: false, error: `Produit "${product}" introuvable sur BMR`, log };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    log.push(`Fatal error: ${errMsg}`);
    return { success: false, error: errMsg, log };
  } finally {
    await browser.close();
  }
}
