import type { Page } from 'playwright';

export interface CheckoutStep {
  name: string;
  action: (page: Page) => Promise<void>;
}

export interface CheckoutResult {
  completedSteps: string[];
  error?: string;
}

/**
 * Run a series of checkout steps with individual try/catch, logging, and screenshots on error.
 * Makes debugging checkout failures much easier vs a single big try/catch.
 */
export async function runCheckoutSteps(
  page: Page,
  steps: CheckoutStep[],
  log: string[],
  supplier: string,
): Promise<CheckoutResult> {
  const completedSteps: string[] = [];

  for (const step of steps) {
    try {
      log.push(`[${supplier}] ${step.name}...`);
      await step.action(page);
      completedSteps.push(step.name);
      log.push(`[${supplier}] ${step.name} — OK`);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      log.push(`[${supplier}] ${step.name} — ERREUR: ${errMsg}`);
      console.error(`[${supplier}] Checkout step "${step.name}" failed:`, errMsg);
      await page.screenshot({
        path: `${process.cwd()}/public/debug-${supplier.toLowerCase()}-${step.name.replace(/\s+/g, '-').toLowerCase()}.png`,
      }).catch(() => {});
      return { completedSteps, error: `${step.name}: ${errMsg}` };
    }
  }

  return { completedSteps };
}
