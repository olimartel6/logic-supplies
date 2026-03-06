import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult } from './lumen';
import type { PaymentInfo } from './lumen';
import type { Branch } from './canac';

export const GUILLEVIN_BRANCHES: Branch[] = [
  { name: 'Guillevin Montréal (St-Laurent)', address: '955 Rue Décarie, Saint-Laurent, QC',            lat: 45.5017, lng: -73.6800 },
  { name: 'Guillevin Laval',                 address: '2290 Boul. Ste-Rose, Laval, QC',                lat: 45.5756, lng: -73.7019 },
  { name: 'Guillevin Longueuil',             address: '800 Boul. Curé-Poirier E, Longueuil, QC',       lat: 45.5292, lng: -73.5100 },
  { name: 'Guillevin Québec',                address: '2800 Boul. Laurier, Québec, QC',                lat: 46.8100, lng: -71.2500 },
  { name: 'Guillevin Sherbrooke',            address: '3350 Boul. Industriel, Sherbrooke, QC',         lat: 45.3799, lng: -71.9000 },
  { name: 'Guillevin Gatineau',              address: '150 Boul. Saint-René E, Gatineau, QC',          lat: 45.4765, lng: -75.7013 },
  { name: 'Guillevin Trois-Rivières',        address: '3945 Rue des Forges, Trois-Rivières, QC',       lat: 46.3432, lng: -72.5477 },
  { name: 'Guillevin Drummondville',         address: '1420 Boul. Saint-Joseph, Drummondville, QC',    lat: 45.8747, lng: -72.4763 },
  { name: 'Guillevin Saint-Hyacinthe',       address: '6600 Boul. Laframboise, Saint-Hyacinthe, QC',  lat: 45.6285, lng: -72.9572 },
  { name: 'Guillevin Saguenay',              address: '2655 Boul. Talbot, Saguenay, QC',               lat: 48.4275, lng: -71.0543 },
];

