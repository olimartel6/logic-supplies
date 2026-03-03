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

  const emailField = page.locator('input#username').first();
  await emailField.waitFor({ timeout: 15000 });
  await emailField.click();
  await emailField.type(username, { delay: 50 });
  await page.waitForTimeout(300);

  const passField = page.locator('input#password').first();
  await passField.click();
  await passField.type(password, { delay: 50 });
  await page.waitForTimeout(400);

  await passField.press('Enter');

  // Wait for route interceptor to capture the OAuth code (up to 60s)
  for (let i = 0; i < 60 && !capturedCode; i++) {
    await page.waitForTimeout(1000);
    if (i > 0 && i % 10 === 0) {
      const url = page.url();
      const title = await page.title().catch(() => '?');
      console.error(`[Canac] Attente code OAuth t=${i}s url=${url.slice(0, 60)} titre="${title}"`);
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

export async function getCanacPrice(username: string, password: string, product: string): Promise<number | null> {
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const page = await createCanacPage(browser);
    const loginResult = await loginToCanac(page, username, password);
    if (!loginResult.success) return null;

    // Search for product (confirmed selector: placeholder contains "Rechercher")
    const searchBar = page.locator('input[placeholder*="Rechercher"]').first();
    await searchBar.waitFor({ timeout: 8000 });
    await searchBar.click();
    await searchBar.type(product, { delay: 100 });
    await page.waitForTimeout(2000);

    // Try to find price in search results / autocomplete
    const priceEl = page.locator('[class*="price"], [class*="prix"], .product-price, [data-price]').first();
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
    if (!loginResult.success) {
      console.error('[Canac] Login échoué');
      return { success: false, error: 'Login Canac échoué' };
    }
    // Browser is on /canac/fr/2 with fresh cf_clearance.
    // Cloudflare's WAF blocks Sec-Fetch-Mode:cors (fetch/XHR) to /canac/rest/v2/ even
    // with a valid cf_clearance, but allows Sec-Fetch-Mode:navigate (page.goto).
    // All operations below use full page navigation to avoid this WAF rule.

    // ── Step 1: Search via direct REST API navigation (Sec-Fetch-Mode:navigate) ──
    // page.goto to /canac/rest/v2/ passes Cloudflare Bot Management (navigate mode).
    // The browser receives raw JSON which we read from document.body.innerText.
    const queries = [
      product,
      product.split(' ').slice(0, 4).join(' '),
      product.split(' ').slice(0, 3).join(' '),
      product.split(' ').slice(0, 2).join(' '),
    ].filter((q, i, arr) => q.length >= 3 && arr.indexOf(q) === i);

    let productCode: string | null = null;
    let productName: string | null = null;

    for (const query of queries) {
      console.error(`[Canac] Recherche API: "${query}"`);
      await page.goto(
        `https://www.canac.ca/canac/rest/v2/canac/products/search?query=${encodeURIComponent(query)}&lang=fr&curr=CAD&pageSize=5`,
        { waitUntil: 'domcontentloaded', timeout: 30000 },
      ).catch(() => {});

      const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      const cfBlocked = bodyText.includes('Just a moment') || bodyText.includes('Un instant') || bodyText.includes('Attention Required');
      const isJson = bodyText.trimStart().startsWith('{');
      console.error(`[Canac] API response: CF-blocked=${cfBlocked} isJson=${isJson} preview="${bodyText.slice(0, 120).replace(/\n/g, ' ')}"`);

      if (cfBlocked || !isJson) { continue; }

      try {
        const data = JSON.parse(bodyText);
        const hits = (data.products || []).slice(0, 3).map((p: any) => ({ code: p.code, name: p.name || p.summary || '' })).filter((p: any) => p.code && p.name);
        console.error(`[Canac] Résultats: ${hits.length} produit(s)`);
        if (hits.length > 0) {
          productCode = hits[0].code;
          productName = hits[0].name;
          console.error(`[Canac] Produit: "${productName}" code=${productCode}`);
          break;
        }
      } catch { /* JSON parse failed — body wasn't real JSON */ }
    }

    if (!productCode) {
      console.error(`[Canac] Produit "${product}" introuvable`);
      return { success: false, error: `Produit "${product}" introuvable sur Canac` };
    }

    // ── Step 2: Add to cart via product page UI ───────────────────────────────
    // Navigate to the product page and click "Ajouter au panier".
    // page.goto (Sec-Fetch-Mode:navigate) passes Cloudflare; fetch() does not.
    console.error(`[Canac] Navigation page produit: /canac/fr/p/${productCode}`);
    await page.goto(
      `https://www.canac.ca/canac/fr/p/${productCode}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    ).catch(() => {});

    // Set quantity if > 1
    if (quantity > 1) {
      const qtyInput = page.locator('cx-item-counter input').first();
      if (await qtyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await qtyInput.fill(String(quantity));
        await page.waitForTimeout(500);
      }
    }

    const addToCartBtn = page.locator([
      'cx-add-to-cart button[type="submit"]',
      'button:has-text("Ajouter au panier")',
      'button:has-text("Add to Cart")',
    ].join(', ')).first();

    const btnVisible = await addToCartBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (!btnVisible) {
      console.error('[Canac] Bouton "Ajouter au panier" introuvable');
      return { success: false, error: 'Bouton "Ajouter au panier" introuvable' };
    }
    await addToCartBtn.click();
    await page.waitForTimeout(3000);

    // Confirm cart dialog appeared
    const cartConfirmed = await page.locator([
      '.cx-dialog-title',
      '[class*="added-to-cart"]',
      'cx-added-to-cart-dialog',
    ].join(', ')).first().isVisible({ timeout: 8000 }).catch(() => false);
    console.error(`[Canac] Ajouté au panier: ${cartConfirmed ? 'confirmé ✓' : 'incertain (bouton cliqué)'}`);

    // ── Step 4: Checkout (only if delivery address + payment provided) ────────
    if (deliveryAddress && payment) {
      try {
        await page.goto('https://www.canac.ca/fr/panier', { waitUntil: 'networkidle' });
        const checkoutBtn = page.locator('a:has-text("Commander"), button:has-text("Passer la commande")').first();
        if (await checkoutBtn.isVisible({ timeout: 8000 })) {
          await checkoutBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        const addressField = page.locator('input[name="address1"], input[formcontrolname*="address"]').first();
        if (await addressField.isVisible({ timeout: 5000 })) {
          await addressField.fill(deliveryAddress);
        }
        const continueBtn = page.locator('button[type="submit"]:has-text("Continuer"), cx-place-order button').first();
        if (await continueBtn.isVisible({ timeout: 5000 })) {
          await continueBtn.click();
          await page.waitForTimeout(2000);
        }

        const cardField = page.locator('input[name*="card"], input[placeholder*="carte"]').first();
        if (await cardField.isVisible({ timeout: 8000 })) {
          await cardField.fill(payment.cardNumber);
        }
        const expiryField = page.locator('input[name*="expir"]').first();
        if (await expiryField.isVisible({ timeout: 3000 })) {
          await expiryField.fill(payment.cardExpiry);
        }
        const cvvField = page.locator('input[name*="cvv"], input[name*="cvc"]').first();
        if (await cvvField.isVisible({ timeout: 3000 })) {
          await cvvField.fill(payment.cardCvv);
        }

        const submitBtn = page.locator('cx-place-order button[type="submit"], button:has-text("Confirmer la commande")').first();
        if (await submitBtn.isVisible({ timeout: 5000 })) {
          await submitBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        const bodyText = await page.textContent('body');
        const orderMatch = bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i);
        return { success: true, orderId: orderMatch?.[1] };
      } catch (err: any) {
        console.error('[Canac] Checkout error:', err.message);
        return { success: false, inCart: true, error: `Checkout: ${err.message}` };
      }
    }

    return { success: false, inCart: true };
  } catch (err: any) {
    console.error('[Canac] Erreur:', err.message);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
