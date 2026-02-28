import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright';

export async function createBrowserbaseBrowser(opts?: { proxies?: boolean }) {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    timeout: 300,
    ...(opts?.proxies ? { proxies: true } : {}),
  });
  return chromium.connectOverCDP(session.connectUrl);
}
