import { createBrowserbaseBrowser } from './browser';
import type { LumenOrderResult, ConnectionResult } from './lumen';
import type { PaymentInfo } from './lumen';

export interface Branch {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export const CANAC_BRANCHES: Branch[] = [
  { name: 'Canac Anjou',                      address: '7500 Boul. Métropolitain E, Anjou, QC',                    lat: 45.6042, lng: -73.5581 },
  { name: 'Canac Brossard',                   address: '7405 Boul. Taschereau, Brossard, QC',                     lat: 45.4604, lng: -73.4616 },
  { name: 'Canac Gatineau',                   address: '500 Boul. de la Gappe, Gatineau, QC',                     lat: 45.4765, lng: -75.7013 },
  { name: 'Canac Jonquière',                  address: '2800 Boul. du Royaume, Jonquière, QC',                    lat: 48.4170, lng: -71.2381 },
  { name: 'Canac Laval',                      address: '3105 Boul. de la Concorde E, Laval, QC',                  lat: 45.5756, lng: -73.7019 },
  { name: 'Canac Lévis',                      address: '360 Route du Président-Kennedy, Lévis, QC',               lat: 46.8062, lng: -71.1776 },
  { name: 'Canac Longueuil',                  address: '1060 Boul. Curé-Poirier E, Longueuil, QC',                lat: 45.5313, lng: -73.5255 },
  { name: 'Canac Québec (Charlesbourg)',       address: '8510 Boul. Henri-Bourassa, Québec, QC',                   lat: 46.8750, lng: -71.2602 },
  { name: 'Canac Québec (Ste-Foy)',            address: '1105 Route de l\'Église, Québec, QC',                     lat: 46.7784, lng: -71.3052 },
  { name: 'Canac Repentigny',                 address: '90 Boul. Industriel, Repentigny, QC',                     lat: 45.7417, lng: -73.4609 },
  { name: 'Canac Rimouski',                   address: '200 Boul. Saint-Germain O, Rimouski, QC',                 lat: 48.4427, lng: -68.5291 },
  { name: 'Canac Rivière-du-Loup',            address: '140 Boul. Thériault, Rivière-du-Loup, QC',                lat: 47.8281, lng: -69.5342 },
  { name: 'Canac Saint-Georges',              address: '11260 Boul. Lacroix, Saint-Georges, QC',                  lat: 46.1198, lng: -70.6701 },
  { name: 'Canac Saint-Hyacinthe',            address: '6350 Boul. Laframboise, Saint-Hyacinthe, QC',             lat: 45.6285, lng: -72.9572 },
  { name: 'Canac Saint-Jean-sur-Richelieu',   address: '600 Rue Du Semis, Saint-Jean-sur-Richelieu, QC',          lat: 45.2861, lng: -73.2610 },
  { name: 'Canac Shawinigan',                 address: '1010 Rue Trudel, Shawinigan, QC',                         lat: 46.5706, lng: -72.7476 },
  { name: 'Canac Sherbrooke',                 address: '3775 Boul. Portland, Sherbrooke, QC',                     lat: 45.4042, lng: -71.8929 },
  { name: 'Canac Terrebonne',                 address: '1020 Boul. Moody, Terrebonne, QC',                        lat: 45.7023, lng: -73.6449 },
  { name: 'Canac Trois-Rivières',             address: '4805 Boul. des Forges, Trois-Rivières, QC',               lat: 46.3432, lng: -72.5477 },
  { name: 'Canac Victoriaville',              address: '60 Boul. Jutras E, Victoriaville, QC',                    lat: 46.0571, lng: -71.9575 },
];

export async function createCanacPage(browser: any) {
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

export async function loginToCanac(page: any, username: string, password: string): Promise<{ success: boolean; accessToken?: string }> {
  // Step 0: Cloudflare warmup — visit the Angular app BEFORE the OAuth flow.
  console.error('[Canac] Cloudflare warmup: visite /canac/fr/2…');
  await page.goto('https://www.canac.ca/canac/fr/2', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60; i++) {
    const cookies = await page.context().cookies(['https://www.canac.ca']);
    if (cookies.some((c: any) => c.name === 'cf_clearance')) {
      console.error(`[Canac] cf_clearance obtenu (t=${i * 2}s)`);
      break;
    }
    if (i % 5 === 0) {
      const title = await page.title().catch(() => '?');
      console.error(`[Canac] Warmup t=${i * 2}s titre="${title}"`);
    }
    await page.waitForTimeout(2000);
  }

  // Set up interceptors BEFORE clicking login.
  let capturedCode: string | null = null;
  let capturedClientId: string | null = null;
  let capturedRedirectUri: string | null = null;

  // Use page.on('request') (CDP Network.requestWillBeSent) to observe ALL requests.
  // page.route() uses CDP Fetch domain which misses top-level cross-domain navigation
  // requests (Angular navigating to login.canac.ca/authorize). Network.requestWillBeSent
  // fires for every request including cross-domain navigations.
  page.on('request', (req: any) => {
    try {
      const u = new URL(req.url());
      if (!capturedClientId && u.searchParams.has('client_id')) {
        capturedClientId = u.searchParams.get('client_id');
        capturedRedirectUri = u.searchParams.get('redirect_uri') || 'https://www.canac.ca/canac/';
        console.error(`[Canac] OAuth params: client_id=${capturedClientId?.slice(0, 20)} via ${u.hostname}${u.pathname}`);
      }
    } catch {}
  });

  // Intercept OAuth callback: capture code and serve a blank 200 page.
  // We deliberately avoid a 302 redirect to /canac/fr/2 here because the browser would
  // carry the old cf_clearance (bound to the pre-OAuth proxy IP), causing Cloudflare to
  // run a slow Level-2 challenge (120s+) instead of the fast Level-1 one (2-4s).
  // After the code is captured we clear the stale cf_clearance and do a fresh page.goto().
  await page.route(/https:\/\/www\.canac\.ca\/canac\/\?.*code=/, async (route: any) => {
    try {
      const u = new URL(route.request().url());
      capturedCode = u.searchParams.get('code');
      console.error(`[Canac] OAuth code intercepté ✓`);
    } catch {}
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body></body></html>' });
  });

  // Cookie consent banner (may appear on initial Angular load)
  const cookieBtn = page.locator('#didomi-notice-agree-button, button:has-text("Accepter & Fermer")').first();
  if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(800);
  }

  // Click header "Se connecter" button
  const headerBtn = page.locator([
    'button.canac-login__btn',
    'button[class*="login__btn"]',
    'button[class*="login-btn"]',
    'button:has-text("Se connecter")',
    'a:has-text("Se connecter")',
  ].join(', ')).first();
  await headerBtn.waitFor({ timeout: 12000 });
  await headerBtn.click();
  await page.waitForTimeout(1500);

  // Click dialog login button if needed
  if (!page.url().includes('login.canac.ca')) {
    const dialogLoginBtn = page.locator([
      'button.canac-my-account-dialog__login-btn',
      'button[class*="my-account-dialog__login"]',
      'button[class*="dialog__login"]',
      'button:has-text("Se connecter ou créer")',
      'button:has-text("Connexion")',
    ].join(', ')).first();
    if (await dialogLoginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dialogLoginBtn.click();
    }
  }

  // Poll for Auth0 (avoid waitForFunction which can cause CDP disconnects)
  for (let i = 0; i < 30; i++) {
    if (page.url().includes('login.canac.ca')) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);

  const loginUrl = page.url();
  const loginTitle = await page.title().catch(() => '?');
  console.error(`[Canac] Page Auth0: url=${loginUrl.slice(0, 80)} titre="${loginTitle}"`);

  // Login with retry — Auth0 bot detection sometimes rejects attempts.
  // Use type() for both fields (not fill()) to mimic real user keystrokes.
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.error(`[Canac] Tentative login ${attempt}/3`);

    // On retry, reload the Auth0 page to get a clean form
    if (attempt > 1) {
      console.error(`[Canac] Reload Auth0 (retry ${attempt})...`);
      await page.waitForTimeout(attempt * 3000);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    const emailField = page.locator('input#username').first();
    await emailField.waitFor({ timeout: 15000 });
    await emailField.click();
    await emailField.fill(''); // clear
    await emailField.type(username, { delay: 80 });
    await page.waitForTimeout(500);

    // Auth0 Universal Login: password field may be hidden initially (email-first flow)
    const passField = page.locator('input#password').first();
    const passAlreadyVisible = await passField.isVisible({ timeout: 1500 }).catch(() => false);
    if (!passAlreadyVisible) {
      await emailField.press('Enter');
      await passField.waitFor({ timeout: 15000 });
    }

    await passField.click();
    await passField.selectText().catch(() => {});
    // Use keyboard.insertText() to bypass keyboard layout issues
    // (type() uses Shift+4 for $ which can fail on non-US layouts)
    await page.keyboard.insertText(password);
    await page.waitForTimeout(500);

    // Verify password length
    const passLen = await page.evaluate(() => (document.querySelector('input#password') as HTMLInputElement)?.value?.length).catch(() => 0);
    console.error(`[Canac] Password: ${passLen} chars (expected ${password.length})`);
    if (passLen !== password.length) {
      // Fallback: fill() which Playwright designed for React inputs
      console.error('[Canac] Password mismatch — fallback fill()');
      await passField.fill(password);
      await page.waitForTimeout(300);
    }

    await passField.press('Enter');
    await page.waitForTimeout(3000);

    // Check for errors
    const hasError = await page.evaluate(() => {
      const errs = document.querySelectorAll('[class*="error"], [role="alert"], .ulp-alert');
      return Array.from(errs).some((el: any) => el.textContent?.trim().length > 2);
    }).catch(() => false);

    if (hasError && attempt < 3) {
      console.error(`[Canac] Auth0 a rejeté la tentative ${attempt}`);
      continue;
    }

    if (capturedCode) break;

    const maxWait = attempt === 3 ? 60 : 15;
    for (let i = 0; i < maxWait && !capturedCode; i++) {
      await page.waitForTimeout(1000);
      if (i > 0 && i % 10 === 0) console.error(`[Canac] Attente code OAuth t=${i}s`);
    }
    if (capturedCode) break;

    if (attempt === 3) {
      const diag = await page.evaluate(() => {
        const errors = Array.from(document.querySelectorAll('[class*="error"], [role="alert"], .ulp-alert'))
          .map((el: any) => el.textContent?.trim()).filter((t: string) => t && t.length > 2);
        const hasCaptcha = !!document.querySelector('iframe[src*="turnstile"], iframe[src*="hcaptcha"], .cf-turnstile, .h-captcha');
        return { errors, hasCaptcha };
      }).catch(() => ({ errors: [], hasCaptcha: false }));
      console.error(`[Canac] Auth0 diag final: errors=${JSON.stringify(diag.errors)} captcha=${diag.hasCaptcha}`);
    }
  }

  if (!capturedCode) {
    console.error('[Canac] OAuth code non capturé dans les 60s');
    return { success: false };
  }

  // Delete the stale cf_clearance (bound to the pre-OAuth proxy IP) so that when we
  // navigate to /canac/fr/2 Cloudflare runs a Level-1 JS challenge (~2-4s) rather
  // than a Level-2 managed challenge (120s+ that often never completes).
  const cookiesBeforeGoto = await page.context().cookies();
  await page.context().clearCookies();
  await page.context().addCookies(cookiesBeforeGoto.filter((c: any) => c.name !== 'cf_clearance'));

  // Navigate explicitly to /canac/fr/2 — triggers a fresh Level-1 CF challenge.
  console.error('[Canac] Re-warmup post-OAuth (cf_clearance effacé, goto /canac/fr/2)...');
  await page.goto('https://www.canac.ca/canac/fr/2', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

  for (let i = 0; i < 60; i++) {
    const cookies = await page.context().cookies(['https://www.canac.ca']);
    const title = await page.title().catch(() => '');
    const hasCF = cookies.some((c: any) => c.name === 'cf_clearance');
    if (i % 5 === 0) console.error(`[Canac] Re-warmup t=${i * 2}s cf_clearance=${hasCF} titre="${title}"`);
    // Don't exit if title is blank/short (page still loading) or a CF challenge page
    const cfChallenge = title.length < 3 || title.toLowerCase().includes('instant') || title.toLowerCase().includes('moment');
    if (hasCF && !cfChallenge) {
      console.error(`[Canac] cf_clearance valide (t=${i * 2}s)`);
      break;
    }
    await page.waitForTimeout(2000);
  }

  // Retrieve PKCE code_verifier set by Angular before the OAuth redirect
  const allCookies = await page.context().cookies(['https://www.canac.ca']);
  let codeVerifier = allCookies.find((c: any) => c.name === 'oauth_code_verifier')?.value || '';
  // Spartacus stores the cookie URL-encoded AND JSON-wrapped: %22actualValue%22
  // Step 1: URL-decode (%22 → ")
  try { codeVerifier = decodeURIComponent(codeVerifier); } catch {}
  // Step 2: Strip surrounding JSON quotes (" → removed)
  codeVerifier = codeVerifier.replace(/^"(.*)"$/, '$1');
  // Step 3: base64 → base64url just in case (+ → -, / → _, strip = padding)
  codeVerifier = codeVerifier.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  console.error(`[Canac] PKCE: code_verifier=${codeVerifier ? 'ok' : 'ABSENT'} client_id=${capturedClientId ? 'ok' : 'ABSENT'}`);

  if (!codeVerifier || !capturedClientId || !capturedRedirectUri) {
    console.error('[Canac] PKCE params manquants — impossible d\'échanger le code');
    return { success: false };
  }

  // Exchange code for access_token via PKCE.
  // Runs in browser from www.canac.ca origin — Auth0 has CORS enabled for this
  // origin because the Canac Angular SPA performs this same exchange in production.
  const tokenResult = await page.evaluate(async ({ code, clientId, redirectUri, codeVerifier }: any) => {
    try {
      const res = await fetch('https://login.canac.ca/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
      });
      const text = await res.text();
      return { status: res.status, body: text };
    } catch (e: any) { return { status: 0, body: e.message }; }
  }, { code: capturedCode, clientId: capturedClientId, redirectUri: capturedRedirectUri, codeVerifier });

  console.error(`[Canac] Token exchange: status=${tokenResult.status} body=${tokenResult.body.slice(0, 300)}`);

  let accessToken: string | null = null;
  try { accessToken = JSON.parse(tokenResult.body).access_token || null; } catch {}

  if (!accessToken) {
    console.error('[Canac] Pas de access_token dans la réponse Auth0');
    return { success: false };
  }

  console.error('[Canac] Login PKCE réussi ✓');
  return { success: true, accessToken };
}

export async function testCanacConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const page = await createCanacPage(browser);
    const loginResult = await loginToCanac(page, username, password);
    if (loginResult.success) return { success: true };
    // Only look for error text on the Auth0 page — on canac.ca the page contains unrelated content
    const currentUrl = page.url();
    let errorText = '';
    if (currentUrl.includes('login.canac.ca')) {
      errorText = await page.locator('.error-global, [id*="error-element"], [class*="error-message"]').first().textContent().catch(() => '');
    }
    return { success: false, error: errorText?.trim() || `Identifiants invalides (page: ${currentUrl})` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

// Search products via UI and extract numeric codes from result URLs
async function searchCanacProducts(page: any, product: string): Promise<{ code: string; name: string }[]> {
  const searchBar = page.locator('input[placeholder*="Rechercher"]').first();
  await searchBar.waitFor({ timeout: 8000 });
  await searchBar.click();
  await searchBar.fill('');
  await searchBar.type(product, { delay: 80 });
  await searchBar.press('Enter');
  await page.waitForTimeout(8000);

  // Extract numeric product codes from URLs: /p/<slug>/<numericCode>
  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/p/"]')).map((el: any) => {
      const href = el.getAttribute('href') || '';
      const match = href.match(/\/p\/([^/?]+?)(?:\/(\d+))?(?:\?|$)/);
      const slug = match?.[1] || '';
      const code = match?.[2] || '';
      const name = el.querySelector('[class*="name"], h3, h4')?.textContent?.trim() || '';
      return { slug, code, name };
    }).filter((p: any) => p.code);
  }).catch(() => []);

  // Deduplicate by code
  const unique = Array.from(new Map(results.map((p: any) => [p.code, p])).values()) as { code: string; name: string }[];
  return unique;
}

