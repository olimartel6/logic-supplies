import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult } from './lumen';
import type { PaymentInfo } from './lumen';
import type { Branch } from './canac';
import { getDb } from './db';
import { encrypt, decrypt } from './encrypt';

export const HOME_DEPOT_BRANCHES: Branch[] = [
  { name: 'Home Depot Anjou',                    address: '7250 Boul. Métropolitain E, Anjou, QC',                    lat: 45.6042, lng: -73.5839 },
  { name: 'Home Depot Boucherville',             address: '1400 Boul. de Montarville, Boucherville, QC',             lat: 45.5834, lng: -73.4527 },
  { name: 'Home Depot Brossard',                 address: '7250 Boul. Taschereau, Brossard, QC',                     lat: 45.4667, lng: -73.4739 },
  { name: 'Home Depot Dollard-des-Ormeaux',      address: '3900 Boul. des Sources, Dollard-des-Ormeaux, QC',         lat: 45.4855, lng: -73.8358 },
  { name: 'Home Depot Drummondville',            address: '1505 Boul. Saint-Joseph, Drummondville, QC',              lat: 45.8747, lng: -72.4763 },
  { name: 'Home Depot Gatineau',                 address: '490 Boul. de la Gappe, Gatineau, QC',                     lat: 45.4765, lng: -75.7013 },
  { name: 'Home Depot Laval',                    address: '3035 Boul. le Carrefour, Laval, QC',                      lat: 45.5667, lng: -73.7501 },
  { name: 'Home Depot Longueuil',                address: '1100 Boul. Curé-Poirier E, Longueuil, QC',                lat: 45.5292, lng: -73.4708 },
  { name: 'Home Depot Montréal-Nord',            address: '6455 Boul. Métropolitain E, Montréal, QC',                lat: 45.5969, lng: -73.6264 },
  { name: 'Home Depot Pointe-Claire',            address: '6700 Boul. des Sources, Pointe-Claire, QC',               lat: 45.4755, lng: -73.8144 },
  { name: 'Home Depot Québec (Ste-Foy)',         address: '1400 Boul. Lebourgneuf, Québec, QC',                      lat: 46.7784, lng: -71.3052 },
  { name: 'Home Depot Québec (Beauport)',        address: '3050 Boul. Raymond, Québec, QC',                          lat: 46.8633, lng: -71.1901 },
  { name: 'Home Depot Sainte-Julie',             address: '1620 Boul. Armand-Frappier, Sainte-Julie, QC',            lat: 45.5888, lng: -73.3439 },
  { name: 'Home Depot Sherbrooke',               address: '1400 Rue King O, Sherbrooke, QC',                         lat: 45.3799, lng: -71.9000 },
  { name: 'Home Depot Saint-Jean-sur-Richelieu', address: '760 Boul. du Séminaire N, Saint-Jean-sur-Richelieu, QC',  lat: 45.2861, lng: -73.2610 },
  { name: 'Home Depot Trois-Rivières',           address: '4895 Boul. des Récollets, Trois-Rivières, QC',            lat: 46.3432, lng: -72.5477 },
  { name: 'Home Depot Saint-Hubert',             address: '5380 Boul. Cousineau, Saint-Hubert, QC',                  lat: 45.5012, lng: -73.4195 },
  { name: 'Home Depot Repentigny',               address: '520 Boul. Brien, Repentigny, QC',                         lat: 45.7417, lng: -73.4609 },
  { name: 'Home Depot Terrebonne',               address: '1003 Boul. Moody, Terrebonne, QC',                        lat: 45.7023, lng: -73.6449 },
  { name: 'Home Depot Ottawa (Gloucester)',       address: '2525 Boul. Ogilvie, Ottawa, ON',                          lat: 45.4215, lng: -75.6919 },
];

// --- Cookie persistence helpers ---

async function loadHDCookies(context: any, username: string): Promise<boolean> {
  try {
    const db = getDb();
    const row = db.prepare(
      "SELECT session_cookies FROM supplier_accounts WHERE supplier = 'homedepot' AND username = ? LIMIT 1"
    ).get(username) as { session_cookies: string | null } | undefined;
    if (!row?.session_cookies) return false;
    const cookies = JSON.parse(decrypt(row.session_cookies));
    await context.addCookies(cookies);
    return true;
  } catch {
    return false;
  }
}

