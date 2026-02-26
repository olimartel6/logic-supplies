import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright';

export async function createBrowserbaseBrowser() {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  });
  return chromium.connectOverCDP(session.connectUrl);
}
