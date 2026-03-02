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

export async function loginToCanac(page: any, username: string, password: string): Promise<boolean> {
  // Real Canac domain is canac.ca (canac.com redirects to an unrelated US company)
  await page.goto('https://www.canac.ca/fr/connexion', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Didomi cookie consent banner
  const cookieBtn = page.locator('#didomi-notice-agree-button, button:has-text("Accepter & Fermer")').first();
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(800);
  }

  // Step 1: Click the header "Se connecter" button → opens account dialog
  // Use flexible selectors in case Canac updates class names
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

  // Step 2: Click "Se connecter ou créer un compte" inside the dialog → redirects to Auth0 (login.canac.ca)
  // If Auth0 already opened (some flows skip the dialog), skip this step
  const alreadyOnAuth0 = page.url().includes('login.canac.ca');
  if (!alreadyOnAuth0) {
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

  // Wait for Auth0 redirect to login.canac.ca (proxy adds latency — 30s)
  await page.waitForFunction(
    () => window.location.hostname.includes('login.canac.ca'),
    { timeout: 30000 }
  );
  await page.waitForTimeout(2000); // allow Auth0 React app to fully render

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

  await page.waitForFunction(
    () => !window.location.hostname.includes('login.canac.ca'),
    { timeout: 40000 }
  ).catch(() => {});
  await page.waitForTimeout(2000);

  const url = page.url();
  // Success = left Auth0 (login.canac.ca) and landed back on canac.ca.
  // SAP Commerce Cloud's OAuth flow always lands on /connexion first while establishing the session,
  // so we do NOT check for /connexion — leaving login.canac.ca is the real success signal.
  return url.includes('canac.ca') && !url.includes('login.canac.ca');
}

export async function testCanacConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser({ proxies: true });
  try {
    const page = await createCanacPage(browser);
    const loggedIn = await loginToCanac(page, username, password);
    if (loggedIn) return { success: true };
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
    const loggedIn = await loginToCanac(page, username, password);
    if (!loggedIn) return null;

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
    const loggedIn = await loginToCanac(page, username, password);
    if (!loggedIn) {
      console.error('[Canac] Login échoué');
      return { success: false, error: 'Login Canac échoué' };
    }

    // Navigate to a SAP CC page to establish session cookies for API calls.
    // Cloudflare Turnstile blocks Angular page rendering but does NOT block fetch() API
    // calls from within the authenticated browser session — this is the key bypass.
    const searchUrl = `https://www.canac.ca/canac/fr/2/search/${encodeURIComponent(product)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.error('[Canac] Session établie:', page.url());

    // ── Step 1: Search via SAP Commerce Cloud REST API ────────────────────────
    // Try progressively shorter queries until we find a match
    const queries = [
      product,
      product.split(' ').slice(0, 4).join(' '),
      product.split(' ').slice(0, 3).join(' '),
      product.split(' ').slice(0, 2).join(' '),
    ].filter((q, i, arr) => q.length >= 3 && arr.indexOf(q) === i);

    let productCode: string | null = null;
    let productName: string | null = null;

    for (const query of queries) {
      console.error(`[Canac] API search: "${query}"`);
      const searchResult = await page.evaluate(async (q: string) => {
        try {
          const url = `/canac/rest/v2/canac/products/search?query=${encodeURIComponent(q)}&lang=fr&curr=CAD&pageSize=5`;
          const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
          const data = await res.json();
          return { status: res.status, products: (data.products || []).slice(0, 3).map((p: any) => ({ code: p.code, name: p.name })) };
        } catch (e: any) { return { status: 0, error: e.message, products: [] }; }
      }, query);
      console.error(`[Canac] API search résultat: status=${searchResult.status} produits=${searchResult.products?.length ?? 0}`);
      if (searchResult.products?.length > 0) {
        productCode = searchResult.products[0].code;
        productName = searchResult.products[0].name;
        console.error(`[Canac] Produit: "${productName}" code=${productCode}`);
        break;
      }
    }

    if (!productCode) {
      console.error(`[Canac] Produit "${product}" introuvable via API`);
      return { success: false, error: `Produit "${product}" introuvable sur Canac` };
    }

    // ── Step 2: Get CSRF token (SAP CC requires it for POST requests) ─────────
    const csrfToken = await page.evaluate(async () => {
      try {
        const res = await fetch('/canac/rest/v2/canac/carts/current?lang=fr&curr=CAD', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        return res.headers.get('X-CSRF-Token') || '';
      } catch { return ''; }
    });
    console.error(`[Canac] CSRF token: ${csrfToken ? 'ok' : 'vide'}`);

    // ── Step 3: Add to cart via API ───────────────────────────────────────────
    const cartResult = await page.evaluate(async ({ code, qty, csrf }: { code: string; qty: number; csrf: string }) => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (csrf) headers['X-CSRF-Token'] = csrf;
        const res = await fetch('/canac/rest/v2/canac/carts/current/entries?lang=fr&curr=CAD', {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ product: { code }, quantity: qty }),
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
      } catch (e: any) { return { status: 0, error: e.message }; }
    }, { code: productCode, qty: quantity, csrf: csrfToken });

    console.error(`[Canac] Add to cart: status=${cartResult.status} data=${JSON.stringify(cartResult.data).slice(0, 150)}`);

    const cartSuccess = cartResult.status === 200 || cartResult.status === 201;
    if (!cartSuccess) {
      return { success: false, error: `Erreur ajout panier (${cartResult.status}): ${JSON.stringify(cartResult.data).slice(0, 100)}` };
    }

    console.error('[Canac] Ajouté au panier via API');

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
