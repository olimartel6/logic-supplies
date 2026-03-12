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

    // Auto-accept Didomi cookie consent before SDK loads
    const w = window as any;
    w.didomiConfig = w.didomiConfig || {};
    w.didomiConfig.user = { externalConsent: { value: 'all', type: 'all' } };
    w.didomiOnReady = w.didomiOnReady || [];
    w.didomiOnReady.push(function(Didomi: any) {
      try { Didomi.setUserAgreeToAll(); } catch {}
    });
  });

  // Pre-set Didomi consent cookie so popup never shows
  await context.addCookies([{
    name: 'didomi_token',
    value: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpYXQiOjE3MTAwMDAwMDAsImV4cCI6MTgwMDAwMDAwMCwidmVuZG9ycyI6eyJlbmFibGVkIjpbXX0sInB1cnBvc2VzIjp7ImVuYWJsZWQiOltdfSwidmVyc2lvbiI6Mn0',
    domain: '.guillevin.com',
    path: '/',
  }]);

  return context.newPage();
}

// Handle the "Select your region" popup that appears on guillevin.com pages after login.
// The popup has: title "Select your region", a <select> dropdown, and an orange "Start Shopping" button.
async function handleRegionPopup(page: any): Promise<void> {
  try {
    // Check if the region popup is visible (look for the title or the "Start Shopping" button)
    const popupVisible = await page.locator('text="Select your region"').first()
      .isVisible({ timeout: 5000 }).catch(() => false)
      || await page.locator('button:has-text("Start Shopping")').first()
        .isVisible({ timeout: 2000 }).catch(() => false);

    if (!popupVisible) {
      console.error('[Guillevin] No region popup detected');
      return;
    }
    console.error('[Guillevin] Region popup detected');
    await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-region-before.png' }).catch(() => {});
    await page.waitForTimeout(1000);

    // Strategy 1: Use page.evaluate to directly set the <select> value via JS
    // This is the most reliable approach since it bypasses any custom styling issues
    const jsResult = await page.evaluate(() => {
      // Find all <select> elements and look for one with region options
      const selects = document.querySelectorAll('select');
      for (const sel of selects) {
        const options = Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
        const qcOption = options.find(o =>
          o.text.toLowerCase().includes('québec') || o.text.toLowerCase().includes('quebec')
          || o.value.toLowerCase().includes('québec') || o.value.toLowerCase().includes('quebec')
        );
        if (qcOption) {
          sel.value = qcOption.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return { found: true, value: qcOption.value, text: qcOption.text, allOptions: options };
        }
      }
      // Dump info for debugging
      const allSelects = Array.from(selects).map(s => ({
        id: s.id, name: s.name, className: s.className,
        options: Array.from(s.options).map(o => o.text)
      }));
      return { found: false, selects: allSelects };
    }).catch(() => ({ found: false, error: 'evaluate failed' }));

    console.error('[Guillevin] JS select result:', JSON.stringify(jsResult));

    if (!jsResult.found) {
      // Strategy 2: Try Playwright's selectOption on any visible <select>
      const allSelects = page.locator('select');
      const count = await allSelects.count().catch(() => 0);
      console.error(`[Guillevin] Found ${count} <select> elements`);
      for (let i = 0; i < count; i++) {
        try {
          const sel = allSelects.nth(i);
          if (await sel.isVisible().catch(() => false)) {
            // Log this select's options
            const opts = await sel.locator('option').allTextContents().catch(() => []);
            console.error(`[Guillevin] Select[${i}] options:`, opts);
            const hasQc = opts.some((o: string) => o.toLowerCase().includes('québec') || o.toLowerCase().includes('quebec'));
            if (hasQc) {
              const qcLabel = opts.find((o: string) => o.toLowerCase().includes('québec') || o.toLowerCase().includes('quebec'));
              await sel.selectOption({ label: qcLabel! });
              console.error(`[Guillevin] Selected "${qcLabel}" via Playwright selectOption`);
              break;
            }
          }
        } catch (err: any) {
          console.error(`[Guillevin] Select[${i}] error:`, err.message);
        }
      }

      // Strategy 3: If no <select> found, dump modal HTML for debugging
      if (count === 0) {
        const html = await page.evaluate(() => {
          const el = document.querySelector('[class*="modal"], [class*="popup"], [role="dialog"]')
            || document.querySelector('[class*="region"]');
          return el ? el.outerHTML.slice(0, 3000) : 'No modal found';
        }).catch(() => 'evaluate failed');
        console.error('[Guillevin] Modal HTML for debugging:', html);
      }
    }

    await page.waitForTimeout(500);

    // Click "Start Shopping" button
    const startBtn = page.locator('button:has-text("Start Shopping")').first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click();
      console.error('[Guillevin] Clicked Start Shopping');
      await page.waitForTimeout(2000);
    } else {
      // Fallback: any nearby submit/confirm button
      const fallbackBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Confirm"), button:has-text("Continuer")').first();
      if (await fallbackBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await fallbackBtn.click();
        console.error('[Guillevin] Clicked fallback confirm button');
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-region-after.png' }).catch(() => {});
    console.error('[Guillevin] Region popup handled');
  } catch (err: any) {
    console.error('[Guillevin] Region popup handling error:', err.message);
  }
}

// Guillevin login redirects to Auth0 (gic.ca.auth0.com).
// Single-page form with email + password fields both visible.
async function loginToGuillevin(page: any, username: string, password: string): Promise<boolean> {
  // Step 1: Navigate to login page
  await page.goto('https://www.guillevin.com/account/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Cloudflare warmup — wait for challenge to resolve (if any)
  for (let i = 0; i < 60; i++) {
    const title = await page.title().catch(() => '');
    const isChallenge = title.length < 5 || title.toLowerCase().includes('instant') || title.toLowerCase().includes('moment');
    if (!isChallenge) {
      console.error(`[Guillevin] Page ready at t=${i * 2}s — title="${title}"`);
      break;
    }
    if (i === 59) throw new Error('Cloudflare challenge non résolu après 2 minutes');
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);

  console.error('[Guillevin] Login URL:', page.url());

  // Step 2: Auth0 login form: input#username (email) + input#password
  const emailField = page.locator('input#username').first();
  await emailField.waitFor({ state: 'visible', timeout: 15000 });
  await emailField.click();
  await emailField.fill(username);
  console.log('[Guillevin] Email filled');

  const passwordField = page.locator('input#password').first();
  await passwordField.waitFor({ state: 'visible', timeout: 5000 });
  await passwordField.click();
  await passwordField.fill(password);
  console.log('[Guillevin] Password filled');

  // Click "Continuer" submit button
  const submitBtn = page.locator('button:has-text("Continuer"), button:has-text("Continue"), button[type="submit"]').first();
  await submitBtn.click();
  console.log('[Guillevin] Submit clicked, waiting for redirect...');

  // Wait for redirect away from Auth0 (goes to guillevin.com or shopify.com/60111716441)
  const redirected = await page.waitForFunction(
    () => !window.location.hostname.includes('auth0.com'),
    { timeout: 30000 }
  ).then(() => true).catch(() => false);

  if (!redirected) {
    const afterUrl = page.url();
    const errorText = await page.locator('[id*="error"], [class*="error"], [role="alert"]').first()
      .textContent({ timeout: 2000 }).catch(() => '');
    console.error(`[Guillevin] Login failed — URL: ${afterUrl}, error: ${errorText}`);
    await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-login-fail.png' }).catch(() => {});
    throw new Error(
      errorText?.trim()
        ? `Guillevin: ${errorText.trim()}`
        : `Identifiants Guillevin invalides (URL: ${afterUrl.slice(0, 100)})`
    );
  }

  await page.waitForTimeout(3000);
  const url = page.url();
  console.error('[Guillevin] Final URL:', url);
  // Success if redirected to guillevin.com or Shopify account (shop 60111716441)
  // Check for /login or /u/login path — but NOT new_login query param
  const isLoginPage = url.includes('/u/login') || url.includes('/account/login') || url.match(/\/login(?:\?|$)/);
  const success = (url.includes('guillevin.com') || url.includes('shopify.com/60111716441')) && !isLoginPage;
  if (!success) {
    console.error(`[Guillevin] Login check failed — url=${url}, isLoginPage=${isLoginPage}`);
    await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-login-check.png' }).catch(() => {});
    return false;
  }

  // Step 3: Accept cookie consent (Didomi API) — appears after login redirect
  try {
    await page.evaluate(() => {
      if ((window as any).Didomi) {
        (window as any).Didomi.setUserAgreeToAll();
      }
    });
    console.error('[Guillevin] Cookie consent accepted via Didomi API');
    await page.waitForTimeout(2000);
  } catch {
    // Fallback: try clicking the button directly
    try {
      const cookieBtn = page.locator('#didomi-notice-agree-button, button:has-text("Accepter"), button:has-text("Accept")').first();
      if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cookieBtn.click();
        console.error('[Guillevin] Cookie consent accepted via button click');
        await page.waitForTimeout(2000);
      }
    } catch {}
  }

  // Step 4: Handle region popup (if it appears here)
  await page.waitForTimeout(2000);
  await handleRegionPopup(page);

  return true;
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

    // Use Shopify JSON search API (server-side fetch)
    const searchQuery = product.replace(/"/g, '');
    try {
      const apiUrl = `https://www.guillevin.com/search/suggest.json?q=${encodeURIComponent(searchQuery)}&resources[type]=product&resources[limit]=3`;
      const resp = await fetch(apiUrl);
      const data = await resp.json();
      const products = data?.resources?.results?.products;
      if (products && products.length > 0) {
        const match = products[0];
        const priceStr = match.price;
        if (priceStr) {
          const price = parseFloat(priceStr) / 100; // Shopify prices in cents
          if (price > 0) return price;
        }
        // If API price is 0 (B2B), navigate to product page to get price
        if (match.url) {
          await page.goto(`https://www.guillevin.com${match.url}`, {
            waitUntil: 'domcontentloaded', timeout: 30000,
          });
          await page.waitForTimeout(3000);
          const priceEl = page.locator('[class*="price"]:not([class*="compare"])').first();
          if (await priceEl.isVisible({ timeout: 3000 }).catch(() => false)) {
            const text = await priceEl.textContent().catch(() => '');
            const priceMatch = text?.match(/[\d]+[.,][\d]{2}/);
            if (priceMatch) return parseFloat(priceMatch[0].replace(',', '.'));
          }
        }
      }
    } catch {}
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
  const log: string[] = [];
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    log.push('Initializing browser and logging in');
    const page = await createGuillevinPage(browser);
    const loggedIn = await loginToGuillevin(page, username, password);
    if (!loggedIn) {
      log.push('Login failed');
      return { success: false, error: 'Login Guillevin échoué', log };
    }
    log.push('Login successful');

    // Build search queries: try SKU first, then variations of the product name
    const searchQueries: string[] = [];
    try {
      const { getDb } = await import('./db');
      const row = (
        getDb().prepare("SELECT sku FROM products WHERE name = ? AND supplier = 'guillevin' LIMIT 1").get(product) ||
        getDb().prepare("SELECT sku FROM products WHERE name = ? LIMIT 1").get(product)
      ) as { sku: string } | undefined;
      if (row?.sku) searchQueries.push(row.sku.split('/')[0]);
    } catch {}
    // Add the full product name (without trailing quotes)
    searchQueries.push(product.replace(/"/g, ''));
    // Add simplified versions: extract model/size terms
    const words = product.replace(/"/g, '').split(/\s+/);
    const modelWord = words.find(w => /\d/.test(w) && w.length >= 3);
    if (modelWord) {
      const idx = words.indexOf(modelWord);
      const prefix = idx > 0 ? words[idx - 1] + ' ' : '';
      searchQueries.push(prefix + modelWord);
    }
    if (words.length > 2) searchQueries.push(words.slice(0, 3).join(' '));
    const uniqueQueries = [...new Set(searchQueries)];

    // Use Shopify JSON search API (server-side fetch — no browser needed for search)
    let productUrl: string | null = null;
    for (const searchQuery of uniqueQueries) {
      log.push(`Searching via API: ${searchQuery}`);
      console.error(`[Guillevin] Searching via API: ${searchQuery}`);
      try {
        const apiUrl = `https://www.guillevin.com/search/suggest.json?q=${encodeURIComponent(searchQuery)}&resources[type]=product&resources[limit]=5`;
        const resp = await fetch(apiUrl);
        const data = await resp.json();
        const results = data?.resources?.results?.products;
        if (results && results.length > 0) {
          // Try to find exact match first (strip quotes for comparison), then take first result
          const normalize = (s: string) => s.replace(/"/g, '').trim().toLowerCase();
          const exact = results.find((p: any) =>
            normalize(p.title) === normalize(searchQuery)
          );
          const match = exact || results[0];
          productUrl = match.url;
          log.push(`Product found: "${match.title}" → ${productUrl}`);
          console.error(`[Guillevin] Found: "${match.title}" → ${productUrl}`);
          break;
        }
        log.push(`No API results for: ${searchQuery}`);
      } catch (err: any) {
        log.push(`API search error: ${err.message}`);
        console.error(`[Guillevin] API search error:`, err.message);
      }
    }

    if (productUrl) {
      // Navigate directly to product page
      log.push(`Navigating to product page: ${productUrl}`);
      await page.goto(`https://www.guillevin.com${productUrl}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      console.error(`[Guillevin] Navigating to: ${productUrl}`);
      await page.waitForTimeout(3000);

      // Handle region popup (appears on product pages)
      await handleRegionPopup(page);
      await page.waitForTimeout(1000);

      // Set quantity if input is present
      const qtyInput = page.locator(
        'input[name="quantity"], input[id*="quantity"], input[class*="quantity"]'
      ).first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
        log.push(`Quantity set to ${quantity}`);
      }

      // Add to cart
      const addToCartBtn = page.locator(
        'button[name="add"], button:has-text("Add to cart"), button:has-text("Ajouter au panier"), [data-add-to-cart]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[Guillevin] Added to cart: ${product}`);
        log.push(`Added to cart: ${product}`);

        if (deliveryAddress && payment) {
          try {
            // Step 1: Navigate to cart
            log.push('Step 1: Navigating to cart');
            console.error('[Guillevin] Step 1: Navigating to cart');
            await page.goto('https://www.guillevin.com/cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-cart.png' }).catch(() => {});

            // Step 2: Click checkout
            log.push('Step 2: Clicking checkout button');
            console.error('[Guillevin] Step 2: Clicking checkout');
            const checkoutBtn = page.locator('button[name="checkout"], input[name="checkout"], a[href*="checkout"]').first();
            if (await checkoutBtn.isVisible({ timeout: 8000 })) {
              await checkoutBtn.click();
              await page.waitForTimeout(5000);
              log.push('Checkout button clicked, waiting for checkout page');
            } else {
              log.push('Checkout button not found');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-checkout.png' }).catch(() => {});
            log.push(`Checkout URL: ${page.url()}`);
            console.error('[Guillevin] Checkout URL:', page.url());

            // Step 3: Fill shipping address
            log.push('Step 3: Filling shipping address');
            console.error('[Guillevin] Step 3: Filling shipping address');
            await page.waitForTimeout(2000);
            const addressField = page.locator('#checkout_shipping_address_address1, input[name*="address1"], input[placeholder*="Address"]').first();
            if (await addressField.isVisible({ timeout: 8000 })) {
              await addressField.fill(deliveryAddress);
              console.error('[Guillevin] Address filled');
              log.push(`Address filled: ${deliveryAddress}`);
            } else {
              console.error('[Guillevin] No address field — may already be saved');
              log.push('No address field visible — may already be saved');
            }

            // Step 4: Continue to shipping
            log.push('Step 4: Continue to shipping');
            console.error('[Guillevin] Step 4: Continue to shipping');
            await page.waitForTimeout(2000);
            const continueBtn = page.locator('#continue_button, button:has-text("Continue to shipping"), button:has-text("Continuer")').first();
            if (await continueBtn.isVisible({ timeout: 5000 })) {
              await continueBtn.click();
              await page.waitForTimeout(5000);
              log.push('Continued to shipping step');
            } else {
              log.push('Continue button not found at address step');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-shipping.png' }).catch(() => {});

            // Step 5: Continue to payment
            log.push('Step 5: Continue to payment');
            console.error('[Guillevin] Step 5: Continue to payment');
            await page.waitForTimeout(2000);
            const shippingContinue = page.locator('button:has-text("Continue to payment"), button:has-text("Continuer vers le paiement"), #continue_button').first();
            if (await shippingContinue.isVisible({ timeout: 5000 })) {
              await shippingContinue.click();
              await page.waitForTimeout(5000);
              log.push('Continued to payment step');
            } else {
              log.push('Continue button not found at shipping step');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-payment.png' }).catch(() => {});
            log.push(`Payment URL: ${page.url()}`);
            console.error('[Guillevin] Payment URL:', page.url());

            // Step 6: Fill card details (Shopify iframes)
            log.push('Step 6: Filling card details (Shopify iframes)');
            console.error('[Guillevin] Step 6: Filling card details');
            await page.waitForTimeout(2000);
            const cardFrame = page.frameLocator('iframe[id*="card-fields-number"]').first();
            const cardInput = cardFrame.locator('input[placeholder*="Card number"], input[autocomplete="cc-number"], input').first();
            if (await cardInput.isVisible({ timeout: 8000 }).catch(() => false)) {
              await cardInput.fill(payment.cardNumber);
              console.error('[Guillevin] Card number filled');
              log.push('Card number filled');

              await page.waitForTimeout(500);
              const expiryFrame = page.frameLocator('iframe[id*="card-fields-expiry"]').first();
              await expiryFrame.locator('input').first().fill(payment.cardExpiry);
              console.error('[Guillevin] Expiry filled');
              log.push('Expiry filled');

              await page.waitForTimeout(500);
              const cvvFrame = page.frameLocator('iframe[id*="card-fields-verification"]').first();
              await cvvFrame.locator('input').first().fill(payment.cardCvv);
              console.error('[Guillevin] CVV filled');
              log.push('CVV filled');

              // Name on card (some Shopify themes)
              const nameFrame = page.frameLocator('iframe[id*="card-fields-name"]').first();
              const nameInput = nameFrame.locator('input').first();
              if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await nameInput.fill(payment.cardHolder);
                console.error('[Guillevin] Card holder filled');
                log.push('Card holder name filled');
              }
            } else {
              log.push('Card iframe not found — trying direct inputs');
              console.error('[Guillevin] Card iframe not found — trying direct inputs');
              const directCard = page.locator('input[name*="card"], input[id*="card-number"]').first();
              if (await directCard.isVisible({ timeout: 3000 })) {
                await directCard.fill(payment.cardNumber);
                log.push('Direct card input filled');
              } else {
                log.push('No card input found (neither iframe nor direct)');
              }
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-card-filled.png' }).catch(() => {});

            // Step 7: Place order
            log.push('Step 7: Placing order');
            console.error('[Guillevin] Step 7: Placing order');
            await page.waitForTimeout(2000);
            const payBtn = page.locator('#continue_button, button:has-text("Pay now"), button:has-text("Complete order"), button:has-text("Payer maintenant")').first();
            if (await payBtn.isVisible({ timeout: 5000 })) {
              await payBtn.click();
              log.push('Pay button clicked, waiting for confirmation');
              await page.waitForTimeout(10000);
            } else {
              log.push('Pay button not found');
            }
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-confirmation.png' }).catch(() => {});
            log.push(`Final URL: ${page.url()}`);
            console.error('[Guillevin] Final URL:', page.url());

            // Step 8: Capture order number
            log.push('Step 8: Capturing order number');
            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
              || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i);
            const orderId = orderMatch?.[1];
            console.error('[Guillevin] Order ID:', orderId || 'not found');
            if (!orderId) {
              const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
              console.error('[Guillevin] Page body snippet:', bodySnippet);
              log.push(`Order ID not found. Page snippet: ${bodySnippet.slice(0, 200)}`);
            } else {
              log.push(`Order confirmed: ${orderId}`);
            }
            if (!orderId) {
              return { success: false, inCart: true, error: 'Commande soumise mais pas de numéro de confirmation', log };
            }
            return { success: true, orderId, log };
          } catch (err: any) {
            const errorMsg = err.message || String(err);
            console.error('[Guillevin] Checkout error:', errorMsg);
            log.push(`Checkout error: ${errorMsg}`);
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-error.png' }).catch(() => {});
            return { success: false, inCart: true, error: `Checkout échoué à l'étape: ${errorMsg}`, log };
          }
        }

        return { success: false, inCart: true, log };
      }
    }

    console.error(`[Guillevin] Product not found: ${product}`);
    log.push(`Product not found: ${product}`);
    return { success: false, error: `Produit "${product}" introuvable sur Guillevin`, log };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    log.push(`Fatal error: ${errorMsg}`);
    return { success: false, error: errorMsg, log };
  } finally {
    await browser.close();
  }
}