export async function getCanacPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const page = await createCanacPage(browser);
    const loginResult = await loginToCanac(page, username, password);
    if (!loginResult.success || !loginResult.accessToken) return null;

    const products = await searchCanacProducts(page, product);
    if (products.length === 0) return null;

    // Look up price via apisapcc API
    const priceResult = await page.evaluate(async ({ token, code }: any) => {
      try {
        const res = await fetch(`https://apisapcc.canac.ca/occ/v2/canac/products/${code}?fields=price(formattedValue,value)`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.price?.value ?? null;
      } catch { return null; }
    }, { token: loginResult.accessToken, code: products[0].code });

    return typeof priceResult === 'number' ? priceResult : null;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

export async function placeCanacOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<LumenOrderResult> {
  // Residential proxies needed: Canac uses Cloudflare Turnstile which blocks datacenter IPs
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const page = await createCanacPage(browser);
    const loginResult = await loginToCanac(page, username, password);
    if (!loginResult.success || !loginResult.accessToken) {
      console.error('[Canac] Login échoué');
      return { success: false, error: 'Login Canac échoué' };
    }
    const accessToken = loginResult.accessToken;

    // ── Step 1: Search via UI (Coveo) ─────────────────────────────────────────
    // Cloudflare blocks all direct REST API calls and product page navigation.
    // The Angular SPA uses Coveo for search (works from browser). We search via
    // the UI search bar and extract numeric product codes from result URLs.
    const products = await searchCanacProducts(page, product);

    if (products.length === 0) {
      console.error(`[Canac] Produit "${product}" introuvable`);
      return { success: false, error: `Produit "${product}" introuvable sur Canac` };
    }
    const productCode = products[0].code;
    console.error(`[Canac] Produit trouvé: code=${productCode} name="${products[0].name}"`);

    // ── Step 2: Add to cart via apisapcc.canac.ca API ──────────────────────────
    // The Angular app calls apisapcc.canac.ca (SAP Commerce OCC API) for cart ops.
    // These cross-origin API calls work from within the browser after Cloudflare warmup.
    console.error(`[Canac] Ajout au panier via API: code=${productCode} qty=${quantity}`);

    const cartResult = await page.evaluate(async ({ token, code, qty }: any) => {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };
      try {
        // Get a pickup store (required for delivery modes to work)
        let res = await fetch('https://apisapcc.canac.ca/occ/v2/canac/stores?fields=DEFAULT&pageSize=1', { headers });
        const storesData = res.ok ? await res.json() : {};
        const storeName = storesData.stores?.[0]?.name;

        // Create fresh cart (avoid stale state from previous orders)
        res = await fetch('https://apisapcc.canac.ca/occ/v2/canac/users/current/carts', { method: 'POST', headers });
        if (!res.ok) return { error: `create-cart: ${res.status}` };
        const cartCode = (await res.json()).code;

        // Add product with pickup store (Canac is pickup-only)
        const entry: any = { product: { code }, quantity: qty };
        if (storeName) entry.deliveryPointOfService = { name: storeName };
        res = await fetch(`https://apisapcc.canac.ca/occ/v2/canac/users/current/carts/${cartCode}/entries`, {
          method: 'POST', headers,
          body: JSON.stringify(entry),
        });
        const text = await res.text();
        return { status: res.status, cartCode, body: text.slice(0, 500) };
      } catch (e: any) { return { error: e.message }; }
    }, { token: accessToken, code: productCode, qty: quantity });

    if (cartResult.error) {
      console.error(`[Canac] Erreur panier: ${cartResult.error}`);
      return { success: false, error: `Canac cart: ${cartResult.error}` };
    }

    if (cartResult.status < 200 || cartResult.status >= 300) {
      console.error(`[Canac] Ajout échoué: status=${cartResult.status} body=${cartResult.body?.slice(0, 200)}`);
      return { success: false, error: `Canac add-to-cart: ${cartResult.status}` };
    }

    console.error(`[Canac] Ajouté au panier ✓ cart=${cartResult.cartCode}`);

    // ── Step 3: Checkout via OCC API (pickup in store) ────────────────────────
    // Canac is pickup-only — no home delivery. The checkout flow:
    // 1. Delete any delivery address (delivery modes are empty when address is set)
    // 2. Set delivery mode to "pickup" (Ramassage en magasin)
    // 3. Set payment details
    // 4. Place order
    if (!payment) {
      return { success: false, inCart: true };
    }

    console.error(`[Canac] Checkout via API (pickup): cart=${cartResult.cartCode}`);

    const checkoutResult = await page.evaluate(async ({ token, cartCode, pay }: any) => {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };
      const base = `https://apisapcc.canac.ca/occ/v2/canac/users/current/carts/${cartCode}`;

      try {
        // Step 1: Delete delivery address — Canac only offers pickup, and delivery
        // modes list is empty when a delivery address is set on the cart.
        await fetch(`${base}/addresses/delivery`, { method: 'DELETE', headers });

        // Step 2: Get delivery modes (should return "pickup")
        let res = await fetch(`${base}/deliverymodes?fields=DEFAULT`, { headers });
        if (!res.ok) return { error: `get-deliverymodes: ${res.status}` };
        const modes = await res.json();
        const pickupMode = modes.deliveryModes?.find((m: any) => m.code === 'pickup') || modes.deliveryModes?.[0];
        if (!pickupMode) return { error: 'no-delivery-modes' };

        // Step 3: Set delivery mode
        res = await fetch(`${base}/deliverymode?deliveryModeId=${encodeURIComponent(pickupMode.code)}`, {
          method: 'PUT', headers,
        });
        if (!res.ok) return { error: `set-deliverymode: ${res.status}` };

        // Step 4: Set payment details
        const [expMonth, expYear] = (pay.cardExpiry || '').split('/');
        res = await fetch(`${base}/paymentdetails`, {
          method: 'POST', headers,
          body: JSON.stringify({
            accountHolderName: pay.cardHolder,
            cardNumber: pay.cardNumber,
            cardType: { code: 'visa' },
            expiryMonth: expMonth || '01',
            expiryYear: `20${expYear || '30'}`,
            cvn: pay.cardCvv,
            billingAddress: {
              firstName: pay.cardHolder.split(' ')[0] || 'Client',
              lastName: pay.cardHolder.split(' ').slice(1).join(' ') || 'Client',
              line1: '123 rue Principale',
              town: 'Montréal',
              region: { isocode: 'CA-QC' },
              postalCode: 'H2X 1Y1',
              country: { isocode: 'CA' },
            },
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return { error: `set-payment: ${res.status} ${body.slice(0, 200)}` };
        }

        // Step 5: Place order
        res = await fetch(`https://apisapcc.canac.ca/occ/v2/canac/users/current/orders?cartId=${cartCode}&termsChecked=true`, {
          method: 'POST', headers,
        });
        const orderBody = await res.text();
        if (!res.ok) return { error: `place-order: ${res.status} ${orderBody.slice(0, 200)}` };

        const order = JSON.parse(orderBody);
        return { success: true, orderId: order.code || order.orderCode || null };
      } catch (e: any) { return { error: e.message }; }
    }, {
      token: accessToken,
      cartCode: cartResult.cartCode,
      pay: { cardHolder: payment.cardHolder, cardNumber: payment.cardNumber, cardExpiry: payment.cardExpiry, cardCvv: payment.cardCvv },
    });

    if (checkoutResult.error) {
      console.error(`[Canac] Checkout échoué: ${checkoutResult.error}`);
      return { success: false, inCart: true, error: `Canac checkout: ${checkoutResult.error}` };
    }

    console.error(`[Canac] Commande passée ✓ orderId=${checkoutResult.orderId}`);
    return { success: true, orderId: checkoutResult.orderId || undefined };
  } catch (err: any) {
    console.error('[Canac] Erreur:', err.message);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
