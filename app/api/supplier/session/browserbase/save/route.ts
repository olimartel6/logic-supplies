import { NextRequest, NextResponse } from 'next/server';
import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { encrypt } from '@/lib/encrypt';

export const maxDuration = 60;

/**
 * POST /api/supplier/session/browserbase/save
 *
 * Connects to an existing Browserbase session, extracts cookies,
 * and saves them to the supplier_accounts table for future automated orders.
 *
 * Body: { sessionId: string, supplier: string }
 */
export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { sessionId, supplier = 'homedepot' } = await req.json();
  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'sessionId requis' });
  }

  const db = getDb();
  const account = db
    .prepare('SELECT * FROM supplier_accounts WHERE supplier = ? AND active = 1 AND company_id = ? LIMIT 1')
    .get(supplier, ctx.companyId) as any;
  if (!account) {
    return NextResponse.json({ success: false, error: `Aucun compte ${supplier} configuré` });
  }

  try {
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

    // Get the session's connect URL
    const session = await bb.sessions.retrieve(sessionId);
    if (!session.connectUrl) {
      return NextResponse.json({ success: false, error: 'Session Browserbase expirée ou invalide' });
    }

    // Connect to the existing session
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    if (!context) {
      return NextResponse.json({ success: false, error: 'Aucun contexte de navigateur trouvé' });
    }

    // Extract all cookies
    const cookies = await context.cookies();
    if (cookies.length === 0) {
      return NextResponse.json({ success: false, error: 'Aucun cookie trouvé — vérifiez que vous êtes bien connecté' });
    }

    // Save encrypted cookies to DB
    const encrypted = encrypt(JSON.stringify(cookies));
    db.prepare(
      'UPDATE supplier_accounts SET session_cookies = ? WHERE supplier = ? AND username = ? AND company_id = ?'
    ).run(encrypted, supplier, account.username, ctx.companyId);

    // Close the session
    await browser.close();

    return NextResponse.json({
      success: true,
      cookieCount: cookies.length,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
