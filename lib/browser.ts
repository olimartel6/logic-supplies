import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright';

export async function createBrowserbaseBrowser(opts?: { proxies?: boolean }) {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    timeout: opts?.proxies ? 600 : 300, // proxy sessions need more time for CF warmup
    ...(opts?.proxies ? { proxies: true } : {}),
  });
  return chromium.connectOverCDP(session.connectUrl);
}
