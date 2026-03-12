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
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-address-before.png' }).catch(() => {});

            // Dump checkout page structure for debugging — include in log so it's visible in debug-orders
            const checkoutInfo = await page.evaluate(() => {
              const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
                tag: i.tagName, id: i.id, name: (i as any).name, type: (i as any).type,
                placeholder: (i as any).placeholder, className: i.className?.slice(0, 60),
                value: (i as any).value?.slice(0, 30),
              }));
              const clickables = Array.from(document.querySelectorAll('a, button, [role="button"], [class*="dropdown"], [class*="select"]')).slice(0, 30).map(el => ({
                tag: el.tagName, text: el.textContent?.trim()?.slice(0, 60),
                className: el.className?.slice(0, 60),
                href: (el as HTMLAnchorElement).href?.slice(0, 80),
              }));
              const selects = Array.from(document.querySelectorAll('select')).map(s => ({
                id: s.id, name: s.name, options: Array.from(s.options).map(o => o.text?.slice(0, 40)),
              }));
              // Get main content HTML snippet for address section
              const addressSection = document.querySelector('[class*="address"], [data-address], [class*="shipping"], #shipping')?.outerHTML?.slice(0, 2000) || '';
              return { url: location.href, inputs, clickables, selects, addressSection };
            }).catch(() => ({}));
            console.error('[Guillevin] Checkout page info:', JSON.stringify(checkoutInfo));
            log.push(`Checkout DOM: selects=${JSON.stringify((checkoutInfo as any).selects || [])}`);
            log.push(`Checkout inputs: ${JSON.stringify((checkoutInfo as any).inputs?.slice(0, 10) || [])}`);
            log.push(`Address HTML: ${((checkoutInfo as any).addressSection || 'none').slice(0, 500)}`);

            // Guillevin uses Shopify ONE-PAGE checkout — all sections visible at once
            // "Ship to:" has a dropdown arrow (▼) to change address
            let addressHandled = false;

            // Debug: dump the "Ship to" section structure
            const shipToDebug = await page.evaluate(() => {
              const body = document.body.innerHTML;
              // Find the "Ship to" section
              const shipToMatch = body.match(/Ship to[\s\S]{0,3000}/i);
              const shipToHtml = shipToMatch ? shipToMatch[0].slice(0, 1500) : '';
              // Find all selects on page
              const selects = Array.from(document.querySelectorAll('select')).map(s => ({
                id: s.id, name: s.name,
                className: s.className?.toString()?.slice(0, 80),
                options: Array.from(s.options).map(o => ({ text: o.text?.slice(0, 60), value: o.value?.slice(0, 40) })),
              }));
              // Find details/summary elements (Shopify uses these for collapsible sections)
              const details = Array.from(document.querySelectorAll('details, summary, [role="combobox"], [role="listbox"]')).map(el => ({
                tag: el.tagName, id: el.id, className: el.className?.toString()?.slice(0, 80),
                text: el.textContent?.trim()?.slice(0, 80),
                open: (el as any).open,
              }));
              return { shipToHtml, selects, details };
            }).catch(() => ({}));
            console.error('[Guillevin] Ship-to debug:', JSON.stringify(shipToDebug));
            log.push(`Ship-to selects: ${JSON.stringify((shipToDebug as any).selects || [])}`);
            log.push(`Ship-to details/summary: ${JSON.stringify((shipToDebug as any).details || [])}`);

            // Strategy 1: Shopify "Ship to" dropdown — it's typically a <select> or a clickable
            // summary/details element next to "Ship to:" text
            // The dropdown arrow (▼) seen in the screenshot is usually inside an anchor or button
            const shipToDropdown = page.locator('[class*="ship"] select, select[name*="ship"], select[name*="delivery"], select[name*="address"]').first();
            if (await shipToDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
              const options = await shipToDropdown.locator('option').allTextContents().catch(() => [] as string[]);
              console.error('[Guillevin] Ship-to select options:', options);
              log.push(`Ship-to options: ${options.join(' | ')}`);
              // If we have a deliveryAddress, try to find a matching option
              if (deliveryAddress) {
                const addrKey = deliveryAddress.split(',')[0].toLowerCase().trim();
                const matchingOpt = options.find((o: string) => o.toLowerCase().includes(addrKey));
                if (matchingOpt) {
                  await shipToDropdown.selectOption({ label: matchingOpt });
                  console.error(`[Guillevin] Selected address: ${matchingOpt}`);
                  log.push(`Selected address: ${matchingOpt}`);
                  addressHandled = true;
                  await page.waitForTimeout(2000);
                }
              }
              if (!addressHandled && options.length > 1) {
                // Select second option if current is first (to try a different address)
                await shipToDropdown.selectOption({ index: 1 });
                console.error('[Guillevin] Selected second address option');
                log.push('Selected second address option');
                addressHandled = true;
                await page.waitForTimeout(2000);
              }
            }

            // Strategy 2: Click the dropdown arrow (▼) next to "Ship to" — Shopify one-page checkout
            // The arrow is usually inside the same row as "Ship to:" text
            if (!addressHandled) {
              // Look for clickable elements near "Ship to" text
              const shipToArrow = page.locator('div:has(> span:has-text("Ship to")) svg, div:has(> span:has-text("Ship to")) [class*="arrow"], div:has(> span:has-text("Ship to")) [class*="chevron"]').first();
              if (await shipToArrow.isVisible({ timeout: 2000 }).catch(() => false)) {
                await shipToArrow.click();
                console.error('[Guillevin] Clicked Ship-to arrow');
                log.push('Clicked Ship-to arrow');
                await page.waitForTimeout(2000);
                addressHandled = true;
              }
            }

            // Strategy 3: Click the entire "Ship to" row to open the address selector
            if (!addressHandled) {
              // Shopify B2B: the "Ship to" section row is often clickable
              const shipToRow = page.locator('[class*="review-block"] >> text=Ship to').first();
              if (await shipToRow.isVisible({ timeout: 2000 }).catch(() => false)) {
                // Click the parent container which might have the dropdown
                const parent = page.locator('[class*="review-block"]:has(>> text=Ship to)').first();
                if (await parent.isVisible({ timeout: 1000 }).catch(() => false)) {
                  await parent.click();
                  console.error('[Guillevin] Clicked Ship-to review block');
                  log.push('Clicked Ship-to review block');
                  await page.waitForTimeout(2000);
                }
              }
            }

            // Strategy 4: Look for the colored dropdown icon (▼) — it appears as a link/button after the address
            if (!addressHandled) {
              // The screenshot shows a pink/red ▼ — try clicking any dropdown toggle near the address area
              const dropdownToggles = page.locator('a[class*="drop"], button[class*="drop"], [class*="toggle"], details summary, [aria-haspopup]');
              const toggleCount = await dropdownToggles.count().catch(() => 0);
              for (let ti = 0; ti < Math.min(toggleCount, 10); ti++) {
                const toggleText = await dropdownToggles.nth(ti).textContent().catch(() => '');
                const toggleClass = await dropdownToggles.nth(ti).getAttribute('class').catch(() => '');
                console.error(`[Guillevin]   toggle[${ti}]: text="${toggleText?.trim()?.slice(0, 40)}" class="${toggleClass?.slice(0, 60)}"`);
              }
              // Click the first toggle that's near "Ship to"
              // Also try: any <a> or <button> inside the same section as "Ship to"
              const shipSection = page.locator('div:has(>> text="Ship to")').first();
              if (await shipSection.isVisible({ timeout: 2000 }).catch(() => false)) {
                const sectionLink = shipSection.locator('a, button, svg, [role="button"]').first();
                if (await sectionLink.isVisible({ timeout: 1000 }).catch(() => false)) {
                  await sectionLink.click();
                  console.error('[Guillevin] Clicked element inside Ship-to section');
                  log.push('Clicked element inside Ship-to section');
                  await page.waitForTimeout(2000);
                }
              }
            }

            // Strategy 5: Try to fill address fields directly if a form is visible
            if (!addressHandled) {
              const addressSelectors = [
                '#checkout_shipping_address_address1',
                'input[name="checkout[shipping_address][address1]"]',
                'input[name*="address1"]',
                'input[name*="address_1"]',
                'input[placeholder*="Address"]',
                'input[placeholder*="Adresse"]',
                'input[autocomplete="shipping address-line1"]',
                'input[autocomplete="address-line1"]',
              ];
              for (const sel of addressSelectors) {
                const field = page.locator(sel).first();
                if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await field.click({ clickCount: 3 });
                  await page.waitForTimeout(200);
                  await field.fill(deliveryAddress);
                  await page.keyboard.press('Escape');
                  await page.waitForTimeout(500);
                  console.error(`[Guillevin] Address filled via: ${sel}`);
                  log.push(`Address filled: ${deliveryAddress}`);
                  addressHandled = true;
                  break;
                }
              }
            }

            if (!addressHandled) {
              console.error('[Guillevin] Could not change address — continuing with default');
              log.push('WARNING: Could not change address — continuing with default');
            }

            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-address-after.png' }).catch(() => {});

            // Shopify one-page checkout: no "Continue to shipping" or "Continue to payment" needed
            // Scroll down to ensure payment section is visible
            log.push('Scrolling to payment section');
            console.error('[Guillevin] Scrolling to payment section');
            await page.evaluate(() => {
              const paymentSection = document.querySelector('[class*="payment"], [data-payment]');
              if (paymentSection) paymentSection.scrollIntoView({ behavior: 'smooth' });
              else window.scrollBy(0, 500);
            }).catch(() => {});
            await page.waitForTimeout(2000);
            await page.screenshot({ path: process.cwd() + '/public/debug-guillevin-payment.png' }).catch(() => {});
            log.push(`Payment URL: ${page.url()}`);
            console.error('[Guillevin] Payment URL:', page.url());

            // Step 6: Fill card details using keyboard approach (most reliable across all Shopify layouts)
            log.push('Step 6: Filling card details');
            console.error('[Guillevin] Step 6: Filling card details');
            await page.waitForTimeout(2000);

            // Debug: log all iframes and payment section HTML
            const allIframes = page.locator('iframe');
            const totalIframes = await allIframes.count().catch(() => 0);
            const iframeInfo: string[] = [];
            for (let fi = 0; fi < Math.min(totalIframes, 10); fi++) {
              const fid = await allIframes.nth(fi).getAttribute('id').catch(() => '?');
              const fsrc = await allIframes.nth(fi).getAttribute('src').catch(() => '?');
              iframeInfo.push(`id="${fid}" src="${fsrc?.slice(0, 60)}"`);
              console.error(`[Guillevin]   iframe[${fi}]: id="${fid}" src="${fsrc?.slice(0, 80)}"`);
            }
            log.push(`Payment iframes (${totalIframes}): ${iframeInfo.join(' | ')}`);

            // Dump payment section HTML
            const paymentDom = await page.evaluate(() => {
              const section = document.querySelector('[class*="payment"], [data-payment], [class*="card"], main');
              return (section || document.body).innerHTML.slice(0, 2000);
            }).catch(() => '');
            log.push(`Payment HTML: ${paymentDom.slice(0, 500)}`);

            // Find the card number iframe/input — try multiple approaches
            let cardNumberClicked = false;

            // Approach 1: Click into the card number iframe input
            const cardIframeSelectors = [
              'iframe[id*="card-fields-number"]',
              'iframe[id*="card-number"]',
              'iframe[id*="cardNumber"]',
              'iframe[src*="card"]',
            ];
            for (const sel of cardIframeSelectors) {
              try {
                const frame = page.frameLocator(sel).first();
                const input = frame.locator('input').first();
                if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
                  await input.click();
                  cardNumberClicked = true;
                  console.error(`[Guillevin] Clicked card input in iframe: ${sel}`);
                  log.push(`Card input found in iframe: ${sel}`);
                  break;
                }
              } catch {}
            }

            // Approach 2: Direct input on page (no iframe)
            if (!cardNumberClicked) {
              const directSelectors = [
                'input[autocomplete="cc-number"]',
                'input[name*="card_number"]',
                'input[id*="card-number"]',
                'input[placeholder*="Card number"]',
                'input[placeholder*="Numéro de carte"]',
              ];
              for (const sel of directSelectors) {
                const input = page.locator(sel).first();
                if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await input.click();
                  cardNumberClicked = true;
                  console.error(`[Guillevin] Clicked card input directly: ${sel}`);
                  log.push(`Card input found directly: ${sel}`);
                  break;
                }
              }
            }

            if (cardNumberClicked) {
              // Clear any existing value and type card number
              await page.keyboard.press('Control+a');
              await page.waitForTimeout(100);
              await page.keyboard.type(payment.cardNumber, { delay: 40 });
              await page.waitForTimeout(800);
              log.push('Card number typed');
              console.error('[Guillevin] Card number typed');

              // Tab to expiry field and type
              await page.keyboard.press('Tab');
              await page.waitForTimeout(500);
              await page.keyboard.type(payment.cardExpiry, { delay: 40 });
              await page.waitForTimeout(800);
              log.push('Expiry typed');
              console.error('[Guillevin] Expiry typed');

              // Tab to CVV field and type
              await page.keyboard.press('Tab');
              await page.waitForTimeout(500);
              await page.keyboard.type(payment.cardCvv, { delay: 40 });
              await page.waitForTimeout(800);
              log.push('CVV typed');
              console.error('[Guillevin] CVV typed');

              // Card holder name — target it directly (separate iframe or page input, Tab doesn't reliably reach it)
              let nameFilled = false;

              // Debug: log all iframes with their IDs to find the name field
              const nameIframeDebug: string[] = [];
              for (let fi = 0; fi < Math.min(totalIframes, 15); fi++) {
                const fid = await allIframes.nth(fi).getAttribute('id').catch(() => '?');
                const fname = await allIframes.nth(fi).getAttribute('name').catch(() => '?');
                const ftitle = await allIframes.nth(fi).getAttribute('title').catch(() => '?');
                nameIframeDebug.push(`id="${fid}" name="${fname}" title="${ftitle}"`);
              }
              log.push(`All iframes for name search: ${nameIframeDebug.join(' | ')}`);
              console.error('[Guillevin] All iframes for name search:', nameIframeDebug);

              // Try iframe with "name" in ID (multiple patterns)
              const nameIframeSelectors = [
                'iframe[id*="card-fields-name"]',
                'iframe[id*="card-name"]',
                'iframe[id*="cardName"]',
                'iframe[id*="name"]',
                'iframe[title*="name" i]',
                'iframe[title*="nom" i]',
                'iframe[title*="holder" i]',
                'iframe[title*="titulaire" i]',
              ];
              for (const sel of nameIframeSelectors) {
                if (nameFilled) break;
                try {
                  const nameFrame = page.frameLocator(sel).first();
                  const nameInput = nameFrame.locator('input').first();
                  if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await nameInput.click();
                    await page.waitForTimeout(200);
                    await page.keyboard.type(payment.cardHolder, { delay: 30 });
                    nameFilled = true;
                    console.error(`[Guillevin] Card holder typed (iframe: ${sel})`);
                    log.push(`Card holder typed (iframe: ${sel})`);
                  }
                } catch {}
              }

              // Try direct input on page
              if (!nameFilled) {
                const nameSelectors = [
                  'input[autocomplete="cc-name"]',
                  'input[name*="card_name"]',
                  'input[name*="cardholder"]',
                  'input[name*="card-name"]',
                  'input[name*="card_holder"]',
                  'input[id*="card-name"]',
                  'input[id*="cardholder"]',
                  'input[id*="card_holder"]',
                  'input[placeholder*="Name on card"]',
                  'input[placeholder*="Nom sur la carte"]',
                  'input[placeholder*="Cardholder"]',
                  'input[placeholder*="Titulaire"]',
                  'input[placeholder*="name"]',
                  'input[placeholder*="nom"]',
                ];
                for (const sel of nameSelectors) {
                  const input = page.locator(sel).first();
                  if (await input.isVisible({ timeout: 1500 }).catch(() => false)) {
                    await input.click();
                    await page.waitForTimeout(200);
                    await input.fill(payment.cardHolder);
                    nameFilled = true;
                    console.error(`[Guillevin] Card holder filled via: ${sel}`);
                    log.push(`Card holder filled via: ${sel}`);
                    break;
                  }
                }
              }

              // Last resort: Tab from CVV field to reach the name field
              if (!nameFilled) {
                console.error('[Guillevin] Trying Tab from CVV to reach name field');
                log.push('Trying Tab from CVV to reach name field');
                await page.keyboard.press('Tab');
                await page.waitForTimeout(500);
                await page.keyboard.type(payment.cardHolder, { delay: 30 });
                // Verify something was typed by checking active element
                nameFilled = true;
                console.error('[Guillevin] Card holder typed via Tab from CVV');
                log.push('Card holder typed via Tab from CVV (best effort)');
              }

              if (nameFilled) {
                log.push('Card holder name filled');
              } else {
                console.error('[Guillevin] Card holder name field not found');
                log.push('Card holder name field not found');
              }
            } else {
              log.push('No card input found at all');
              console.error('[Guillevin] No card input found — dumping page HTML');
              const paymentHtml = await page.evaluate(() => {
                const main = document.querySelector('[class*="payment"], [data-payment], main, #content');
                return (main || document.body).innerHTML.slice(0, 3000);
              }).catch(() => 'evaluate failed');
              console.error('[Guillevin] Payment HTML:', paymentHtml);
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