async function createGuillevinPage(browser: any) {
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

// Guillevin login redirects to Shopify Customer Accounts (shopify.com/<id>/account).
// Shopify new accounts is a one-page-app — email first, then password.
// The form fields may be inside shadow DOM or rendered late by React/Shopify JS.
async function loginToGuillevin(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.guillevin.com/account/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Cloudflare Turnstile warmup — wait for challenge to resolve
  console.log('[Guillevin] Waiting for Cloudflare challenge to resolve...');
  for (let i = 0; i < 60; i++) {
    const title = await page.title().catch(() => '');
    const url = page.url();
    if (i % 5 === 0) console.log(`[Guillevin] Warmup t=${i * 2}s title="${title}" url=${url}`);
    // Challenge resolved when title changes from "Un instant…" / "Just a moment"
    const isChallenge = title.length < 5 || title.toLowerCase().includes('instant') || title.toLowerCase().includes('moment');
    if (!isChallenge) {
      console.log(`[Guillevin] Challenge resolved at t=${i * 2}s, title="${title}"`);
      break;
    }
    if (i === 59) {
      throw new Error('Cloudflare challenge non résolu après 2 minutes');
    }
    await page.waitForTimeout(2000);
  }
  // Extra wait for SPA render after challenge
  await page.waitForTimeout(4000);

  const currentUrl = page.url();
  console.log('[Guillevin] Page URL after warmup:', currentUrl);

  // Step 1: find email field — try multiple strategies
  // Strategy A: standard selectors (works if no shadow DOM)
  let emailField = page.locator([
    'input[name="email"]',
    'input[type="email"]',
    'input[id="email"]',
    'input[autocomplete="email"]',
    'input[autocomplete="username"]',
    'input#username',
    'input[name="username"]',
    'input[name="login"]',
  ].join(', ')).first();

  let found = await emailField.isVisible({ timeout: 5000 }).catch(() => false);

  // Strategy B: Shopify uses an iframe for login — check for it
  if (!found) {
    console.log('[Guillevin] No direct input found, checking for iframe...');
    const iframe = page.frameLocator('iframe').first();
    const iframeEmail = iframe.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
    found = await iframeEmail.isVisible({ timeout: 5000 }).catch(() => false);
    if (found) {
      emailField = iframeEmail;
      console.log('[Guillevin] Found email field inside iframe');
    }
  }

  // Strategy C: use page.evaluate to find inputs anywhere (including shadow DOM)
  if (!found) {
    console.log('[Guillevin] Trying shadow DOM / JS evaluation...');
    found = await page.evaluate(() => {
      // Search all shadow roots for an email input
      function findInShadow(root: Document | ShadowRoot): HTMLInputElement | null {
        const inputs = root.querySelectorAll('input[type="email"], input[name="email"], input[autocomplete="email"], input[type="text"]');
        for (const inp of inputs) if (inp instanceof HTMLInputElement) return inp;
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const found = findInShadow(el.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      }
      const inp = findInShadow(document);
      if (inp) { inp.focus(); return true; }
      return false;
    }).catch(() => false);

    if (found) {
      // The field is focused, use keyboard to type
      await page.keyboard.type(username, { delay: 60 });
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);

      // Now find password field the same way
      const pwdFound = await page.evaluate(() => {
        function findInShadow(root: Document | ShadowRoot): HTMLInputElement | null {
          const inputs = root.querySelectorAll('input[type="password"]');
          for (const inp of inputs) if (inp instanceof HTMLInputElement) return inp;
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) {
              const found = findInShadow(el.shadowRoot);
              if (found) return found;
            }
          }
          return null;
        }
        const inp = findInShadow(document);
        if (inp) { inp.focus(); return true; }
        return false;
      }).catch(() => false);

      if (pwdFound) {
        await page.keyboard.type(password, { delay: 60 });
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
      }

      await page.waitForTimeout(5000);
      const url = page.url();
      return url.includes('guillevin.com') && !url.includes('login');
    }
  }

  if (!found) {
    // Capture debug info and return it in the error
    const debugUrl = page.url();
    const html = await page.content().catch(() => '');
    const title = await page.title().catch(() => '');
    // Count all inputs and list their attributes
    const inputInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      return Array.from(inputs).map(i => ({
        type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, autocomplete: i.autocomplete
      }));
    }).catch(() => []);
    // Check for shadow DOM hosts
    const shadowHosts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*')).filter(el => el.shadowRoot).map(el => el.tagName.toLowerCase()).slice(0, 10);
    }).catch(() => []);
    // Check iframes
    const iframeCount = await page.evaluate(() => document.querySelectorAll('iframe').length).catch(() => 0);

    const debugMsg = [
      `URL: ${debugUrl}`,
      `Title: ${title}`,
      `Inputs found: ${JSON.stringify(inputInfo)}`,
      `Shadow DOM hosts: ${JSON.stringify(shadowHosts)}`,
      `Iframes: ${iframeCount}`,
      `HTML (first 1500): ${html.substring(0, 1500)}`,
    ].join('\n');
    console.log('[Guillevin] DEBUG:\n' + debugMsg);
    throw new Error('Login Guillevin — champ email introuvable.\nDebug:\n' + debugMsg);
  }

  // Standard flow (Strategy A or B found the field)
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  // Click "Continue" / "Continuer" if present (2-step Shopify flow)
  const continueBtn = page.locator([
    'button[type="submit"]:has-text("Continue")',
    'button[type="submit"]:has-text("Continuer")',
    'button:has-text("Continue")',
    'button:has-text("Continuer")',
    'button[type="submit"]',
  ].join(', ')).first();
  if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await continueBtn.click();
    await page.waitForTimeout(3000);
  }

  // Step 2: password field
  const passwordField = page.locator([
    'input[type="password"]',
    'input[name="password"]',
    'input#password',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 20000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => window.location.hostname.includes('guillevin.com'),
    { timeout: 30000 }
  ).catch(() => {});
  await page.waitForTimeout(3000);

  const url = page.url();
  return url.includes('guillevin.com') && !url.includes('login');
}

