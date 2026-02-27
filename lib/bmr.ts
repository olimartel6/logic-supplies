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
  const browser = await createBrowserbaseBrowser();
  try {
    const page = await createBmrPage(browser);
    const loggedIn = await loginToBmr(page, username, password);
    if (!loggedIn) return { success: false, error: 'Login BMR échoué' };

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
      await firstProduct.click();
      await page.waitForTimeout(2000);

      const qtyInput = page.locator('input#qty, input[name="qty"], input[title*="qty"]').first();
      if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type(quantity.toString(), { delay: 50 });
        await page.waitForTimeout(300);
      }

      const addToCartBtn = page.locator(
        'button#product-addtocart-button, button:has-text("Ajouter au panier"), button[class*="tocart"]'
      ).first();
      if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        console.error(`[BMR] Added to cart: ${product}`);
        return { success: false, inCart: true };
      }
    }

    return { success: false, error: `Produit "${product}" introuvable sur BMR` };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