export async function saveHDCookies(context: any, username: string): Promise<void> {
  try {
    const cookies = await context.cookies();
    if (cookies.length === 0) return;
    const db = getDb();
    const encrypted = encrypt(JSON.stringify(cookies));
    db.prepare(
      "UPDATE supplier_accounts SET session_cookies = ? WHERE supplier = 'homedepot' AND username = ?"
    ).run(encrypted, username);
  } catch { /* ignore */ }
}

function clearHDCookies(username: string): void {
  try {
    getDb()
      .prepare("UPDATE supplier_accounts SET session_cookies = NULL WHERE supplier = 'homedepot' AND username = ?")
      .run(username);
  } catch { /* ignore */ }
}

// --- Browser helpers ---

export async function createHDContext(browser: any) {
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
  return context;
}

// --- Login ---

export async function loginToHomeDepot(page: any, username: string, password: string): Promise<boolean> {
  const context = page.context();

  // 1. Try saved session cookies first (avoids reCAPTCHA entirely)
  const hasCookies = await loadHDCookies(context, username);
  if (hasCookies) {
    await page.goto('https://www.homedepot.ca/myaccount', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const emailVisible = await page.locator('input[type="email"]').isVisible({ timeout: 3000 }).catch(() => false);
    if (!emailVisible) {
      // Session still valid — no login form shown
      return true;
    }
    // Session expired — clear cookies and fall through to form login
    clearHDCookies(username);
  }

  // 2. Form login (two-step: email first, then password)
  // Akamai Bot Manager requires enough "human" behavior before login.
  // Strategy: visit homepage → browse naturally → click sign-in link → fill form
  console.error('[HomeDepot] Starting form login (no saved cookies)');

  // Homepage warmup — Akamai sensor needs time to collect data
  await page.goto('https://www.homedepot.ca', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);  // Let Akamai JS sensor fully initialize

  // Simulate natural browsing: random mouse movement + scrolling
  await page.mouse.move(200 + Math.random() * 800, 200 + Math.random() * 400);
  await page.waitForTimeout(500 + Math.random() * 500);
  await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 400));
  await page.waitForTimeout(1000 + Math.random() * 500);
  await page.mouse.move(300 + Math.random() * 600, 100 + Math.random() * 300);
  await page.waitForTimeout(300 + Math.random() * 300);
  await page.evaluate(() => window.scrollBy(0, -100));
  await page.waitForTimeout(500 + Math.random() * 500);

  // Dismiss localization/store confirmation modal (blocks all interaction)
  const localizationClose = page.locator([
    'localization-confirmation-container button',
    'button.acl-modal__close',
    'button:has-text("Confirm")',
    'button:has-text("Confirmer")',
    'button:has-text("OK")',
    '.acl-modal__backdrop--open ~ * button',
  ].join(', ')).first();
  if (await localizationClose.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.error('[HomeDepot] Dismissing localization modal');
    await localizationClose.click();
    await page.waitForTimeout(1500);
  }

  // OneTrust cookie consent banner
  const cookieBtn = page.locator('#onetrust-accept-btn-handler').first();
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(1000);
  }

  // Navigate to login page — use networkidle to ensure Angular SPA has fully rendered
  console.error('[HomeDepot] Navigating to login page');
  await page.goto('https://www.homedepot.ca/myaccount', { waitUntil: 'networkidle', timeout: 45000 }).catch(() =>
    page.goto('https://www.homedepot.ca/myaccount', { waitUntil: 'domcontentloaded', timeout: 30000 })
  );
  await page.waitForTimeout(8000);  // Extra time for Angular SPA to initialize + Akamai sensor

  // Dismiss localization/store picker modal (appears on every first visit)
  const storeCloseBtn = page.locator([
    'localization-confirmation-container button.acl-modal__close',
    'button.acl-modal__close',
    'localization-confirmation-container button:has-text("Confirm")',
    'localization-confirmation-container button:has-text("Confirmer")',
  ].join(', ')).first();
  if (await storeCloseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.error('[HomeDepot] Dismissing store picker modal');
    await storeCloseBtn.click();
    await page.waitForTimeout(2000);
  }
  // Also try backdrop click to dismiss any remaining modal
  const backdrop = page.locator('.acl-modal__backdrop--open');
  if (await backdrop.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.error('[HomeDepot] Clicking backdrop to dismiss modal');
    await backdrop.click({ force: true, position: { x: 10, y: 10 } });
    await page.waitForTimeout(1500);
  }
  console.error('[HomeDepot] Login page URL:', page.url());

  // Log all visible inputs to verify we're on the login form
  const visibleInputs = await page.locator('input:visible').evaluateAll((els: Element[]) =>
    els.map(e => ({ type: (e as HTMLInputElement).type, name: (e as HTMLInputElement).name, id: e.id, placeholder: (e as HTMLInputElement).placeholder }))
  ).catch(() => []);
  console.error('[HomeDepot] Visible inputs:', JSON.stringify(visibleInputs));

  // Step 1: Fill email — find the login email field specifically (not search bar)
  const emailField = page.locator('input[type="email"]').first();
  const emailExists = await emailField.isVisible({ timeout: 15000 }).catch(() => false);
  if (!emailExists) {
    console.error('[HomeDepot] No email input found on page');
    return false;
  }
  await emailField.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const emailBox = await emailField.boundingBox();
  if (emailBox) {
    await page.mouse.move(emailBox.x + emailBox.width / 2, emailBox.y + emailBox.height / 2, { steps: 10 });
    await page.waitForTimeout(200);
  }
  await emailField.click();
  await page.waitForTimeout(500);
  await emailField.type(username, { delay: 90 + Math.random() * 40 });
  await page.waitForTimeout(1000);
  console.error('[HomeDepot] Email typed, value:', await emailField.inputValue().catch(() => '?'));

  // Step 2: Submit email — click the submit button (more reliable than Enter)
  console.error('[HomeDepot] Submitting email...');
  const emailSubmitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Continuer")').first();
  if (await emailSubmitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailSubmitBtn.click();
  } else {
    await emailField.press('Enter');
  }
  await page.waitForTimeout(10000);  // HD validates email server-side

  // Step 3: Wait for password field
  const passField = page.locator('input[type="password"]').first();
  const passVisible = await passField.isVisible({ timeout: 15000 }).catch(() => false);
  if (!passVisible) {
    const errorMsg = await page.locator('[class*="error"], [class*="alert"], .acl-type--negative, [class*="Error"]').first().textContent().catch(() => '');
    const currentInputs = await page.locator('input:visible').evaluateAll((els: Element[]) =>
      els.map(e => ({ type: (e as HTMLInputElement).type, name: (e as HTMLInputElement).name }))
    ).catch(() => []);
    console.error(`[HomeDepot] Password field not visible — error: "${errorMsg?.trim()}" inputs: ${JSON.stringify(currentInputs)} url: ${page.url()}`);
    return false;
  }

  await page.waitForTimeout(500);
  await passField.click();
  await passField.type(password, { delay: 70 + Math.random() * 40 });
  await page.waitForTimeout(600);
  console.error('[HomeDepot] Submitting password...');
  await passField.press('Enter');

  // Wait for login to process
  await page.waitForTimeout(8000);

  // Success check
  const emailStillVisible = await page.locator('input[type="email"]').isVisible({ timeout: 2000 }).catch(() => false);
  const passStillVisible = await page.locator('input[type="password"]').isVisible({ timeout: 1000 }).catch(() => false);
  const loggedIn = !emailStillVisible && !passStillVisible;
  console.error(`[HomeDepot] Login result: ${loggedIn ? 'SUCCESS' : 'FAILED'} url=${page.url()}`);

  // 3. Save session cookies so future calls skip the login form
  if (loggedIn) {
    await saveHDCookies(context, username);
  }

  return loggedIn;
}

