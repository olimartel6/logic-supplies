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
  // homedepot.ca/myaccount is the correct entry point — /fr/accueil/connexion.html returns 404
  await page.goto('https://www.homedepot.ca/myaccount', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // OneTrust cookie consent banner
  const cookieBtn = page.locator('#onetrust-accept-btn-handler').first();
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(1000);
  }

  // Dismiss store picker modal — give it up to 5s to appear (slower on some sessions)
  const closeBtn = page.locator('button.acl-modal__close').first();
  if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1000);

  // Step 1: Fill email using type() with delay so React's onChange fires and enables the Sign In button.
  // The button starts with class "acl-button--is-disabled" and React removes it after detecting input.
  // Using fill() bypasses key events and leaves the button disabled.
  const emailField = page.locator('input[type="email"]').first();
  await emailField.waitFor({ timeout: 10000 });
  await emailField.click({ force: true });
  await emailField.type(username, { delay: 80 });
  await page.waitForTimeout(500);

  // Wait for Sign In button to become enabled (React removes is-disabled after valid input)
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[type="submit"]');
      return btn && !btn.className.includes('is-disabled');
    },
    { timeout: 5000 }
  ).catch(() => {});

  // Step 2: Click Sign In to submit email (two-step form: validates account first)
  const signInBtn = page.locator('button[type="submit"]').first();
  await signInBtn.click({ force: true });
  await page.waitForTimeout(8000);  // HD validates email server-side — can take several seconds

  // Step 3: Wait for password field — only appears if email is recognized by HD
  const passField = page.locator('input[type="password"]').first();
  const passVisible = await passField.isVisible({ timeout: 5000 }).catch(() => false);
  if (!passVisible) return false;

  await passField.click({ force: true });
  await passField.type(password, { delay: 60 });
  await page.waitForTimeout(400);
  await passField.press('Enter');

  // Wait for login to process (reCAPTCHA v3 runs in background, no manual challenge)
  await page.waitForTimeout(7000);

  // Success: sign-in inputs are gone (redirected to account page or SPA updated)
  const emailStillVisible = await page.locator('input[type="email"]').isVisible({ timeout: 1000 }).catch(() => false);
  const passStillVisible = await page.locator('input[type="password"]').isVisible({ timeout: 1000 }).catch(() => false);
  const loggedIn = !emailStillVisible && !passStillVisible;

  // 3. Save session cookies so future calls skip the login form
  if (loggedIn) {
    await saveHDCookies(context, username);
  }

  return loggedIn;
}

export async function testHomeDepotConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();

  let captchaDetected = false;

  try {
    const context = await createHDContext(browser);
    const page = await context.newPage();

    // Detect reCAPTCHA Enterprise challenge being triggered
    page.on('request', (req: any) => {
      const url = req.url();
      if (url.includes('recaptcha/enterprise/reload') || url.includes('recaptcha/api2/payload')) {
        captchaDetected = true;
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
  const browser = await createBrowserbaseBrowser();
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
  const browser = await createBrowserbaseBrowser();
  try {
    const context = await createHDContext(browser);
    const page = await context.newPage();
    const loggedIn = await loginToHomeDepot(page, username, password);
    if (!loggedIn) {
      console.error('[HomeDepot] Login échoué');
      return { success: false, error: 'Login Home Depot échoué' };
    }

    // Navigate to home page so the search bar is accessible
    await page.goto('https://www.homedepot.ca', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Search for the product
    const searchBar = page.locator('input[id="headerSearch"], input[name="Ntt"], input[placeholder*="Recherche"], input[placeholder*="Search"]').first();
    await searchBar.waitFor({ timeout: 8000 });
    await searchBar.click();
    await searchBar.type(product, { delay: 120 });
    await searchBar.press('Enter');
    await page.waitForTimeout(4000);
    console.error('[HomeDepot] Page résultats:', page.url());

    // Click first product result
    const firstProduct = page.locator(
      'a[data-automation-id="product-pod-link"], .product-pod--ie-fix a, [class*="product-pod"] a'
    ).first();
    if (!await firstProduct.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.error('[HomeDepot] Produit introuvable:', product);
      return { success: false, error: `Produit "${product}" introuvable sur Home Depot` };
    }
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
      console.error('[HomeDepot] Quantité définie:', quantity);
    }

    // Add to cart
    const addCartBtn = page.locator(
      'button:has-text("Ajouter au panier"), button:has-text("Add to Cart"), button[data-automation-id="add-to-cart"]'
    ).first();
    if (!await addCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.error('[HomeDepot] Bouton "Ajouter au panier" introuvable');
      return { success: false, error: 'Bouton "Ajouter au panier" introuvable sur Home Depot' };
    }
    await addCartBtn.click();
    await page.waitForTimeout(4000);

    // Verify cart was updated (look for confirmation toast or cart count)
    const cartConfirm = page.locator(
      '[class*="cart-confirm"], [class*="add-to-cart-confirm"], [aria-label*="panier"], [data-automation-id="cart-count"]'
    ).first();
    const confirmed = await cartConfirm.isVisible({ timeout: 3000 }).catch(() => false);
    console.error('[HomeDepot] Ajouté au panier, confirmation visible:', confirmed);

    // Save updated cookies after successful cart add
    await saveHDCookies(context, username);

    if (deliveryAddress && payment) {
      try {
        await page.goto('https://www.homedepot.ca/en/home/cart.html', { waitUntil: 'networkidle' });
        const checkoutBtn = page.locator('button:has-text("Checkout"), button:has-text("Passer à la caisse")').first();
        if (await checkoutBtn.isVisible({ timeout: 8000 })) {
          await checkoutBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        const addressField = page.locator('input[id*="address"], input[name*="address"]').first();
        if (await addressField.isVisible({ timeout: 8000 })) {
          await addressField.fill(deliveryAddress);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);
        }

        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Continuer")').first();
        if (await continueBtn.isVisible({ timeout: 5000 })) {
          await continueBtn.click();
          await page.waitForTimeout(2000);
        }

        const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[name*="card"]').first();
        const cardInput = cardFrame.locator('input').first();
        if (await cardInput.isVisible({ timeout: 8000 }).catch(() => false)) {
          await cardInput.fill(payment.cardNumber);
        } else {
          const directCard = page.locator('input[id*="cardNumber"], input[name*="cardNumber"]').first();
          if (await directCard.isVisible({ timeout: 3000 })) {
            await directCard.fill(payment.cardNumber);
          }
        }

        const expiryField = page.locator('input[id*="expiry"], input[name*="expiry"]').first();
        if (await expiryField.isVisible({ timeout: 3000 })) await expiryField.fill(payment.cardExpiry);

        const cvvField = page.locator('input[id*="cvv"], input[name*="cvv"]').first();
        if (await cvvField.isVisible({ timeout: 3000 })) await cvvField.fill(payment.cardCvv);

        const placeOrderBtn = page.locator('button:has-text("Place Order"), button:has-text("Passer la commande")').first();
        if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
          await placeOrderBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        const bodyText = await page.textContent('body');
        const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i);
        return { success: true, orderId: orderMatch?.[1] };
      } catch (err: any) {
        console.error('[HomeDepot] Checkout error:', err.message);
        return { success: false, inCart: true, error: `Checkout: ${err.message}` };
      }
    }

    return { success: false, inCart: true };
  } catch (err: any) {
    console.error('[HomeDepot] Erreur:', err.message);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
