import { NextRequest, NextResponse } from 'next/server';
import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { encrypt } from '@/lib/encrypt';

export const maxDuration = 300;

/**
 * POST /api/supplier/session/browserbase
 *
 * Creates a Browserbase session for manual login to a supplier.
 * Returns the live debug URL for the user to log in manually.
 *
 * Body: { supplier: string }
 *
 * After the user logs in, they click "Save session" in the UI
 * which calls POST /api/supplier/session/browserbase/save
 */
export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { supplier = 'homedepot' } = await req.json();

  const db = getDb();
  const account = db
    .prepare('SELECT * FROM supplier_accounts WHERE supplier = ? AND active = 1 AND company_id = ? LIMIT 1')
    .get(supplier, ctx.companyId) as any;
  if (!account) {
    return NextResponse.json({ success: false, error: `Aucun compte ${supplier} configuré` });
  }

  // Login URLs per supplier
  const loginUrls: Record<string, string> = {
    homedepot: 'https://www.homedepot.ca/myaccount',
    lumen: 'https://www.lumen.ca/en/account/login',
    guillevin: 'https://www.guillevin.com/account/login',
    bmr: 'https://www.bmr.ca/fr/customer/account/login/',
    canac: 'https://www.canac.ca/fr/account/login',
    deschenes: 'https://www.deschenes.qc.ca/s/login?language=fr',
    futech: 'https://shop.futech.ca/fr/Account/Login',
    nedco: 'https://www.nedco.ca/cnd/login',
    westburne: 'https://www.westburne.ca/cwr/login',
  };

  const loginUrl = loginUrls[supplier] || `https://www.${supplier}.ca`;
  const needsProxy = supplier === 'homedepot';

  try {
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

    // Create a long-lived session for manual login
    const session = await bb.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      timeout: 600, // 10 minutes for manual login
      ...(needsProxy ? { proxies: true } : {}),
    });

    // Connect to the session to navigate to the login page
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();

    // Navigate to the supplier login page
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Get the live debug URL for the user
    const debugInfo = await bb.sessions.debug(session.id);

    // Don't close the browser — the user will interact with it
    // The session will auto-close after timeout

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      liveUrl: debugInfo.debuggerFullscreenUrl,
      supplier,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