export async function testHomeDepotConnection(username: string, password: string): Promise<ConnectionResult> {
  // Use residential proxies — Home Depot's Akamai Bot Manager blocks datacenter IPs
  const browser = await createBrowserbaseBrowser({ proxies: true });

  let captchaDetected = false;
  let akamaiDetected = false;

  try {
    const context = await createHDContext(browser);
    const page = await context.newPage();

    page.on('request', (req: any) => {
      const url = req.url();
      if (url.includes('recaptcha/enterprise/reload') || url.includes('recaptcha/api2/payload')) {
        captchaDetected = true;
      }
      if (url.includes('akamai') || url.includes('_abck') || url.includes('bm_sz')) {
        akamaiDetected = true;
      }
    });

    const loggedIn = await loginToHomeDepot(page, username, password);
    if (loggedIn) return { success: true };

    if (captchaDetected) {
      return {
        success: false,
        error: 'Home Depot bloque la connexion automatique (reCAPTCHA). Utilisez le bouton "Connexion manuelle" ci-dessous pour configurer la session une seule fois.',
      };
    }

    const emailVisible = await page.locator('input[type="email"]').isVisible({ timeout: 1000 }).catch(() => false);
    const passVisible = await page.locator('input[type="password"]').isVisible({ timeout: 1000 }).catch(() => false);

    if (emailVisible) return { success: false, error: 'Email non reconnu par Home Depot' };
    if (passVisible) return { success: false, error: 'Mot de passe incorrect' };
    return { success: false, error: 'Identifiants invalides' };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

export async function getHomeDepotPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const context = await createHDContext(browser);
    const page = await context.newPage();
    const loggedIn = await loginToHomeDepot(page, username, password);
    if (!loggedIn) return null;

    const searchBar = page.locator('input[id="headerSearch"], input[name="Ntt"], input[placeholder*="Recherche"], input[placeholder*="Search"]').first();
    await searchBar.waitFor({ timeout: 8000 });
    await searchBar.click();
    await searchBar.type(product, { delay: 100 });
    await searchBar.press('Enter');
    await page.waitForTimeout(4000);

    const priceEl = page.locator('[class*="price__value"], [class*="price-format"], [itemprop="price"]').first();
    if (await priceEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      const priceText = await priceEl.textContent().catch(() => '');
      const match = priceText?.match(/[\d]+[.,][\d]{2}/);
      if (match) return parseFloat(match[0].replace(',', '.'));
    }
    return null;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

export async function placeHomeDepotOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  const log: string[] = [];
  // Use residential proxies to bypass Akamai Bot Manager
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    log.push('Initializing browser and context');
    const context = await createHDContext(browser);
    const page = await context.newPage();
    log.push('Logging in to Home Depot');
    const loggedIn = await loginToHomeDepot(page, username, password);
    if (!loggedIn) {
      const url = page.url();
      const emailVisible = await page.locator('input[type="email"]').isVisible({ timeout: 1000 }).catch(() => false);
      const passVisible = await page.locator('input[type="password"]').isVisible({ timeout: 1000 }).catch(() => false);
      const bodySnippet = (await page.textContent('body').catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
      const errorDetail = `Login échoué url=${url} email_visible=${emailVisible} pass_visible=${passVisible} body="${bodySnippet}"`;
      console.error(`[HomeDepot] ${errorDetail}`);
      log.push(`Login failed: ${errorDetail}`);
      return { success: false, error: errorDetail, log };
    }
    log.push('Login successful');

    // Navigate to home page so the search bar is accessible
    log.push('Navigating to Home Depot homepage');
    await page.goto('https://www.homedepot.ca', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Build search query: try SKU from catalog first
    let searchQuery = product;
    try {
      const row = (
        getDb().prepare("SELECT sku FROM products WHERE name = ? AND supplier = 'homedepot' LIMIT 1").get(product) ||
        getDb().prepare("SELECT sku FROM products WHERE name = ? LIMIT 1").get(product)
      ) as { sku: string } | undefined;
      if (row?.sku) searchQuery = row.sku.split('/')[0];
    } catch {}

    // Search for the product
    log.push(`Searching for product: ${searchQuery}`);
    const searchBar = page.locator('input[id="headerSearch"], input[name="Ntt"], input[placeholder*="Recherche"], input[placeholder*="Search"]').first();
    await searchBar.waitFor({ timeout: 8000 });
    await searchBar.click();
    await searchBar.type(searchQuery, { delay: 120 });
    await searchBar.press('Enter');
    await page.waitForTimeout(4000);
    console.error('[HomeDepot] Page résultats:', page.url());

    // Click first product result
    const firstProduct = page.locator(
      'a[data-automation-id="product-pod-link"], .product-pod--ie-fix a, [class*="product-pod"] a'
    ).first();
    if (!await firstProduct.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.error('[HomeDepot] Produit introuvable:', product);
      log.push(`Product not found: ${product}`);
      return { success: false, error: `Produit "${product}" introuvable sur Home Depot`, log };
    }
    log.push('Clicking first product result');
    await firstProduct.click();
    await page.waitForTimeout(4000);
    console.error('[HomeDepot] Page produit:', page.url());

    // Set quantity before adding to cart
    const qtyInput = page.locator(
      'input[data-automation-id="quantity-input"], input[aria-label*="uantit"], input[class*="quantity"], input[name="quantity"]'
    ).first();
    if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await qtyInput.click({ clickCount: 3 });
      await qtyInput.type(quantity.toString(), { delay: 50 });
      await page.waitForTimeout(300);
      log.push(`Quantity set to ${quantity}`);
      console.error('[HomeDepot] Quantité définie:', quantity);
    }

    // Add to cart
    log.push('Looking for Add to Cart button');
    const addCartBtn = page.locator(
      'button:has-text("Ajouter au panier"), button:has-text("Add to Cart"), button[data-automation-id="add-to-cart"]'
    ).first();
    if (!await addCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.error('[HomeDepot] Bouton "Ajouter au panier" introuvable');
      log.push('Add to Cart button not found');
      return { success: false, error: 'Bouton "Ajouter au panier" introuvable sur Home Depot', log };
    }
    log.push('Clicking Add to Cart');
    await addCartBtn.click();
    await page.waitForTimeout(4000);

    // Verify cart was updated (look for confirmation toast or cart count)
    const cartConfirm = page.locator(
      '[class*="cart-confirm"], [class*="add-to-cart-confirm"], [aria-label*="panier"], [data-automation-id="cart-count"]'
    ).first();
    const confirmed = await cartConfirm.isVisible({ timeout: 3000 }).catch(() => false);
    log.push(`Cart confirmation visible: ${confirmed}`);
    console.error('[HomeDepot] Ajouté au panier, confirmation visible:', confirmed);

    // Save updated cookies after successful cart add
    await saveHDCookies(context, username);

    if (deliveryAddress && payment) {
      try {
        // Step 1: Navigate to cart
        log.push('Step 1: Navigating to cart');
        console.error('[HomeDepot] Step 1: Navigating to cart');
        await page.goto('https://www.homedepot.ca/en/home/cart.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        await page.screenshot({ path: process.cwd() + '/public/debug-hd-cart.png' }).catch(() => {});

        // Step 2: Click checkout
        log.push('Step 2: Clicking checkout button');
        console.error('[HomeDepot] Step 2: Clicking checkout');
        const checkoutBtn = page.locator('button:has-text("Checkout"), button:has-text("Passer à la caisse"), a:has-text("Checkout"), a:has-text("Passer à la caisse")').first();
        if (await checkoutBtn.isVisible({ timeout: 8000 })) {
          await checkoutBtn.click();
          await page.waitForTimeout(6000);
          log.push('Checkout button clicked');
        } else {
          log.push('Checkout button not found — skipping');
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-hd-checkout.png' }).catch(() => {});
        log.push(`Checkout URL: ${page.url()}`);
        console.error('[HomeDepot] Checkout URL:', page.url());

        // Step 3: Fill delivery address
        log.push('Step 3: Filling delivery address');
        console.error('[HomeDepot] Step 3: Filling delivery address');
        await page.waitForTimeout(2000);
        const addressField = page.locator('input[id*="address"], input[name*="address"], input[placeholder*="Address"], input[placeholder*="adresse"]').first();
        if (await addressField.isVisible({ timeout: 8000 })) {
          await addressField.fill(deliveryAddress);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(3000);
          log.push(`Address filled: ${deliveryAddress}`);
          console.error('[HomeDepot] Address filled');
        } else {
          log.push('No address field found — may already be saved');
          console.error('[HomeDepot] No address field — may already be saved');
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-hd-address.png' }).catch(() => {});

        // Step 4: Continue to payment
        log.push('Step 4: Continue to payment');
        console.error('[HomeDepot] Step 4: Continue to payment');
        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Continuer")').first();
        if (await continueBtn.isVisible({ timeout: 5000 })) {
          await continueBtn.click();
          await page.waitForTimeout(4000);
          log.push('Continue button clicked');
        } else {
          log.push('Continue button not found — skipping');
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-hd-payment.png' }).catch(() => {});
        log.push(`Payment page URL: ${page.url()}`);
        console.error('[HomeDepot] Payment page URL:', page.url());

        // Step 5: Fill card details (try iframe first, then direct)
        log.push('Step 5: Filling card details');
        console.error('[HomeDepot] Step 5: Filling card details');
        await page.waitForTimeout(2000);
        const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[name*="card"], iframe[id*="card"]').first();
        const cardInput = cardFrame.locator('input').first();
        if (await cardInput.isVisible({ timeout: 8000 }).catch(() => false)) {
          console.error('[HomeDepot] Card in iframe — filling');
          await cardInput.fill(payment.cardNumber);
          log.push('Card number filled (iframe)');
        } else {
          console.error('[HomeDepot] Card direct input — filling');
          const directCard = page.locator('input[id*="cardNumber"], input[name*="cardNumber"], input[id*="card-number"], input[autocomplete="cc-number"]').first();
          if (await directCard.isVisible({ timeout: 5000 })) {
            await directCard.fill(payment.cardNumber);
            log.push('Card number filled (direct)');
          } else {
            log.push('Card number field not found');
          }
        }

        await page.waitForTimeout(2000);

        // Fill cardholder name
        const nameField = page.locator('input[name*="name"], input[id*="name"], input[autocomplete="cc-name"]').first();
        if (await nameField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nameField.fill(payment.cardHolder);
          log.push('Cardholder name filled');
          console.error('[HomeDepot] Cardholder name filled');
        } else {
          log.push('Cardholder name field not found — skipping');
          console.error('[HomeDepot] Cardholder name field not found');
        }

        const expiryField = page.locator('input[id*="expiry"], input[name*="expiry"], input[autocomplete="cc-exp"]').first();
        if (await expiryField.isVisible({ timeout: 3000 })) {
          await expiryField.fill(payment.cardExpiry);
          log.push('Expiry filled');
          console.error('[HomeDepot] Expiry filled');
        } else {
          log.push('Expiry field not found');
        }

        const cvvField = page.locator('input[id*="cvv"], input[name*="cvv"], input[autocomplete="cc-csc"]').first();
        if (await cvvField.isVisible({ timeout: 3000 })) {
          await cvvField.fill(payment.cardCvv);
          log.push('CVV filled');
          console.error('[HomeDepot] CVV filled');
        } else {
          log.push('CVV field not found');
        }
        await page.waitForTimeout(2000);
        await page.screenshot({ path: process.cwd() + '/public/debug-hd-card-filled.png' }).catch(() => {});

        // Step 6: Place order
        log.push('Step 6: Placing order');
        console.error('[HomeDepot] Step 6: Placing order');
        const placeOrderBtn = page.locator('button:has-text("Place Order"), button:has-text("Passer la commande"), button:has-text("Submit Order")').first();
        if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
          await placeOrderBtn.click();
          await page.waitForTimeout(10000);
          log.push('Place order button clicked');
        } else {
          log.push('Place order button not found');
        }
        await page.screenshot({ path: process.cwd() + '/public/debug-hd-confirmation.png' }).catch(() => {});
        log.push(`Final URL: ${page.url()}`);
        console.error('[HomeDepot] Final URL:', page.url());

        // Step 7: Capture order number
        log.push('Step 7: Capturing order number');
        const bodyText = await page.textContent('body');
        const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i)
          || bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i);
        const orderId = orderMatch?.[1];
        console.error('[HomeDepot] Order ID:', orderId || 'not found');
        if (!orderId) {
          const bodySnippet = bodyText?.slice(0, 500).replace(/\s+/g, ' ') || '';
          console.error('[HomeDepot] Page body snippet:', bodySnippet);
          log.push(`Order ID not found. Page snippet: ${bodySnippet.slice(0, 200)}`);
        } else {
          log.push(`Order ID captured: ${orderId}`);
        }
        if (!orderId) {
          return { success: false, inCart: true, error: 'Commande soumise mais pas de numéro de confirmation', log };
        }
        return { success: true, orderId, log };
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        console.error('[HomeDepot] Checkout error:', errorMsg);
        log.push(`Checkout error: ${errorMsg}`);
        await page.screenshot({ path: process.cwd() + '/public/debug-hd-error.png' }).catch(() => {});
        return { success: false, inCart: true, error: `Checkout: ${errorMsg}`, log };
      }
    }

    log.push('No delivery address or payment provided — stopping at cart');
    return { success: false, inCart: true, log };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    console.error('[HomeDepot] Erreur:', errorMsg);
    log.push(`Fatal error: ${errorMsg}`);
    return { success: false, error: errorMsg, log };
  } finally {
    await browser.close();
  }
}