export async function testGuillevinConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const page = await createGuillevinPage(browser);
    const loggedIn = await loginToGuillevin(page, username, password);
    if (loggedIn) return { success: true };
    return { success: false, error: 'Identifiants Guillevin invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getGuillevinPrice(
  username: string,
  password: string,
  product: string
): Promise<number | null> {
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const page = await createGuillevinPage(browser);
    const loggedIn = await loginToGuillevin(page, username, password);
    if (!loggedIn) return null;

    // Use Shopify search
    await page.goto(
      `https://www.guillevin.com/search?type=product&q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    // Look for first price element on results page
    const priceEl = page.locator('[class*="price"]:not([class*="compare"])').first();
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

export async function placeGuillevinOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const page = await createGuillevinPage(browser);
    const loggedIn = await loginToGuillevin(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login Guillevin échoué' };

    // Search for product
    await page.goto(
      `https://www.guillevin.com/search?type=product&q=${encodeURIComponent(product)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    console.error(`[Guillevin] Searching for: ${product}`);
    await page.waitForTimeout(2000);

    // Click first product result
    const firstProduct = page.locator(
      'a[href*="/products/"], .product-card a, .card__heading a, h3 a'
    ).first();
    if (await firstProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstProduct.click();
      console.error(`[Guillevin] Navigating to product page`);
      await page.waitForTimeout(2000);

      // Set quantity if input is present
      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[class*="quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      // Add to cart
      const addToCartBtn = page.locator(
        'button[name="add"], button:has-text("Add to cart"), button:has-text("Ajouter au panier"), [data-add-to-cart]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[Guillevin] Added to cart: ${product}`);

        if (deliveryAddress && payment) {
          try {
            // Step 1: Navigate to cart
            console.error('[Guillevin] Step 1: Navigating to cart');
            await page.goto('https://www.guillevin.com/cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-cart.png' }).catch(() => {});

            // Step 2: Click checkout
            console.error('[Guillevin] Step 2: Clicking checkout');
            const checkoutBtn = page.locator('button[name="checkout"], input[name="checkout"], a[href*="checkout"]').first();
            if (await checkoutBtn.isVisible({ timeout: 8000 })) {
              await checkoutBtn.click();
              await page.waitForTimeout(5000);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-checkout.png' }).catch(() => {});
            console.error('[Guillevin] Checkout URL:', page.url());

            // Step 3: Fill shipping address
            console.error('[Guillevin] Step 3: Filling shipping address');
            const addressField = page.locator('#checkout_shipping_address_address1, input[name*="address1"], input[placeholder*="Address"]').first();
            if (await addressField.isVisible({ timeout: 8000 })) {
              await addressField.fill(deliveryAddress);
              console.error('[Guillevin] Address filled');
            } else {
              console.error('[Guillevin] No address field — may already be saved');
            }

            // Step 4: Continue to shipping
            console.error('[Guillevin] Step 4: Continue to shipping');
            const continueBtn = page.locator('#continue_button, button:has-text("Continue to shipping"), button:has-text("Continuer")').first();
            if (await continueBtn.isVisible({ timeout: 5000 })) {
              await continueBtn.click();
              await page.waitForTimeout(5000);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-shipping.png' }).catch(() => {});

            // Step 5: Continue to payment
            console.error('[Guillevin] Step 5: Continue to payment');
            const shippingContinue = page.locator('button:has-text("Continue to payment"), button:has-text("Continuer vers le paiement"), #continue_button').first();
            if (await shippingContinue.isVisible({ timeout: 5000 })) {
              await shippingContinue.click();
              await page.waitForTimeout(5000);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-payment.png' }).catch(() => {});
            console.error('[Guillevin] Payment URL:', page.url());

            // Step 6: Fill card details (Shopify iframes)
            console.error('[Guillevin] Step 6: Filling card details');
            const cardFrame = page.frameLocator('iframe[id*="card-fields-number"]').first();
            const cardInput = cardFrame.locator('input[placeholder*="Card number"], input[autocomplete="cc-number"], input').first();
            if (await cardInput.isVisible({ timeout: 8000 }).catch(() => false)) {
              await cardInput.fill(payment.cardNumber);
              console.error('[Guillevin] Card number filled');
              const expiryFrame = page.frameLocator('iframe[id*="card-fields-expiry"]').first();
              await expiryFrame.locator('input').first().fill(payment.cardExpiry);
              console.error('[Guillevin] Expiry filled');
              const cvvFrame = page.frameLocator('iframe[id*="card-fields-verification"]').first();
              await cvvFrame.locator('input').first().fill(payment.cardCvv);
              console.error('[Guillevin] CVV filled');
              // Name on card (some Shopify themes)
              const nameFrame = page.frameLocator('iframe[id*="card-fields-name"]').first();
              const nameInput = nameFrame.locator('input').first();
              if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await nameInput.fill(payment.cardHolder);
                console.error('[Guillevin] Card holder filled');
              }
            } else {
              console.error('[Guillevin] Card iframe not found — trying direct inputs');
              const directCard = page.locator('input[name*="card"], input[id*="card-number"]').first();
              if (await directCard.isVisible({ timeout: 3000 })) await directCard.fill(payment.cardNumber);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-card-filled.png' }).catch(() => {});

            // Step 7: Place order
            console.error('[Guillevin] Step 7: Placing order');
            const payBtn = page.locator('#continue_button, button:has-text("Pay now"), button:has-text("Complete order"), button:has-text("Payer maintenant")').first();
            if (await payBtn.isVisible({ timeout: 5000 })) {
              await payBtn.click();
              await page.waitForTimeout(10000);
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-confirmation.png' }).catch(() => {});
            console.error('[Guillevin] Final URL:', page.url());

            // Step 8: Capture order number
            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i);
            const orderId = orderMatch?.[1];
            console.error('[Guillevin] Order ID:', orderId || 'not found');
            if (!orderId) {
              const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
              console.error('[Guillevin] Page body snippet:', bodySnippet);
            }
            return { success: true, orderId };
          } catch (err: any) {
            console.error('[Guillevin] Checkout error:', err.message);
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-error.png' }).catch(() => {});
            return { success: false, inCart: true, error: `Checkout: ${err.message}` };
          }
        }

        return { success: false, inCart: true };
      }
    }

    console.error(`[Guillevin] Product not found: ${product}`);
    return { success: false, error: `Produit "${product}" introuvable sur Guillevin` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
