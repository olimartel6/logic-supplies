# Auto-Checkout avec paiement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre aux admins de sauvegarder une carte de crédit et une adresse de bureau dans leurs paramètres, et compléter automatiquement le checkout (adresse + paiement) sur le site fournisseur lors de l'approbation d'une commande.

**Architecture:** 6 couches — (1) DB : table `company_payment_methods` + 2 colonnes dans `company_settings`, (2) API `/api/settings/payment` pour la carte, (3) extension de `/api/supplier/preference` pour adresse/livraison, (4) extension des 4 fonctions `place*Order` pour compléter le checkout, (5) `selectAndOrder` passe les nouvelles params, (6) UI : section paiement dans `/settings` + override livraison dans l'approbation.

**Tech Stack:** Next.js API Routes, better-sqlite3, Playwright via BrowserBase, `encrypt()`/`decrypt()` de `@/lib/encrypt`, React useState, Tailwind CSS, TypeScript

---

### Task 1: DB — table company_payment_methods + colonnes delivery

**Files:**
- Modify: `app/lib/db.ts`

**Step 1: Lire le fichier**

Lire `app/lib/db.ts` pour trouver la fin du bloc `db.exec(` (autour de la ligne 295, après la table `product_favorites`).

**Step 2: Ajouter la table et les colonnes**

