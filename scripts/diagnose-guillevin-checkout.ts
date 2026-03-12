/**
 * Diagnostic script: connect to Guillevin checkout via Browserbase and dump the DOM
 * Usage: npx tsx scripts/diagnose-guillevin-checkout.ts
 */
import { chromium } from 'playwright';
import Browserbase from '@browserbasehq/sdk';
import crypto from 'crypto';

// Load .env.local manually
import fs from 'fs';
const envContent = fs.readFileSync('.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const ALGORITHM = 'aes-256-gcm';
function decrypt(encoded: string): string {
  const rawKey = process.env.ENCRYPTION_KEY || 'sparky-encryption-key-32-chars!!';
  const key = Buffer.from(rawKey.padEnd(32).slice(0, 32));
  const [ivHex, tagHex, encryptedHex] = encoded.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

async function main() {
  // Get credentials from SQLite DB
  const Database = (await import('better-sqlite3')).default;
  const path = (await import('path')).default;
  const dbPath = path.join(process.cwd(), 'sparky.db');
  const db = new Database(dbPath);

  const account = db.prepare("SELECT username, password_encrypted FROM supplier_accounts WHERE supplier = 'guillevin' AND active = 1 LIMIT 1").get() as any;
  if (!account) {
    console.error('No active Guillevin account found');
    process.exit(1);
  }
  const password = decrypt(account.password_encrypted);
  console.log(`Using account: ${account.username}`);

  // Create Browserbase session
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    timeout: 600,
    proxies: true,
  });
  console.log(`Browserbase session: ${session.id}`);
  console.log(`Live view: https://www.browserbase.com/sessions/${session.id}`);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    extraHTTPHeaders: { 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    viewport: { width: 1280, height: 800 },
  });

  // Auto-accept Didomi
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    const w = window as any;
    w.didomiConfig = w.didomiConfig || {};
    w.didomiConfig.user = { externalConsent: { value: 'all', type: 'all' } };
    w.didomiOnReady = w.didomiOnReady || [];
    w.didomiOnReady.push(function(D: any) { try { D.setUserAgreeToAll(); } catch {} });
  });
  await context.addCookies([{
    name: 'didomi_token',
    value: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9',
    domain: '.guillevin.com', path: '/',
  }]);

  const page = await context.newPage();

  // Step 1: Login
  console.log('\n=== STEP 1: LOGIN ===');
  await page.goto('https://www.guillevin.com/account/login', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Cloudflare warmup
  for (let i = 0; i < 60; i++) {
    const url = page.url();
    if (url.includes('auth0') || url.includes('account')) break;
    console.log(`  CF warmup ${i}: ${url}`);
    await page.waitForTimeout(2000);
  }

  // Wait for Auth0
  console.log(`  URL after warmup: ${page.url()}`);
  if (page.url().includes('auth0')) {
    await page.waitForSelector('input#username', { timeout: 15000 });
    await page.fill('input#username', account.username);
    await page.fill('input#password', password);
    const continueBtn = page.locator('button[type="submit"], button:has-text("Continuer"), button:has-text("Continue")').first();
    await continueBtn.click();
    await page.waitForTimeout(8000);
    console.log(`  Post-login URL: ${page.url()}`);
  }

  // Handle Didomi
  const didomiBtn = page.locator('#didomi-notice-agree-button, button:has-text("Accepter"), button:has-text("Accept")').first();
  if (await didomiBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await didomiBtn.click();
    console.log('  Didomi accepted');
  }

  // Handle region popup
  console.log('\n=== HANDLING REGION POPUP ===');
  const regionVisible = await page.locator('text="Select your region"').isVisible({ timeout: 5000 }).catch(() => false);
  if (regionVisible) {
    const selects = await page.locator('select').count();
    console.log(`  Found ${selects} <select> elements`);
    for (let i = 0; i < selects; i++) {
      const opts = await page.locator('select').nth(i).locator('option').allTextContents().catch(() => []);
      console.log(`  Select[${i}] options: ${opts.join(', ')}`);
      const qc = opts.find(o => o.toLowerCase().includes('québec') || o.toLowerCase().includes('quebec'));
      if (qc) {
        await page.locator('select').nth(i).selectOption({ label: qc });
        console.log(`  Selected: ${qc}`);
      }
    }
    const startBtn = page.locator('button:has-text("Start Shopping")').first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(2000);
    }
  } else {
    console.log('  No region popup');
  }

  // Step 2: Search and add to cart
  console.log('\n=== STEP 2: ADD TO CART ===');
  const searchQuery = 'CONDUIT EMT 1-1/2';
  const apiUrl = `https://www.guillevin.com/search/suggest.json?q=${encodeURIComponent(searchQuery)}&resources[type]=product&resources[limit]=3`;
  const resp = await fetch(apiUrl);
  const data = await resp.json();
  const productMatch = data?.resources?.results?.products?.[0];
  if (!productMatch) {
    console.error('  Product not found via API');
    await browser.close();
    process.exit(1);
  }
  console.log(`  Found: "${productMatch.title}" → ${productMatch.url}`);

  await page.goto(`https://www.guillevin.com${productMatch.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Handle region popup again
  if (await page.locator('text="Select your region"').isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const sel of Array.from(selects)) {
        const qc = Array.from(sel.options).find(o => o.text.toLowerCase().includes('québec') || o.text.toLowerCase().includes('quebec'));
        if (qc) { sel.value = qc.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    });
    const startBtn = page.locator('button:has-text("Start Shopping")').first();
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Use Shopify AJAX API to add to cart (more reliable than UI clicks)
  const variantId = await page.evaluate(() => {
    // Get the first available variant ID from the product page
    const hiddenId = document.querySelector('input[name="id"]') as HTMLInputElement;
    if (hiddenId) return hiddenId.value;
    // Fallback: look in Shopify product JSON
    const scriptTags = Array.from(document.querySelectorAll('script[type="application/json"]'));
    for (const s of scriptTags) {
      try {
        const data = JSON.parse(s.textContent || '');
        if (data.variants?.[0]?.id) return String(data.variants[0].id);
      } catch {}
    }
    return null;
  });
  console.log(`  Variant ID: ${variantId}`);

  if (variantId) {
    // Add to cart via AJAX API
    const addResult = await page.evaluate(async (vid: string) => {
      const resp = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: parseInt(vid), quantity: 10 }] }),
      });
      return { status: resp.status, body: await resp.json().catch(() => resp.text()) };
    }, variantId);
    console.log(`  Add to cart result: ${JSON.stringify(addResult).slice(0, 200)}`);
  }

  // Step 3: Go directly to checkout (skip cart page)
  console.log('\n=== STEP 3: CHECKOUT ===');
  // Navigate to cart first to trigger Shopify checkout redirect
  await page.goto('https://www.guillevin.com/cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Verify cart has items
  const cartCount = await page.evaluate(() => {
    const cartEl = document.querySelector('cart-component, [data-count]');
    return cartEl?.getAttribute('data-count') || 'unknown';
  });
  console.log(`  Cart count: ${cartCount}`);

  // Click checkout
  const checkoutBtn = page.locator('button[name="checkout"], input[name="checkout"], a[href*="checkout"]').first();
  if (await checkoutBtn.isVisible({ timeout: 8000 })) {
    await checkoutBtn.click();
    console.log('  Clicked checkout button');
    // Wait for Shopify checkout to load
    await page.waitForTimeout(10000);
    console.log(`  Checkout URL: ${page.url()}`);
  } else {
    console.log('  Checkout button not found, trying direct URL');
    // Try going to checkout directly
    await page.goto('https://www.guillevin.com/checkout', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`  Direct checkout URL: ${page.url()}`);
  }

  // Step 4: Click the "Ship to" collapsible and dump what appears
  console.log('\n=== STEP 4: ADDRESS PANEL INSPECTION ===');
  await page.waitForTimeout(2000);

  const shipToBtn = page.locator('#deliveryAddress-collapsible, button:has-text("Ship to")').first();
  if (await shipToBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    const beforeExpanded = await shipToBtn.getAttribute('aria-expanded');
    console.log(`  Ship-to button found, aria-expanded=${beforeExpanded}`);
    console.log(`  Text: ${(await shipToBtn.textContent().catch(() => '') ?? '').trim().slice(0, 100)}`);

    // Click to expand
    if (beforeExpanded !== 'true') {
      await shipToBtn.click();
      await page.waitForTimeout(3000);
      const afterExpanded = await shipToBtn.getAttribute('aria-expanded');
      console.log(`  After click, aria-expanded=${afterExpanded}`);
    }

    // Take screenshot of expanded state
    await page.screenshot({ path: 'debug-address-expanded.png', fullPage: true });

    // Dump EVERYTHING that's now visible - the full expanded panel content
    const expandedContent = await page.evaluate(() => {
      // Look for the panel controlled by the collapsible
      const controlId = document.querySelector('#deliveryAddress-collapsible')?.getAttribute('aria-controls');
      const panel = controlId ? document.getElementById(controlId) : null;

      // Dump all visible interactive elements on the page
      const allVisible = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && (el as HTMLElement).offsetHeight > 0;
      });

      // Find elements that appeared (address-related)
      const addressRelated = allVisible.filter(el => {
        const text = el.textContent?.toLowerCase() || '';
        const cls = el.className?.toString()?.toLowerCase() || '';
        const id = el.id?.toLowerCase() || '';
        return (text.includes('address') || text.includes('adress') || text.includes('ship') ||
                text.includes('location') || text.includes('livr') || cls.includes('address') ||
                id.includes('address') || id.includes('delivery'));
      }).filter(el => el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'A' ||
                      el.tagName === 'BUTTON' || el.getAttribute('role') === 'radio' ||
                      el.getAttribute('role') === 'option' || el.getAttribute('role') === 'listbox' ||
                      el.tagName === 'LI' || el.tagName === 'LABEL');

      const result = addressRelated.map(el => ({
        tag: el.tagName,
        id: el.id,
        role: el.getAttribute('role'),
        text: el.textContent?.trim()?.slice(0, 120),
        className: el.className?.toString()?.slice(0, 100),
        href: (el as HTMLAnchorElement).href?.slice(0, 150),
        type: (el as HTMLInputElement).type,
        name: (el as HTMLInputElement).name,
        'aria-selected': el.getAttribute('aria-selected'),
        'data-*': Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value?.slice(0, 50)}`).join(', '),
      }));

      // Also get the panel HTML if found
      const panelHtml = panel?.outerHTML?.slice(0, 5000) || '';

      // Get the full HTML around #deliveryAddress section
      const deliverySection = document.querySelector('#deliveryAddress');
      const sectionHtml = deliverySection?.outerHTML?.slice(0, 5000) || '';

      return { panel: panelHtml, section: sectionHtml, addressElements: result.slice(0, 30) };
    });

    console.log('\n--- PANEL HTML ---');
    console.log(expandedContent.panel?.slice(0, 3000) || 'NO PANEL FOUND');

    console.log('\n--- DELIVERY ADDRESS SECTION HTML ---');
    console.log(expandedContent.section?.slice(0, 3000) || 'NO SECTION FOUND');

    console.log('\n--- ADDRESS-RELATED VISIBLE ELEMENTS ---');
    for (const el of expandedContent.addressElements || []) {
      console.log(JSON.stringify(el));
    }
  } else {
    console.log('  Ship-to button NOT found');
  }

  // Step 4b: Click "Use a different address" and inspect what appears
  console.log('\n=== STEP 4B: CLICK USE DIFFERENT ADDRESS ===');
  const diffAddrBtn = page.locator(
    'a:has-text("Use a different address"), button:has-text("Use a different address"), ' +
    'a:has-text("different address"), button:has-text("different address")'
  ).first();
  if (await diffAddrBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Found "Use a different address" button');
    await diffAddrBtn.click();
    console.log('  Clicked it, waiting 5s...');
    await page.waitForTimeout(5000);
    console.log(`  URL after click: ${page.url()}`);

    await page.screenshot({ path: 'debug-after-use-different-address.png', fullPage: true });

    // Dump all form elements now visible
    const afterClickDump = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea')).filter(el => {
        return (el as HTMLElement).offsetHeight > 0;
      }).map(el => ({
        tag: el.tagName, id: el.id, name: (el as any).name, type: (el as any).type,
        placeholder: (el as any).placeholder?.slice(0, 50),
        autocomplete: el.getAttribute('autocomplete'),
        value: (el as any).value?.slice(0, 30),
        className: el.className?.toString()?.slice(0, 80),
      }));
      return { url: location.href, inputs };
    });

    console.log(`\n  URL: ${afterClickDump.url}`);
    console.log('\n  VISIBLE INPUTS AFTER "Use different address":');
    for (const inp of afterClickDump.inputs) {
      console.log(`  ${JSON.stringify(inp)}`);
    }
  } else {
    console.log('  "Use a different address" NOT found');
    // Log all visible buttons/links
    const allBtns = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, button')).filter(el => {
        return (el as HTMLElement).offsetHeight > 0 && el.textContent?.trim();
      }).map(el => ({
        tag: el.tagName, text: el.textContent?.trim()?.slice(0, 80),
        href: (el as HTMLAnchorElement).href?.slice(0, 100),
      })).slice(0, 20);
    }).catch(() => []);
    for (const btn of allBtns) {
      console.log(`  ${JSON.stringify(btn)}`);
    }
  }

  // Step 5: DUMP THE ENTIRE CHECKOUT DOM (renamed from step 4)
  console.log('\n=== STEP 4: CHECKOUT DOM ANALYSIS ===');
  await page.waitForTimeout(3000);

  // Dump all form elements
  const formDump = await page.evaluate(() => {
    const result: any = {};

    // All inputs
    result.inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      tag: el.tagName,
      type: (el as HTMLInputElement).type,
      id: el.id,
      name: (el as HTMLInputElement).name,
      placeholder: (el as HTMLInputElement).placeholder,
      className: el.className?.toString()?.slice(0, 100),
      value: (el as HTMLInputElement).value?.slice(0, 50),
      autocomplete: el.getAttribute('autocomplete'),
      'aria-label': el.getAttribute('aria-label'),
    }));

    // All selects with options
    result.selects = Array.from(document.querySelectorAll('select')).map(sel => ({
      id: sel.id,
      name: sel.name,
      className: sel.className?.toString()?.slice(0, 100),
      'aria-label': sel.getAttribute('aria-label'),
      options: Array.from(sel.options).map(o => ({
        text: o.text?.slice(0, 80),
        value: o.value?.slice(0, 80),
        selected: o.selected,
      })),
    }));

    // All iframes
    result.iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
      id: f.id,
      name: f.name,
      src: f.src?.slice(0, 120),
      title: f.title,
      className: f.className?.toString()?.slice(0, 100),
      'aria-label': f.getAttribute('aria-label'),
    }));

    // All clickable elements (buttons, links, etc.)
    result.clickables = Array.from(document.querySelectorAll('a, button, [role="button"], summary, details, [role="radio"], [role="combobox"], [role="listbox"]')).map(el => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      text: el.textContent?.trim()?.slice(0, 100),
      className: el.className?.toString()?.slice(0, 100),
      href: (el as HTMLAnchorElement).href?.slice(0, 120),
      id: el.id,
      'aria-label': el.getAttribute('aria-label'),
      'aria-expanded': el.getAttribute('aria-expanded'),
      open: (el as HTMLDetailsElement).open,
    }));

    // Ship to section HTML
    const shipToEl = document.querySelector('[class*="ship"], [class*="Ship"], [data-shipping]');
    result.shipToHtml = shipToEl?.outerHTML?.slice(0, 3000) || 'not found';

    // Payment section HTML
    const paymentEl = document.querySelector('[class*="payment" i], [class*="Payment"], [data-payment]');
    result.paymentHtml = paymentEl?.outerHTML?.slice(0, 3000) || 'not found';

    // Full main content for analysis
    const main = document.querySelector('main, [role="main"], #content, .content');
    result.mainHtml = (main || document.body).innerHTML?.slice(0, 8000);

    return result;
  });

  console.log('\n--- INPUTS ---');
  for (const inp of formDump.inputs || []) {
    console.log(JSON.stringify(inp));
  }

  console.log('\n--- SELECTS (with options) ---');
  for (const sel of formDump.selects || []) {
    console.log(JSON.stringify(sel));
  }

  console.log('\n--- IFRAMES ---');
  for (const f of formDump.iframes || []) {
    console.log(JSON.stringify(f));
  }

  console.log('\n--- CLICKABLES (relevant) ---');
  for (const c of formDump.clickables || []) {
    const text = c.text?.toLowerCase() || '';
    if (text.includes('ship') || text.includes('address') || text.includes('pay') ||
        text.includes('livr') || text.includes('adress') || text.includes('card') ||
        text.includes('carte') || text.includes('continu') || text.includes('change') ||
        text.includes('modif') || text.includes('edit') || c.role === 'radio' ||
        c.role === 'combobox' || c.role === 'listbox' || c.tag === 'SUMMARY' ||
        c.tag === 'DETAILS') {
      console.log(JSON.stringify(c));
    }
  }

  console.log('\n--- SHIP TO HTML ---');
  console.log(formDump.shipToHtml?.slice(0, 2000));

  console.log('\n--- PAYMENT HTML ---');
  console.log(formDump.paymentHtml?.slice(0, 2000));

  console.log('\n--- MAIN CONTENT (first 4000 chars) ---');
  console.log(formDump.mainHtml?.slice(0, 4000));

  // Also dump what's INSIDE the card iframes
  console.log('\n--- CARD IFRAME CONTENTS ---');
  for (const f of formDump.iframes || []) {
    if (f.id || f.src?.includes('card') || f.title?.toLowerCase().includes('card') || f.title?.toLowerCase().includes('name')) {
      console.log(`\nIframe: id="${f.id}" title="${f.title}" src="${f.src}"`);
      try {
        const frame = page.frameLocator(`iframe[id="${f.id}"]`).first();
        const inputs = frame.locator('input');
        const count = await inputs.count().catch(() => 0);
        console.log(`  Contains ${count} input(s)`);
        for (let i = 0; i < count; i++) {
          const inp = inputs.nth(i);
          const attrs = await inp.evaluate((el: any) => ({
            id: el.id, name: el.name, type: el.type,
            placeholder: el.placeholder, autocomplete: el.autocomplete,
            'aria-label': el.getAttribute('aria-label'),
            className: el.className?.slice(0, 80),
          })).catch(() => ({}));
          console.log(`  Input[${i}]: ${JSON.stringify(attrs)}`);
        }
      } catch (err: any) {
        console.log(`  Could not inspect iframe: ${err.message?.slice(0, 100)}`);
      }
    }
  }

  // Take screenshot
  await page.screenshot({ path: 'debug-checkout-full.png', fullPage: true });
  console.log('\nScreenshot saved to debug-checkout-full.png');

  console.log('\n=== DONE ===');
  console.log(`Session URL: https://www.browserbase.com/sessions/${session.id}`);

  await browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
