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

// Guillevin migrated to Shopify's new Customer Accounts (shopify.com/<id>/account).
// New flow is 2-step: enter email → click Continue → enter password → submit.
// The page is a React SPA so we need extra time after domcontentloaded to render.
async function loginToGuillevin(page: any, username: string, password: string): Promise<boolean> {
  await page.goto('https://www.guillevin.com/account/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  // Extra wait for React SPA to render after shopify.com redirect
  await page.waitForTimeout(4000);

  // Step 1: email field (Shopify new accounts uses name="email")
  const emailField = page.locator([
    'input[name="email"]',
    'input[type="email"]',
    'input[id="email"]',
    'input#username',        // legacy Auth0 fallback
    'input[name="username"]',
  ].join(', ')).first();
  await emailField.waitFor({ timeout: 20000 });
  await emailField.click();
  await emailField.type(username, { delay: 60 });
  await page.waitForTimeout(300);

  // New Shopify accounts: click "Continue" to reveal the password field
  const continueBtn = page.locator([
    'button[type="submit"]:has-text("Continue")',
    'button[type="submit"]:has-text("Continuer")',
    'button:has-text("Continue")',
    'button:has-text("Continuer")',
  ].join(', ')).first();
  if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await continueBtn.click();
    await page.waitForTimeout(2000);
  }

  // Step 2: password field (appears after Continue, or on same page for legacy login)
  const passwordField = page.locator([
    'input[type="password"]',
    'input[name="password"]',
    'input#password',
  ].join(', ')).first();
  await passwordField.waitFor({ timeout: 15000 });
  await passwordField.click();
  await passwordField.type(password, { delay: 60 });
  await page.waitForTimeout(300);

  await passwordField.press('Enter');
  await page.waitForFunction(
    () => window.location.hostname.includes('guillevin.com'),
    { timeout: 25000 }
  ).catch(() => {});
  await page.waitForTimeout(2000);

  const url = page.url();
  return url.includes('guillevin.com') && !url.includes('login');
}

export async function testGuillevinConnection(username: string, password: string): Promise<ConnectionResult> {
  const browser = await createBrowserbaseBrowser();
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
  const browser = await createBrowserbaseBrowser();
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
  const browser = await createBrowserbaseBrowser();
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
            await page.goto('https://www.guillevin.com/cart', { waitUntil: 'networkidle' });
            const checkoutBtn = page.locator('button[name="checkout"], input[name="checkout"]').first();
            if (await checkoutBtn.isVisible({ timeout: 8000 })) {
              await checkoutBtn.click();
              await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
            }

            const addressField = page.locator('#checkout_shipping_address_address1').first();
            if (await addressField.isVisible({ timeout: 8000 })) {
              await addressField.fill(deliveryAddress);
            }

            const continueBtn = page.locator('#continue_button, button:has-text("Continue to shipping")').first();
            if (await continueBtn.isVisible({ timeout: 5000 })) {
              await continueBtn.click();
              await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
            }

            const shippingContinue = page.locator('button:has-text("Continue to payment")').first();
            if (await shippingContinue.isVisible({ timeout: 5000 })) {
              await shippingContinue.click();
              await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
            }

            const cardFrame = page.frameLocator('iframe[id*="card-fields-number"]').first();
            const cardInput = cardFrame.locator('input[placeholder*="Card number"]');
            if (await cardInput.isVisible({ timeout: 8000 }).catch(() => false)) {
              await cardInput.fill(payment.cardNumber);
              const expiryFrame = page.frameLocator('iframe[id*="card-fields-expiry"]').first();
              await expiryFrame.locator('input').first().fill(payment.cardExpiry);
              const cvvFrame = page.frameLocator('iframe[id*="card-fields-verification"]').first();
              await cvvFrame.locator('input').first().fill(payment.cardCvv);
            }

            const payBtn = page.locator('button[id="continue_button"]:has-text("Pay"), button:has-text("Complete order")').first();
            if (await payBtn.isVisible({ timeout: 5000 })) {
              await payBtn.click();
              await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
            }

            const bodyText = await page.textContent('body');
            const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i);
            return { success: true, orderId: orderMatch?.[1] };
          } catch (err: any) {
            console.error('[Guillevin] Checkout error:', err.message);
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
