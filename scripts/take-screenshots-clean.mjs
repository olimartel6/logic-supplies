import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const DIR = 'public/landing';

const hideDevBadge = async (p) => {
  await p.evaluate(() => {
    // Only target the Next.js dev tools badge specifically
    document.querySelectorAll('nextjs-portal').forEach(el => el.remove());
    // The N badge is a shadow DOM element inside nextjs-portal, also try removing by size
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      // The dev badge is ~36x36px, fixed, bottom-left corner
      if (s.position === 'fixed' && rect.width < 50 && rect.height < 50 &&
          rect.bottom > window.innerHeight - 60 && rect.left < 60 &&
          !el.closest('nav') && !el.closest('aside') && !el.closest('[class*="sidebar"]') &&
          !el.closest('[class*="nav"]') && !el.closest('[class*="bottom"]')) {
        el.style.display = 'none';
      }
    });
  });
};

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Desktop
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Login
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await hideDevBadge(page);
  await page.screenshot({ path: `${DIR}/screenshot-login.png` });
  console.log('1. Login');

  // Log in
  await page.locator('input[type="email"]').fill('admin@sparky.com');
  await page.locator('input[type="password"]').fill('admin123');
  const cbs = page.locator('input[type="checkbox"]');
  for (let i = 0; i < await cbs.count(); i++) await cbs.nth(i).check();
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  await hideDevBadge(page);
  await page.screenshot({ path: `${DIR}/screenshot-dashboard.png` });
  console.log('2. Dashboard:', page.url());

  // Inventory
  await page.goto(BASE + '/inventory', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await hideDevBadge(page);
  await page.screenshot({ path: `${DIR}/screenshot-inventory.png` });
  console.log('3. Inventory');

  // Settings
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await hideDevBadge(page);
  await page.screenshot({ path: `${DIR}/screenshot-settings.png` });
  console.log('4. Settings');

  // Mobile
  const cookies = await ctx.cookies();
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await mCtx.newPage();

  // Mobile login
  await mp.goto(BASE + '/', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(1500);
  await hideDevBadge(mp);
  await mp.screenshot({ path: `${DIR}/screenshot-login-mobile.png` });
  console.log('5. Login mobile');

  // Mobile dashboard
  await mCtx.addCookies(cookies);
  await mp.goto(BASE + '/approvals', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(2000);
  await hideDevBadge(mp);
  await mp.screenshot({ path: `${DIR}/screenshot-dashboard-mobile.png` });
  console.log('6. Dashboard mobile');

  console.log('Done!');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
