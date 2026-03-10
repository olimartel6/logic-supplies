#!/usr/bin/env npx tsx
/**
 * Test ordering flow for all configured suppliers.
 * Tests: login → search → add to cart (NO payment — won't place real orders).
 *
 * Usage: npx tsx scripts/test-ordering.ts [supplier]
 * Example: npx tsx scripts/test-ordering.ts lumen
 *          npx tsx scripts/test-ordering.ts          (tests all)
 */

// Load environment variables from .env.local
import { readFileSync } from 'fs';
import { resolve } from 'path';
const envPath = resolve(__dirname, '..', '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}


import { getDb } from '../lib/db';
import { decrypt } from '../lib/encrypt';

// Test products — real products likely to exist on each supplier
const TEST_PRODUCTS: Record<string, string> = {
  lumen: 'Fil 14/2 NMD90',
  canac: 'Fil électrique 14/2',
  homedepot: 'NMD90 14/2',
  guillevin: 'wire 14/2',
};

interface TestResult {
  supplier: string;
  step: string;
  success: boolean;
  error?: string;
  log?: string[];
  duration: number;
}

async function getSupplierAccount(supplier: string) {
  const db = getDb();
  const row = db.prepare(
    'SELECT username, password_encrypted FROM supplier_accounts WHERE supplier = ? AND active = 1 LIMIT 1'
  ).get(supplier) as { username: string; password_encrypted: string } | undefined;
  if (!row) return null;
  return { username: row.username, password: decrypt(row.password_encrypted) };
}

async function testSupplier(supplier: string): Promise<TestResult> {
  const start = Date.now();
  const account = await getSupplierAccount(supplier);
  if (!account) {
    return { supplier, step: 'account', success: false, error: 'No active account configured', duration: 0 };
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${supplier.toUpperCase()}`);
  console.log(`Username: ${account.username}`);
  console.log(`${'='.repeat(60)}`);

  const product = TEST_PRODUCTS[supplier] || 'Fil 14/2 NMD90';

  try {
    // Step 1: Test connection
    console.log(`\n[${supplier}] Step 1: Testing connection...`);
    const connStart = Date.now();
    let connResult: { success: boolean; error?: string };

    switch (supplier) {
      case 'lumen': {
        const { testLumenConnection } = await import('../lib/lumen');
        connResult = await testLumenConnection(account.username, account.password);
        break;
      }
      case 'canac': {
        const { testCanacConnection } = await import('../lib/canac');
        connResult = await testCanacConnection(account.username, account.password);
        break;
      }
      case 'homedepot': {
        const { testHomeDepotConnection } = await import('../lib/homedepot');
        connResult = await testHomeDepotConnection(account.username, account.password);
        break;
      }
      case 'guillevin': {
        const { testGuillevinConnection } = await import('../lib/guillevin');
        connResult = await testGuillevinConnection(account.username, account.password);
        break;
      }
      default:
        connResult = { success: false, error: `No test function for ${supplier}` };
    }

    const connDuration = ((Date.now() - connStart) / 1000).toFixed(1);
    if (!connResult.success) {
      console.log(`[${supplier}] ❌ Connection FAILED (${connDuration}s): ${connResult.error}`);
      return { supplier, step: 'connection', success: false, error: connResult.error, duration: Date.now() - start };
    }
    console.log(`[${supplier}] ✅ Connection OK (${connDuration}s)`);

    // Step 2: Test placing order (add to cart only — no payment)
    console.log(`\n[${supplier}] Step 2: Testing add-to-cart with product: "${product}"...`);
    const orderStart = Date.now();
    let orderResult: { success: boolean; inCart?: boolean; orderId?: string; error?: string; log?: string[] };

    switch (supplier) {
      case 'lumen': {
        const { placeLumenOrder } = await import('../lib/lumen');
        orderResult = await placeLumenOrder(account.username, account.password, product, 1);
        break;
      }
      case 'canac': {
        const { placeCanacOrder } = await import('../lib/canac');
        orderResult = await placeCanacOrder(account.username, account.password, product, 1);
        break;
      }
      case 'homedepot': {
        const { placeHomeDepotOrder } = await import('../lib/homedepot');
        orderResult = await placeHomeDepotOrder(account.username, account.password, product, 1);
        break;
      }
      case 'guillevin': {
        const { placeGuillevinOrder } = await import('../lib/guillevin');
        orderResult = await placeGuillevinOrder(account.username, account.password, product, 1);
        break;
      }
      default:
        orderResult = { success: false, error: `No order function for ${supplier}` };
    }

    const orderDuration = ((Date.now() - orderStart) / 1000).toFixed(1);
    const totalDuration = Date.now() - start;

    if (orderResult.inCart) {
      console.log(`[${supplier}] ✅ ADD TO CART OK (${orderDuration}s)`);
      if (orderResult.log) {
        console.log(`[${supplier}] Log:`);
        orderResult.log.forEach(l => console.log(`  - ${l}`));
      }
      return { supplier, step: 'add-to-cart', success: true, log: orderResult.log, duration: totalDuration };
    }
    if (orderResult.success) {
      console.log(`[${supplier}] ✅ ORDER PLACED (${orderDuration}s) — orderId: ${orderResult.orderId || 'N/A'}`);
      return { supplier, step: 'order-placed', success: true, log: orderResult.log, duration: totalDuration };
    }

    console.log(`[${supplier}] ❌ Order FAILED (${orderDuration}s): ${orderResult.error}`);
    if (orderResult.log) {
      console.log(`[${supplier}] Log:`);
      orderResult.log.forEach(l => console.log(`  - ${l}`));
    }
    return { supplier, step: 'add-to-cart', success: false, error: orderResult.error, log: orderResult.log, duration: totalDuration };

  } catch (err: any) {
    console.log(`[${supplier}] ❌ EXCEPTION: ${err.message}`);
    return { supplier, step: 'exception', success: false, error: err.message, duration: Date.now() - start };
  }
}

async function main() {
  const specificSupplier = process.argv[2];

  // Get all configured suppliers
  const db = getDb();
  const accounts = db.prepare('SELECT DISTINCT supplier FROM supplier_accounts WHERE active = 1').all() as { supplier: string }[];
  const suppliers = accounts.map(a => a.supplier);

  console.log(`\nConfigured active suppliers: ${suppliers.join(', ')}`);

  const toTest = specificSupplier ? [specificSupplier] : suppliers;
  console.log(`Testing: ${toTest.join(', ')}`);

  const results: TestResult[] = [];

  // Test sequentially (each opens a browser)
  for (const supplier of toTest) {
    const result = await testSupplier(supplier);
    results.push(result);
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    const duration = (r.duration / 1000).toFixed(1);
    console.log(`${status} ${r.supplier.padEnd(12)} | ${r.step.padEnd(15)} | ${duration}s | ${r.error || 'OK'}`);
  }

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} suppliers`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
