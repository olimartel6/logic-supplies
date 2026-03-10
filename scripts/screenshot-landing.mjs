import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/landing', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'public/landing/preview-full.png', fullPage: true });
  console.log('Full page screenshot saved');

  // Mobile
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await mCtx.newPage();
  await mp.goto('http://localhost:3000/landing', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(2000);
  await mp.screenshot({ path: 'public/landing/preview-mobile.png', fullPage: true });
  console.log('Mobile screenshot saved');

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
