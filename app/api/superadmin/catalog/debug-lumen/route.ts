import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/tenant';
import { createBrowserbaseBrowser } from '@/lib/browser';
import { getDb } from '@/lib/db';
import { decrypt } from '@/lib/encrypt';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Debug endpoint: logs in to Lumen, navigates to a category page,
 * captures screenshots, network requests, and DOM structure.
 * GET /api/superadmin/catalog/debug-lumen
 */
export async function GET() {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const db = getDb();
  const account = db.prepare(
    "SELECT * FROM supplier_accounts WHERE supplier = 'lumen' AND active = 1 LIMIT 1"
  ).get() as any;
  if (!account) return NextResponse.json({ error: 'Aucun compte Lumen configuré' });

  const password = decrypt(account.password_encrypted);
  const log: string[] = [];
  const apiCalls: { url: string; status: number; body?: string }[] = [];

  let browser;
  try {
    browser = await createBrowserbaseBrowser();

    // Create stealth context
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
    const page = await context.newPage();

    // Intercept ALL network requests to find price APIs
    page.on('response', async (res: any) => {
      const url = res.url();
      // Capture API/JSON calls
      if (
        url.includes('api') || url.includes('price') || url.includes('product') ||
        url.includes('dxpapi') || url.includes('bloomreach') || url.includes('search') ||
        url.includes('additemtocart') || url.includes('cart')
      ) {
        let body = '';
        try {
          const ct = res.headers()['content-type'] || '';
          if (ct.includes('json') || ct.includes('html')) {
            body = (await res.text()).slice(0, 2000);
          }
        } catch {}
        apiCalls.push({ url: url.slice(0, 300), status: res.status(), body });
      }
    });

    // Step 1: Login
    log.push('Step 1: Going to login page...');
    await page.goto('https://www.lumen.ca/en/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Cookie consent
    const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accepter tout"), button:has-text("Accepter")').first();
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(800);
      log.push('Cookie consent dismissed');
    }

    const loginForm = page.locator('form:has(input[type="password"])').first();
    await loginForm.waitFor({ timeout: 10000 });

    const usernameField = loginForm.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
    await usernameField.click();
    await usernameField.type(account.username, { delay: 60 });
    await page.waitForTimeout(400);

    const passwordField = loginForm.locator('input[type="password"]').first();
    await passwordField.click();
    await passwordField.type(password, { delay: 60 });
    await page.waitForTimeout(400);

    await passwordField.press('Enter');
    await page.waitForTimeout(6000);

    // Verify login
    await page.goto('https://www.lumen.ca/en/account', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    const afterLoginUrl = page.url();
    const loggedIn = !afterLoginUrl.includes('/login');
    log.push(`Login: ${loggedIn ? 'SUCCESS' : 'FAILED'} (URL: ${afterLoginUrl})`);

    // Save screenshot
    const screenshotDir = join(process.cwd(), 'public');
    await page.screenshot({ path: join(screenshotDir, 'debug-lumen-1-login.png') });

    if (!loggedIn) {
      return NextResponse.json({ log, apiCalls, loggedIn: false, error: 'Login failed' });
    }

    // Step 2: Navigate to a category page
    log.push('Step 2: Navigating to Wire category...');
    apiCalls.length = 0; // Reset to capture only category page calls
    await page.goto('https://www.lumen.ca/en/products/28-wire-cords-cables', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: join(screenshotDir, 'debug-lumen-2-category.png') });
    log.push(`Category page URL: ${page.url()}`);

    // Check what's on the page
    const categoryPageInfo = await page.evaluate(() => {
      const info: Record<string, any> = {};
      // Product links
      info.productLinks_p = document.querySelectorAll('a[href*="/p-"]').length;
      info.productLinks_detail = document.querySelectorAll('a[href*="/products/detail"]').length;
      info.productLinks_any = document.querySelectorAll('a[href*="/product"]').length;
      // Price elements
      info.priceElements = document.querySelectorAll('[class*="price"], [class*="Price"]').length;
      info.dollarSigns = Array.from(document.querySelectorAll('*')).filter(
        el => el.children.length === 0 && el.textContent?.includes('$')
      ).length;
      // Product cards/containers
      info.productCards = document.querySelectorAll('[class*="product"], [class*="Product"]').length;
      info.articles = document.querySelectorAll('article').length;
      info.forms = document.querySelectorAll('form[action*="cart"]').length;
      // Subcategory links
      info.subcategoryLinks = document.querySelectorAll('a[href*="/en/products/28-"]').length;
      // Visible text with $
      info.priceTexts = Array.from(document.querySelectorAll('*'))
        .filter(el => el.children.length === 0 && el.textContent?.includes('$') && (el.textContent?.length || 0) < 50)
        .slice(0, 10)
        .map(el => ({ text: el.textContent?.trim(), tag: el.tagName, cls: (el as HTMLElement).className?.slice(0, 80) }));
      return info;
    });
    log.push(`Category page info: ${JSON.stringify(categoryPageInfo, null, 2)}`);

    // Step 3: Navigate deeper — to a leaf category
    log.push('Step 3: Navigating to a leaf category (building wire)...');
    apiCalls.length = 0;
    await page.goto('https://www.lumen.ca/en/products/28-wire-cords-cables/115-building-wire', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    // Scroll to trigger lazy loading
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: join(screenshotDir, 'debug-lumen-3-subcategory.png') });

    const leafPageInfo = await page.evaluate(() => {
      const info: Record<string, any> = {};
      info.productLinks_p = document.querySelectorAll('a[href*="/p-"]').length;
      info.productLinks_detail = document.querySelectorAll('a[href*="/products/detail"]').length;
      info.priceElements = document.querySelectorAll('[class*="price"], [class*="Price"]').length;
      info.dollarSigns = Array.from(document.querySelectorAll('*')).filter(
        el => el.children.length === 0 && el.textContent?.includes('$')
      ).length;
      info.productCards = document.querySelectorAll('[class*="product"], [class*="Product"]').length;
      info.forms = document.querySelectorAll('form[action*="cart"]').length;
      info.addCartBtns = document.querySelectorAll('.add-cart, [class*="add-to-cart"], button[class*="cart"]').length;
      // Dump first 500 chars of main content
      const main = document.querySelector('main, [role="main"], .main-content, #content') || document.body;
      info.mainContentSnippet = main.innerHTML.slice(0, 3000);
      // All visible text with prices
      info.priceTexts = Array.from(document.querySelectorAll('*'))
        .filter(el => el.children.length === 0 && el.textContent?.includes('$') && (el.textContent?.length || 0) < 50)
        .slice(0, 20)
        .map(el => ({
          text: el.textContent?.trim(),
          tag: el.tagName,
          cls: (el as HTMLElement).className?.slice(0, 100),
          parent: el.parentElement?.tagName,
          parentCls: (el.parentElement as HTMLElement)?.className?.slice(0, 100),
        }));
      return info;
    });
    log.push(`Leaf page info: ${JSON.stringify(leafPageInfo, null, 2)}`);

    // Step 4: Test the search typeahead
    log.push('Step 4: Testing search typeahead...');
    await page.goto('https://www.lumen.ca/en', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const searchBar = page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="Rechercher"]').first();
    await searchBar.click();
    await searchBar.type('nmd90', { delay: 100 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: join(screenshotDir, 'debug-lumen-4-typeahead.png') });

    const typeaheadInfo = await page.evaluate(() => {
      const info: Record<string, any> = {};
      info.priceElements = document.querySelectorAll('[class*="price"], [class*="Price"]').length;
      info.forms = document.querySelectorAll('form[action*="cart"], form[action*="additem"]').length;
      info.addCartBtns = document.querySelectorAll('.add-cart, [class*="add-to-cart"]').length;
      info.priceTexts = Array.from(document.querySelectorAll('*'))
        .filter(el => el.children.length === 0 && el.textContent?.includes('$') && (el.textContent?.length || 0) < 50)
        .slice(0, 20)
        .map(el => ({
          text: el.textContent?.trim(),
          tag: el.tagName,
          cls: (el as HTMLElement).className?.slice(0, 100),
        }));
      // Dump the typeahead dropdown HTML
      const dropdowns = document.querySelectorAll('[class*="dropdown"], [class*="suggest"], [class*="autocomplete"], [class*="typeahead"], [class*="search-result"], [class*="search_result"]');
      info.dropdownCount = dropdowns.length;
      if (dropdowns.length > 0) {
        info.dropdownHtml = Array.from(dropdowns).map(d => d.innerHTML.slice(0, 2000));
      }
      return info;
    });
    log.push(`Typeahead info: ${JSON.stringify(typeaheadInfo, null, 2)}`);

    // Return captured API calls
    const relevantCalls = apiCalls.filter(c => c.body || c.url.includes('price') || c.url.includes('dxpapi'));

    return NextResponse.json({
      loggedIn: true,
      log,
      apiCalls: relevantCalls.slice(0, 20),
      categoryPageInfo,
      leafPageInfo: {
        ...leafPageInfo,
        mainContentSnippet: leafPageInfo.mainContentSnippet?.slice(0, 1500),
      },
      typeaheadInfo,
      screenshots: [
        '/debug-lumen-1-login.png',
        '/debug-lumen-2-category.png',
        '/debug-lumen-3-subcategory.png',
        '/debug-lumen-4-typeahead.png',
      ],
    });
  } catch (err: any) {
    log.push(`Error: ${err.message}`);
    return NextResponse.json({ error: err.message, log, apiCalls });
  } finally {
    if (browser) await browser.close();
  }
}