Dans `initDb`, trouver la dernière instruction `CREATE TABLE` dans le bloc `db.exec(`. Juste avant la fermeture du template literal (le `` `); `` final), ajouter :

```sql
    CREATE TABLE IF NOT EXISTS company_payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
      card_holder TEXT NOT NULL,
      card_number_encrypted TEXT NOT NULL,
      card_expiry TEXT NOT NULL,
      card_cvv_encrypted TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS office_address TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_delivery TEXT DEFAULT 'office'
      CHECK(default_delivery IN ('office', 'jobsite'));
```

**Note:** SQLite supporte `ADD COLUMN IF NOT EXISTS` depuis la version 3.37 (2021). Si erreur, utiliser un try/catch autour de chaque ALTER dans `initDb`.

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/db.ts && git commit -m "feat: add company_payment_methods table and delivery columns"
```

---

### Task 2: API — /api/settings/payment (GET/POST/DELETE)

**Files:**
- Create: `app/app/api/settings/payment/route.ts`

**Step 1: Regarder le pattern existant**

Lire `app/app/api/supplier/account/route.ts` pour le pattern `getTenantContext` + `encrypt`.

**Step 2: Créer le fichier**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { encrypt } from '@/lib/encrypt';

export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (!['admin', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  const pm = db.prepare(
    'SELECT card_holder, card_number_encrypted, card_expiry, updated_at FROM company_payment_methods WHERE company_id = ?'
  ).get(ctx.companyId) as { card_holder: string; card_number_encrypted: string; card_expiry: string; updated_at: string } | undefined;

  if (!pm) return NextResponse.json({ configured: false });

  // Décrypter juste pour obtenir les 4 derniers chiffres
  const { decrypt } = await import('@/lib/encrypt');
  const fullNumber = decrypt(pm.card_number_encrypted);
  const card_last4 = fullNumber.replace(/\s/g, '').slice(-4);

  return NextResponse.json({
    configured: true,
    card_holder: pm.card_holder,
    card_last4,
    card_expiry: pm.card_expiry,
    updated_at: pm.updated_at,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (!['admin', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  let body: { card_holder?: string; card_number?: string; card_expiry?: string; card_cvv?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }

  const { card_holder, card_number, card_expiry, card_cvv } = body;
  if (!card_holder || !card_number || !card_expiry || !card_cvv) {
    return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
  }

  const digits = card_number.replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(digits)) {
    return NextResponse.json({ error: 'Numéro de carte invalide' }, { status: 400 });
  }
  if (!/^\d{2}\/\d{2}$/.test(card_expiry)) {
    return NextResponse.json({ error: 'Format expiry invalide (MM/YY)' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO company_payment_methods (company_id, card_holder, card_number_encrypted, card_expiry, card_cvv_encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET
      card_holder = excluded.card_holder,
      card_number_encrypted = excluded.card_number_encrypted,
      card_expiry = excluded.card_expiry,
      card_cvv_encrypted = excluded.card_cvv_encrypted,
      updated_at = CURRENT_TIMESTAMP
  `).run(ctx.companyId, card_holder, encrypt(digits), card_expiry, encrypt(card_cvv));

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (!['admin', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  db.prepare('DELETE FROM company_payment_methods WHERE company_id = ?').run(ctx.companyId);

  return NextResponse.json({ ok: true });
}
```

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/api/settings/payment/route.ts && git commit -m "feat: add /api/settings/payment GET/POST/DELETE"
```

---

### Task 3: API — étendre /api/supplier/preference pour office_address + default_delivery

**Files:**
- Modify: `app/app/api/supplier/preference/route.ts`

**Step 1: Lire le fichier actuel**

Lire `app/app/api/supplier/preference/route.ts`.

**Step 2: Modifier le GET**

Trouver la ligne :
```typescript
  const settings = db.prepare(
    'SELECT supplier_preference, lumen_rep_email, large_order_threshold FROM company_settings WHERE company_id = ?'
  ).get(ctx.companyId) as any;
  return NextResponse.json({
    preference: userPref?.supplier_preference || settings?.supplier_preference || 'cheapest',
    lumenRepEmail: settings?.lumen_rep_email || '',
    largeOrderThreshold: settings?.large_order_threshold ?? 2000,
  });
```

Remplacer par :
```typescript
  const settings = db.prepare(
    'SELECT supplier_preference, lumen_rep_email, large_order_threshold, office_address, default_delivery FROM company_settings WHERE company_id = ?'
  ).get(ctx.companyId) as any;
  return NextResponse.json({
    preference: userPref?.supplier_preference || settings?.supplier_preference || 'cheapest',
    lumenRepEmail: settings?.lumen_rep_email || '',
    largeOrderThreshold: settings?.large_order_threshold ?? 2000,
    officeAddress: settings?.office_address || '',
    defaultDelivery: settings?.default_delivery || 'office',
  });
```

**Step 3: Modifier le POST**

Trouver :
```typescript
  const { preference, lumenRepEmail, largeOrderThreshold } = body;
```
Remplacer par :
```typescript
  const { preference, lumenRepEmail, largeOrderThreshold, officeAddress, defaultDelivery } = body;
```

Trouver la validation :
```typescript
  if (preference !== undefined && !['cheapest', 'fastest'].includes(preference)) {
    return NextResponse.json({ error: 'Préférence invalide' }, { status: 400 });
  }
```
Ajouter après :
```typescript
  if (defaultDelivery !== undefined && !['office', 'jobsite'].includes(defaultDelivery)) {
    return NextResponse.json({ error: 'Livraison invalide' }, { status: 400 });
  }
```

Trouver le UPDATE dans la section admin/office :
```typescript
  db.prepare(`
    UPDATE company_settings SET
      supplier_preference = COALESCE(?, supplier_preference),
      lumen_rep_email = COALESCE(?, lumen_rep_email),
      large_order_threshold = COALESCE(?, large_order_threshold),
      updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
  `).run(preference ?? null, lumenRepEmail ?? null, largeOrderThreshold ?? null, ctx.companyId);
```
Remplacer par :
```typescript
  db.prepare(`
    UPDATE company_settings SET
      supplier_preference = COALESCE(?, supplier_preference),
      lumen_rep_email = COALESCE(?, lumen_rep_email),
      large_order_threshold = COALESCE(?, large_order_threshold),
      office_address = COALESCE(?, office_address),
      default_delivery = COALESCE(?, default_delivery),
      updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
  `).run(preference ?? null, lumenRepEmail ?? null, largeOrderThreshold ?? null, officeAddress ?? null, defaultDelivery ?? null, ctx.companyId);
```

**Step 4: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/api/supplier/preference/route.ts && git commit -m "feat: add office_address and default_delivery to preference API"
```

---

### Task 4: Étendre place*Order pour compléter le checkout — interface + lumen.ts

**Files:**
- Modify: `app/lib/lumen.ts`

**Step 1: Lire lumen.ts**

Lire `app/lib/lumen.ts` pour trouver la signature de `placeLumenOrder` et voir exactement où elle s'arrête (après l'add-to-cart).

**Step 2: Ajouter l'interface PaymentInfo**

En haut du fichier, après les imports existants, ajouter :

```typescript
export interface PaymentInfo {
  cardHolder: string;
  cardNumber: string;  // numéro complet décrypté, sans espaces
  cardExpiry: string;  // "MM/YY"
  cardCvv: string;
}
```

**Step 3: Modifier la signature de placeLumenOrder**

Trouver la signature actuelle :
```typescript
export async function placeLumenOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
```
Remplacer par :
```typescript
export async function placeLumenOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
```

**Step 4: Ajouter le checkout après le add-to-cart**

Trouver la ligne où la fonction retourne `{ success: false, inCart: true }` après l'add-to-cart (c'est le retour actuel après avoir ajouté au panier). Juste avant ce `return`, ajouter :

```typescript
    // ── Checkout automatique si adresse et paiement fournis ──
    if (deliveryAddress && payment) {
      try {
        // Naviguer vers le panier puis checkout
        await page.goto('https://www.lumen.ca/en/cart', { waitUntil: 'networkidle' });
        await page.click('text=Checkout', { timeout: 10000 });
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });

        // Adresse de livraison — chercher les champs d'adresse
        const addressField = page.locator('input[name="address1"], input[placeholder*="Address"], input[placeholder*="adresse"]').first();
        if (await addressField.isVisible({ timeout: 5000 })) {
          await addressField.fill(deliveryAddress);
        }

        // Continuer vers le paiement
        const continueBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Continuer")').first();
        if (await continueBtn.isVisible({ timeout: 5000 })) {
          await continueBtn.click();
          await page.waitForTimeout(2000);
        }

        // Entrer la carte
        const cardNumberField = page.locator('input[name*="card"], input[placeholder*="card number"], iframe[title*="Card Number"]').first();
        if (await cardNumberField.isVisible({ timeout: 8000 })) {
          await cardNumberField.fill(payment.cardNumber);
        }
        const expiryField = page.locator('input[name*="expir"], input[placeholder*="MM"], input[placeholder*="expiry"]').first();
        if (await expiryField.isVisible({ timeout: 3000 })) {
          await expiryField.fill(payment.cardExpiry);
        }
        const cvvField = page.locator('input[name*="cvv"], input[name*="cvc"], input[placeholder*="CVV"], input[placeholder*="CVC"]').first();
        if (await cvvField.isVisible({ timeout: 3000 })) {
          await cvvField.fill(payment.cardCvv);
        }

        // Soumettre la commande
        const submitBtn = page.locator('button[type="submit"]:has-text("Place Order"), button:has-text("Passer la commande"), button:has-text("Submit Order")').first();
        if (await submitBtn.isVisible({ timeout: 5000 })) {
          await submitBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        // Capturer le numéro de commande
        const confirmationText = await page.textContent('body');
        const orderMatch = confirmationText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i);
        const orderId = orderMatch?.[1];

        return { success: true, orderId: orderId || undefined };
      } catch (checkoutErr: any) {
        // Checkout échoué — retourner inCart: true pour notification manuelle
        console.error('[Lumen] Checkout error:', checkoutErr.message);
        return { success: false, inCart: true, error: `Checkout: ${checkoutErr.message}` };
      }
    }
```

**Step 5: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/lumen.ts && git commit -m "feat: extend placeLumenOrder with checkout automation"
```

---

### Task 5: Étendre placeCanacOrder, placeHomeDepotOrder, placeGuillevinOrder

**Files:**
- Modify: `app/lib/canac.ts`
- Modify: `app/lib/homedepot.ts`
- Modify: `app/lib/guillevin.ts`

**Step 1: Lire les 3 fichiers**

Lire `app/lib/canac.ts`, `app/lib/homedepot.ts`, `app/lib/guillevin.ts` pour trouver les signatures des fonctions `place*Order` et où elles s'arrêtent.

**Step 2: Importer PaymentInfo depuis lumen.ts dans chaque fichier**

Dans chaque fichier, trouver la ligne import existante et ajouter :
```typescript
import type { PaymentInfo } from './lumen';
```

**Step 3: Étendre placeCanacOrder**

Modifier la signature :
```typescript
export async function placeCanacOrder(
  username: string,
  password: string,
  product: string,
  quantity: number,
  deliveryAddress?: string,
  payment?: PaymentInfo,
```

Ajouter le même bloc checkout que Lumen juste avant le `return { success: false, inCart: true }`, avec l'URL du panier Canac :
```typescript
    if (deliveryAddress && payment) {
      try {
        await page.goto('https://www.canac.ca/fr/panier', { waitUntil: 'networkidle' });
        // Checkout Canac (SAP Commerce Cloud)
        const checkoutBtn = page.locator('a:has-text("Commander"), button:has-text("Passer la commande")').first();
        if (await checkoutBtn.isVisible({ timeout: 8000 })) {
          await checkoutBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        // Adresse
        const addressField = page.locator('input[name="address1"], input[formcontrolname*="address"]').first();
        if (await addressField.isVisible({ timeout: 5000 })) {
          await addressField.fill(deliveryAddress);
        }
        const continueBtn = page.locator('button[type="submit"]:has-text("Continuer"), cx-place-order button').first();
        if (await continueBtn.isVisible({ timeout: 5000 })) {
          await continueBtn.click();
          await page.waitForTimeout(2000);
        }

        // Carte
        const cardField = page.locator('input[name*="card"], input[placeholder*="carte"]').first();
        if (await cardField.isVisible({ timeout: 8000 })) {
          await cardField.fill(payment.cardNumber);
        }
        const expiryField = page.locator('input[name*="expir"]').first();
        if (await expiryField.isVisible({ timeout: 3000 })) {
          await expiryField.fill(payment.cardExpiry);
        }
        const cvvField = page.locator('input[name*="cvv"], input[name*="cvc"]').first();
        if (await cvvField.isVisible({ timeout: 3000 })) {
          await cvvField.fill(payment.cardCvv);
        }

        const submitBtn = page.locator('cx-place-order button[type="submit"], button:has-text("Confirmer la commande")').first();
        if (await submitBtn.isVisible({ timeout: 5000 })) {
          await submitBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        const bodyText = await page.textContent('body');
        const orderMatch = bodyText?.match(/commande\s*#?\s*([A-Z0-9-]{5,20})/i);
        return { success: true, orderId: orderMatch?.[1] };
      } catch (err: any) {
        console.error('[Canac] Checkout error:', err.message);
        return { success: false, inCart: true, error: `Checkout: ${err.message}` };
      }
    }
```

**Step 4: Étendre placeHomeDepotOrder**

Modifier la signature (ajouter `deliveryAddress?: string, payment?: PaymentInfo`).

Ajouter avant le `return { success: false, inCart: true }` :
```typescript
    if (deliveryAddress && payment) {
      try {
        await page.goto('https://www.homedepot.ca/en/home/cart.html', { waitUntil: 'networkidle' });
        const checkoutBtn = page.locator('button:has-text("Checkout"), button:has-text("Passer à la caisse")').first();
        if (await checkoutBtn.isVisible({ timeout: 8000 })) {
          await checkoutBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        // Livraison
        const addressField = page.locator('input[id*="address"], input[name*="address"]').first();
        if (await addressField.isVisible({ timeout: 8000 })) {
          await addressField.fill(deliveryAddress);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);
        }

        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Continuer")').first();
        if (await continueBtn.isVisible({ timeout: 5000 })) {
          await continueBtn.click();
          await page.waitForTimeout(2000);
        }

        // Paiement
        // Home Depot utilise souvent des iframes pour les champs de carte
        const cardFrame = page.frameLocator('iframe[title*="Card"], iframe[name*="card"]').first();
        const cardInput = cardFrame.locator('input').first();
        if (await cardInput.isVisible({ timeout: 8000 }).catch(() => false)) {
          await cardInput.fill(payment.cardNumber);
        } else {
          const directCard = page.locator('input[id*="cardNumber"], input[name*="cardNumber"]').first();
          if (await directCard.isVisible({ timeout: 3000 })) {
            await directCard.fill(payment.cardNumber);
          }
        }

        const expiryField = page.locator('input[id*="expiry"], input[name*="expiry"]').first();
        if (await expiryField.isVisible({ timeout: 3000 })) await expiryField.fill(payment.cardExpiry);

        const cvvField = page.locator('input[id*="cvv"], input[name*="cvv"]').first();
        if (await cvvField.isVisible({ timeout: 3000 })) await cvvField.fill(payment.cardCvv);

        const placeOrderBtn = page.locator('button:has-text("Place Order"), button:has-text("Passer la commande")').first();
        if (await placeOrderBtn.isVisible({ timeout: 5000 })) {
          await placeOrderBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        const bodyText = await page.textContent('body');
        const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i);
        return { success: true, orderId: orderMatch?.[1] };
      } catch (err: any) {
        console.error('[HomeDepot] Checkout error:', err.message);
        return { success: false, inCart: true, error: `Checkout: ${err.message}` };
      }
    }
```

**Step 5: Étendre placeGuillevinOrder**

Modifier la signature. Guillevin est Shopify — checkout plus standardisé :

```typescript
    if (deliveryAddress && payment) {
      try {
        // Shopify checkout
        await page.goto('https://www.guillevin.com/cart', { waitUntil: 'networkidle' });
        const checkoutBtn = page.locator('button[name="checkout"], input[name="checkout"]').first();
        if (await checkoutBtn.isVisible({ timeout: 8000 })) {
          await checkoutBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        // Shopify checkout — champs standard
        const addressField = page.locator('#checkout_shipping_address_address1').first();
        if (await addressField.isVisible({ timeout: 8000 })) {
          await addressField.fill(deliveryAddress);
        }

        const continueBtn = page.locator('#continue_button, button:has-text("Continue to shipping")').first();
        if (await continueBtn.isVisible({ timeout: 5000 })) {
          await continueBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        // Shipping method
        const shippingContinue = page.locator('button:has-text("Continue to payment")').first();
        if (await shippingContinue.isVisible({ timeout: 5000 })) {
          await shippingContinue.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        // Shopify payment — souvent dans un iframe
        const cardFrame = page.frameLocator('iframe[id*="card-fields-number"]').first();
        const cardInput = cardFrame.locator('input[placeholder*="Card number"]');
        if (await cardInput.isVisible({ timeout: 8000 }).catch(() => false)) {
          await cardInput.fill(payment.cardNumber);
          const expiryFrame = page.frameLocator('iframe[id*="card-fields-expiry"]').first();
          await expiryFrame.locator('input').first().fill(payment.cardExpiry);
          const cvvFrame = page.frameLocator('iframe[id*="card-fields-verification"]').first();
          await cvvFrame.locator('input').first().fill(payment.cardCvv);
        }

        const payBtn = page.locator('button[id="continue_button"]:has-text("Pay"), button:has-text("Complete order")').first();
        if (await payBtn.isVisible({ timeout: 5000 })) {
          await payBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
        }

        const bodyText = await page.textContent('body');
        const orderMatch = bodyText?.match(/order\s*#?\s*([A-Z0-9-]{5,20})/i);
        return { success: true, orderId: orderMatch?.[1] };
      } catch (err: any) {
        console.error('[Guillevin] Checkout error:', err.message);
        return { success: false, inCart: true, error: `Checkout: ${err.message}` };
      }
    }
```

**Step 6: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```

**Step 7: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/canac.ts lib/homedepot.ts lib/guillevin.ts && git commit -m "feat: extend place*Order with checkout automation for Canac, HomeDepot, Guillevin"
```

---

### Task 6: Mettre à jour selectAndOrder + route d'approbation

**Files:**
- Modify: `app/lib/supplier-router.ts`
- Modify: `app/app/api/requests/[id]/route.ts`

**Step 1: Lire les deux fichiers**

Lire `app/lib/supplier-router.ts` et `app/app/api/requests/[id]/route.ts`.

**Step 2: Modifier supplier-router.ts**

Ajouter l'import en haut :
```typescript
import type { PaymentInfo } from './lumen';
```

Modifier la signature de `placeOrder` interne :
```typescript
async function placeOrder(account: SupplierAccount, product: string, quantity: number, deliveryAddress?: string, payment?: PaymentInfo): Promise<LumenOrderResult> {
  switch (account.supplier) {
    case 'lumen': return placeLumenOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'canac': return placeCanacOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'homedepot': return placeHomeDepotOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
    case 'guillevin': return placeGuillevinOrder(account.username, account.password, product, quantity, deliveryAddress, payment);
  }
}
```

Modifier la signature de `selectAndOrder` :
```typescript
export async function selectAndOrder(
  preference: 'cheapest' | 'fastest',
  jobSiteAddress: string,
  product: string,
  quantity: number,
  preferredSupplier?: string,
  companyId?: number | null,
  deliveryAddress?: string,
  payment?: PaymentInfo,
): Promise<{ result: LumenOrderResult; supplier: string; reason: string }>
```

Dans la boucle `for` de `selectAndOrder`, modifier l'appel :
```typescript
    const result = await placeOrder(acc, product, quantity, deliveryAddress, payment);
```

**Step 3: Modifier app/api/requests/[id]/route.ts**

Ajouter l'import :
```typescript
import { decrypt } from '@/lib/encrypt';
import type { PaymentInfo } from '@/lib/lumen';
```

Modifier la déstructuration du body (ligne 16) pour accepter `delivery_override` :
```typescript
  const { status, office_comment, delivery_override } = await req.json();
```

Dans le bloc `if (status === 'approved')`, après la récupération de `settings`, ajouter la résolution de l'adresse et de la carte :

```typescript
    const settings = db.prepare('SELECT supplier_preference, office_address, default_delivery FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;
    const preference: 'cheapest' | 'fastest' = settings?.supplier_preference || 'cheapest';

    // Résoudre l'adresse de livraison
    const deliveryMode: 'office' | 'jobsite' = delivery_override || settings?.default_delivery || 'office';
    const deliveryAddress: string =
      deliveryMode === 'office'
        ? (settings?.office_address || '')
        : (request.job_site_address || settings?.office_address || '');

    // Récupérer la carte de paiement
    let payment: PaymentInfo | undefined;
    const pm = db.prepare('SELECT card_holder, card_number_encrypted, card_expiry, card_cvv_encrypted FROM company_payment_methods WHERE company_id = ?').get(ctx.companyId) as any;
    if (pm) {
      payment = {
        cardHolder: pm.card_holder,
        cardNumber: decrypt(pm.card_number_encrypted),
        cardExpiry: pm.card_expiry,
        cardCvv: decrypt(pm.card_cvv_encrypted),
      };
    }
```

Mettre à jour l'appel à `selectAndOrder` pour passer les nouvelles params :
```typescript
        const { result, supplier, reason } = await selectAndOrder(
          preference,
          request.job_site_address || '',
          request.product,
          request.quantity,
          request.supplier || undefined,
          ctx.companyId,
          deliveryAddress || undefined,
          payment,
        );
```

**Step 4: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/supplier-router.ts app/api/requests/[id]/route.ts && git commit -m "feat: pass delivery address and payment to selectAndOrder on approval"
```

---

### Task 7: UI — section Paiement dans /settings

**Files:**
- Modify: `app/app/settings/page.tsx`

**Step 1: Lire le fichier**

Lire `app/app/settings/page.tsx` pour comprendre la structure (composant `AccordionSection`, états existants, où ajouter la nouvelle section).

**Step 2: Ajouter les états**

Dans la fonction principale `SettingsPage` (ou équivalent), après les états existants, ajouter :

```typescript
  // Paiement
  const [payment, setPayment] = useState<{ configured: boolean; card_holder?: string; card_last4?: string; card_expiry?: string } | null>(null);
  const [paymentForm, setPaymentForm] = useState({ card_holder: '', card_number: '', card_expiry: '', card_cvv: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // Adresse bureau + livraison par défaut
  const [officeAddress, setOfficeAddress] = useState('');
  const [defaultDelivery, setDefaultDelivery] = useState<'office' | 'jobsite'>('office');
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliverySaved, setDeliverySaved] = useState(false);
```

**Step 3: Charger les données dans le useEffect**

Trouver le premier `useEffect`. Ajouter le fetch du paiement et des paramètres livraison :

```typescript
    fetch('/api/settings/payment').then(r => r.json()).then(setPayment).catch(() => {});
    fetch('/api/supplier/preference').then(r => r.json()).then((d: any) => {
      if (d.officeAddress !== undefined) setOfficeAddress(d.officeAddress);
      if (d.defaultDelivery !== undefined) setDefaultDelivery(d.defaultDelivery);
    }).catch(() => {});
```

**Step 4: Ajouter les fonctions**

```typescript
  async function handleSavePayment(e: React.FormEvent) {
    e.preventDefault();
    setSavingPayment(true);
    setPaymentSaved(false);
    const res = await fetch('/api/settings/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentForm),
    });
    if (res.ok) {
      setPaymentSaved(true);
      setPaymentForm(f => ({ ...f, card_number: '', card_cvv: '' }));
      fetch('/api/settings/payment').then(r => r.json()).then(setPayment);
      setTimeout(() => setPaymentSaved(false), 3000);
    }
    setSavingPayment(false);
  }

  async function handleDeletePayment() {
    setDeletingPayment(true);
    await fetch('/api/settings/payment', { method: 'DELETE' });
    setPayment({ configured: false });
    setDeletingPayment(false);
  }

  async function handleSaveDelivery(e: React.FormEvent) {
    e.preventDefault();
    setSavingDelivery(true);
    setDeliverySaved(false);
    await fetch('/api/supplier/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officeAddress, defaultDelivery }),
    });
    setSavingDelivery(false);
    setDeliverySaved(true);
    setTimeout(() => setDeliverySaved(false), 3000);
  }
```

**Step 5: Ajouter la section JSX**

Trouver la section la plus pertinente (par exemple après la section "Préférences fournisseur" ou avant la fin du return). Ajouter une nouvelle `AccordionSection` :

```tsx
      {/* ─── Moyen de paiement ─── */}
      <AccordionSection
        title="Moyen de paiement"
        icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 21Z" /></svg>}
        isOpen={paymentOpen}
        onToggle={() => setPaymentOpen(o => !o)}
      >
        {payment?.configured ? (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">{payment.card_holder}</p>
              <p className="text-xs text-green-600 font-mono">•••• •••• •••• {payment.card_last4} · {payment.card_expiry}</p>
            </div>
            <button
              onClick={handleDeletePayment}
              disabled={deletingPayment}
              className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
            >
              {deletingPayment ? '...' : 'Supprimer'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic mb-4">Aucune carte configurée.</p>
        )}

        <form onSubmit={handleSavePayment} className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {payment?.configured ? 'Modifier la carte' : 'Ajouter une carte'}
          </p>
          <input
            type="text"
            placeholder="Nom sur la carte"
            value={paymentForm.card_holder}
            onChange={e => setPaymentForm(f => ({ ...f, card_holder: e.target.value }))}
            required
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <input
            type="text"
            placeholder="Numéro de carte (16 chiffres)"
            value={paymentForm.card_number}
            onChange={e => setPaymentForm(f => ({ ...f, card_number: e.target.value }))}
            required
            maxLength={19}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="MM/YY"
              value={paymentForm.card_expiry}
              onChange={e => setPaymentForm(f => ({ ...f, card_expiry: e.target.value }))}
              required
              maxLength={5}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <input
              type="password"
              placeholder="CVV"
              value={paymentForm.card_cvv}
              onChange={e => setPaymentForm(f => ({ ...f, card_cvv: e.target.value }))}
              required
              maxLength={4}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <button
            type="submit"
            disabled={savingPayment}
            className="w-full bg-yellow-400 text-slate-900 font-semibold py-2.5 rounded-xl text-sm hover:bg-yellow-300 disabled:opacity-50 transition"
          >
            {savingPayment ? 'Sauvegarde...' : paymentSaved ? '✅ Sauvegardé' : 'Sauvegarder la carte'}
          </button>
        </form>

        {/* Adresse du bureau + livraison par défaut */}
        <div className="mt-6 border-t border-gray-100 pt-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Livraison</p>
          <form onSubmit={handleSaveDelivery} className="space-y-3">
            <input
              type="text"
              placeholder="Adresse du bureau (ex: 123 rue Principale, Montréal, QC)"
              value={officeAddress}
              onChange={e => setOfficeAddress(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <div>
              <p className="text-xs text-gray-500 mb-2">Livraison par défaut</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDefaultDelivery('office')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${defaultDelivery === 'office' ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  Bureau
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultDelivery('jobsite')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${defaultDelivery === 'jobsite' ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  Chantier
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={savingDelivery}
              className="w-full bg-gray-900 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-700 disabled:opacity-50 transition"
            >
              {savingDelivery ? 'Sauvegarde...' : deliverySaved ? '✅ Sauvegardé' : 'Sauvegarder'}
            </button>
          </form>
        </div>
      </AccordionSection>
```

**Step 6: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -30
```

**Step 7: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add app/settings/page.tsx && git commit -m "feat: add payment method and delivery settings UI"
```

---

### Task 8: UI — override livraison dans l'écran d'approbation

**Files:**
- Modify: trouver le composant ou la page où le bureau approuve les commandes

**Step 1: Trouver l'écran d'approbation**

```bash
grep -r "office_comment\|handleApprove\|status.*approved" /Users/oli/Downloads/project\ sparky/app/app --include="*.tsx" -l
```

Lire le fichier trouvé pour comprendre comment l'approbation est déclenchée.

**Step 2: Ajouter l'état delivery_override**

Dans le composant d'approbation, ajouter :
```typescript
  const [deliveryOverride, setDeliveryOverride] = useState<'office' | 'jobsite' | null>(null);
  const [paymentConfigured, setPaymentConfigured] = useState(false);
  const [defaultDelivery, setDefaultDelivery] = useState<'office' | 'jobsite'>('office');
```

Au chargement, fetch les infos :
```typescript
  useEffect(() => {
    fetch('/api/settings/payment').then(r => r.json()).then((d: any) => setPaymentConfigured(d.configured)).catch(() => {});
    fetch('/api/supplier/preference').then(r => r.json()).then((d: any) => {
      if (d.defaultDelivery) setDefaultDelivery(d.defaultDelivery);
      setDeliveryOverride(d.defaultDelivery || 'office');
    }).catch(() => {});
  }, []);
```

**Step 3: Ajouter le sélecteur dans le formulaire d'approbation**

Dans le JSX du modal/formulaire d'approbation, ajouter avant le bouton "Approuver" :

```tsx
          {paymentConfigured && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1.5">Livraison</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryOverride('office')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition ${(deliveryOverride ?? defaultDelivery) === 'office' ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'border-gray-200 text-gray-500'}`}
                >
                  Bureau
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryOverride('jobsite')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition ${(deliveryOverride ?? defaultDelivery) === 'jobsite' ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'border-gray-200 text-gray-500'}`}
                >
                  Chantier
                </button>
              </div>
            </div>
          )}
```

**Step 4: Passer delivery_override dans le PATCH**

Trouver l'appel `fetch(...)` qui PATCH la requête pour l'approuver. Ajouter `delivery_override` dans le body :
```typescript
      body: JSON.stringify({
        status: 'approved',
        office_comment,
        delivery_override: deliveryOverride,
      }),
```

**Step 5: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add . && git commit -m "feat: add delivery override to approval UI"
```
