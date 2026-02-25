# Suivi de commande automatique — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter un suivi de livraison automatique (4 étapes) pour les commandes approuvées, avec polling toutes les 30 min sur les sites fournisseurs via Playwright.

**Architecture:** Un polling `setInterval` démarre au boot du serveur via `instrumentation.ts` (fichier officiel Next.js 14). Il vérifie l'état de livraison de chaque commande confirmée en se connectant aux sites fournisseurs (Canac/Lumen/HD) via Playwright — le même mécanisme déjà utilisé pour passer les commandes. Le statut est mis à jour en DB et un email est envoyé à chaque changement.

**Tech Stack:** Next.js 14 App Router, better-sqlite3, Playwright (déjà installé), TypeScript.

---

## Contexte codebase

- `app/lib/db.ts` — DB SQLite + migrations (`initDb`)
- `app/lib/canac.ts` — `createCanacPage`, `loginToCanac`
- `app/lib/lumen.ts` — `createStealthPage`, `loginToLumen` (privé, mais même pattern)
- `app/lib/homedepot.ts` — login HD
- `app/lib/email.ts` — `sendStatusEmail`, à étendre
- `app/app/api/requests/route.ts` — GET retourne `so.status as lumen_order_status`, `so.supplier_order_id as lumen_order_id`, `so.supplier as order_supplier`
- `app/app/approvals/page.tsx` — modal détail commande (bureau/admin)
- `app/app/my-requests/page.tsx` — modal détail demande (électricien)
- `app/components/NavBar.tsx` — composant partagé (référence pour style)

## Statuts de livraison

```
null → 'ordered' → 'confirmed' → 'in_transit' → 'delivered'
```

- `null` : commande pas encore confirmée (status='pending' dans supplier_orders)
- `ordered` : commande confirmée chez le fournisseur, en attente de traitement
- `confirmed` : fournisseur a confirmé/traité la commande
- `in_transit` : expédiée
- `delivered` : livrée

---

## Task 1 : DB — Migrations

**Fichiers :**
- Modifier : `app/lib/db.ts`

**Ce qu'il faut faire :**

Dans `initDb()`, après les migrations existantes (après la ligne `large_order_threshold`), ajouter :

```typescript
// Migrate: delivery tracking columns on supplier_orders
try { db.exec("ALTER TABLE supplier_orders ADD COLUMN delivery_status TEXT DEFAULT NULL CHECK(delivery_status IN ('ordered','confirmed','in_transit','delivered'))"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE supplier_orders ADD COLUMN tracking_number TEXT DEFAULT NULL"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE supplier_orders ADD COLUMN delivery_updated_at DATETIME DEFAULT NULL"); } catch { /* already exists */ }
```

**Vérification :** Lancer `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 2 : Order Tracker — `app/lib/order-tracker.ts` (nouveau fichier)

**Fichiers :**
- Créer : `app/lib/order-tracker.ts`

**Ce qu'il faut créer :**

```typescript
import { chromium } from 'playwright';
import { getDb } from './db';
import { decrypt } from './encrypt';
import { createCanacPage, loginToCanac } from './canac';

export type DeliveryStatus = 'ordered' | 'confirmed' | 'in_transit' | 'delivered' | null;

// Keywords mapping pour chaque statut (cherche dans le texte de la page)
// Canac (fr) — termes exacts à valider visuellement si possible
const CANAC_STATUS_MAP: { keywords: string[]; status: DeliveryStatus }[] = [
  { keywords: ['livré', 'livre', 'delivered', 'livraison effectuée'], status: 'delivered' },
  { keywords: ['en transit', 'expédié', 'expedie', 'shipped', 'en route', 'en livraison'], status: 'in_transit' },
  { keywords: ['confirmé', 'confirme', 'traitement', 'en cours de traitement', 'processing', 'en préparation'], status: 'confirmed' },
  { keywords: ['reçu', 'recu', 'commandé', 'commande', 'placed', 'order received'], status: 'ordered' },
];

// Lumen (en/fr)
const LUMEN_STATUS_MAP: { keywords: string[]; status: DeliveryStatus }[] = [
  { keywords: ['delivered', 'livré', 'livre'], status: 'delivered' },
  { keywords: ['shipped', 'in transit', 'expédié', 'expedie', 'en route'], status: 'in_transit' },
  { keywords: ['confirmed', 'processing', 'confirmé', 'en traitement'], status: 'confirmed' },
  { keywords: ['received', 'placed', 'reçu', 'commandé'], status: 'ordered' },
];

// Home Depot (fr)
const HD_STATUS_MAP: { keywords: string[]; status: DeliveryStatus }[] = [
  { keywords: ['livré', 'livre', 'delivered'], status: 'delivered' },
  { keywords: ['expédié', 'expedie', 'shipped', 'en transit', 'en route'], status: 'in_transit' },
  { keywords: ['confirmé', 'confirme', 'en traitement', 'confirmed', 'processing'], status: 'confirmed' },
  { keywords: ['reçu', 'recu', 'commandé', 'placed'], status: 'ordered' },
];

function parseStatusFromText(text: string, map: typeof CANAC_STATUS_MAP): DeliveryStatus {
  const lower = text.toLowerCase();
  for (const entry of map) {
    if (entry.keywords.some(k => lower.includes(k))) return entry.status;
  }
  return null;
}

async function checkCanacOrderStatus(
  orderId: string,
  username: string,
  password: string
): Promise<DeliveryStatus> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    const page = await createCanacPage(browser);
    const loggedIn = await loginToCanac(page, username, password);
    if (!loggedIn) return null;

    // Navigate to order history
    await page.goto('https://www.canac.ca/fr/my-account/orders', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Try direct order detail URL first
    await page.goto(`https://www.canac.ca/fr/my-account/orders/${orderId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const pageText = await page.evaluate(() => document.body.innerText);
    return parseStatusFromText(pageText, CANAC_STATUS_MAP);
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

async function checkLumenOrderStatus(
  orderId: string,
  username: string,
  password: string
): Promise<DeliveryStatus> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'fr-CA',
    });
    const page = await context.newPage();

    // Login to Lumen
    await page.goto('https://www.lumen.ca/en/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept All")').first();
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(500);
    }

    const loginForm = page.locator('form:has(input[type="password"])').first();
    await loginForm.waitFor({ timeout: 10000 });
    const usernameField = loginForm.locator('input:not([type="password"]):not([type="hidden"])').first();
    await usernameField.click();
    await usernameField.type(username, { delay: 60 });
    const passwordField = loginForm.locator('input[type="password"]').first();
    await passwordField.click();
    await passwordField.type(password, { delay: 60 });
    const submitBtn = loginForm.locator('button[type="submit"], input[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    // Navigate to order detail
    await page.goto(`https://www.lumen.ca/en/account/orders/${orderId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const pageText = await page.evaluate(() => document.body.innerText);
    return parseStatusFromText(pageText, LUMEN_STATUS_MAP);
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

async function checkHDOrderStatus(
  orderId: string,
  username: string,
  password: string,
  cookies: string | null
): Promise<DeliveryStatus> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    // Restore saved session cookies if available
    if (cookies) {
      try {
        const parsed = JSON.parse(cookies);
        if (Array.isArray(parsed)) await context.addCookies(parsed);
      } catch { /* ignore */ }
    }

    const page = await context.newPage();
    await page.goto(`https://www.homedepot.ca/fr/my-account/orders/${orderId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const pageText = await page.evaluate(() => document.body.innerText);
    return parseStatusFromText(pageText, HD_STATUS_MAP);
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * Check and update delivery status for all confirmed orders that aren't delivered yet.
 * Called by the polling service and the manual sync API.
 */
export async function syncAllOrders(): Promise<{ updated: number; errors: number }> {
  const db = getDb();

  // Get all confirmed supplier orders not yet delivered
  const orders = db.prepare(`
    SELECT so.id, so.supplier, so.supplier_order_id, so.delivery_status, so.request_id,
           sa.username, sa.password_encrypted, sa.session_cookies
    FROM supplier_orders so
    LEFT JOIN supplier_accounts sa ON sa.supplier = so.supplier AND sa.active = 1
    WHERE so.status = 'confirmed'
      AND so.supplier_order_id IS NOT NULL
      AND (so.delivery_status IS NULL OR so.delivery_status != 'delivered')
    ORDER BY so.ordered_at DESC
    LIMIT 50
  `).all() as any[];

  let updated = 0;
  let errors = 0;

  for (const order of orders) {
    if (!order.username || !order.password_encrypted) continue;
    const password = decrypt(order.password_encrypted);

    let newStatus: DeliveryStatus = null;
    try {
      if (order.supplier === 'canac') {
        newStatus = await checkCanacOrderStatus(order.supplier_order_id, order.username, password);
      } else if (order.supplier === 'lumen') {
        newStatus = await checkLumenOrderStatus(order.supplier_order_id, order.username, password);
      } else if (order.supplier === 'homedepot') {
        newStatus = await checkHDOrderStatus(order.supplier_order_id, order.username, password, order.session_cookies);
      }
    } catch {
      errors++;
      continue;
    }

    // Only update if we got a status AND it's a progression (never go backwards)
    if (!newStatus) continue;
    const progression = ['ordered', 'confirmed', 'in_transit', 'delivered'];
    const currentIdx = progression.indexOf(order.delivery_status ?? 'ordered');
    const newIdx = progression.indexOf(newStatus);
    if (newIdx <= currentIdx) continue; // no regression

    db.prepare(`
      UPDATE supplier_orders
      SET delivery_status = ?, delivery_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, order.id);
    updated++;

    // Send email notification on status change
    try {
      const request = db.prepare(`
        SELECT r.product, r.quantity, r.unit,
               j.name as job_site_name,
               u.email as electrician_email,
               GROUP_CONCAT(DISTINCT ou.email) as office_emails
        FROM requests r
        LEFT JOIN job_sites j ON r.job_site_id = j.id
        LEFT JOIN users u ON r.electrician_id = u.id
        LEFT JOIN users ou ON ou.role IN ('office','admin')
        WHERE r.id = ?
        GROUP BY r.id
      `).get(order.request_id) as any;

      if (request) {
        const { sendDeliveryStatusEmail } = await import('./email');
        const allEmails = [
          request.electrician_email,
          ...(request.office_emails ? request.office_emails.split(',') : []),
        ].filter(Boolean);
        for (const email of allEmails) {
          sendDeliveryStatusEmail(email, {
            product: request.product,
            quantity: request.quantity,
            unit: request.unit,
            jobSite: request.job_site_name,
            supplier: order.supplier,
            deliveryStatus: newStatus,
          }).catch(console.error);
        }
      }
    } catch { /* email failure is non-fatal */ }
  }

  return { updated, errors };
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startOrderPolling(intervalMs = 30 * 60 * 1000) {
  if (pollingInterval) return; // already started
  // Initial check after 2 minutes (let server fully boot)
  setTimeout(() => {
    syncAllOrders().catch(console.error);
  }, 2 * 60 * 1000);
  // Then every 30 minutes
  pollingInterval = setInterval(() => {
    syncAllOrders().catch(console.error);
  }, intervalMs);
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 3 : Polling init — `app/instrumentation.ts` (nouveau fichier)

**Fichiers :**
- Créer : `app/instrumentation.ts` (à la racine du projet Next.js, au même niveau que `package.json`)

**Ce qu'il faut créer :**

```typescript
export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startOrderPolling } = await import('./lib/order-tracker');
    startOrderPolling();
  }
}
```

**Activer dans `next.config.ts` (ou `next.config.js`) :** Vérifier que `experimental.instrumentationHook` est `true` (requis pour Next.js < 15). Si le fichier n'existe pas, créer `next.config.ts` :

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
```

Si `next.config.js` ou `next.config.ts` existe déjà, ajouter seulement la clé `experimental.instrumentationHook: true`.

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 4 : API sync-orders — `app/app/api/supplier/sync-orders/route.ts` (nouveau)

**Fichiers :**
- Créer : `app/app/api/supplier/sync-orders/route.ts`

**Ce qu'il faut créer :**

```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { syncAllOrders } from '@/lib/order-tracker';

export async function POST() {
  const session = await getSession();
  if (!session.userId || session.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const result = await syncAllOrders();
  return NextResponse.json(result);
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 5 : Email — Ajouter `sendDeliveryStatusEmail` dans `app/lib/email.ts`

**Fichiers :**
- Modifier : `app/lib/email.ts`

**Ce qu'il faut ajouter** (à la fin du fichier, avant le dernier `}` ou après les fonctions existantes) :

```typescript
export async function sendDeliveryStatusEmail(
  to: string,
  data: {
    product: string;
    quantity: number;
    unit: string;
    jobSite: string;
    supplier: string;
    deliveryStatus: 'ordered' | 'confirmed' | 'in_transit' | 'delivered';
  }
) {
  const transporter = getTransporter(); // utiliser le même helper que les autres fonctions

  const statusLabels: Record<string, string> = {
    ordered: 'Commandé',
    confirmed: 'Confirmé par le fournisseur',
    in_transit: 'En transit',
    delivered: 'Livré',
  };
  const statusEmojis: Record<string, string> = {
    ordered: '📦',
    confirmed: '✅',
    in_transit: '🚚',
    delivered: '📬',
  };

  const label = statusLabels[data.deliveryStatus] || data.deliveryStatus;
  const emoji = statusEmojis[data.deliveryStatus] || '📦';
  const supplierLabel = data.supplier === 'canac' ? 'Canac' : data.supplier === 'homedepot' ? 'Home Depot' : 'Lumen';

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@sparky.app',
    to,
    subject: `${emoji} Statut commande mis à jour — ${data.jobSite}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e3a5f;">${emoji} Mise à jour de livraison</h2>
        <p><strong>${data.product}</strong> (${data.quantity} ${data.unit})</p>
        <p>Chantier : ${data.jobSite}</p>
        <p>Fournisseur : ${supplierLabel}</p>
        <p style="font-size: 1.1em; margin-top: 16px;">
          Nouveau statut : <strong>${label}</strong>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Sparky — Gestion des commandes électriques</p>
      </div>
    `,
  });
}
```

**Important :** Regarder comment les autres fonctions de `email.ts` créent le transporter (probablement une fonction `getTransporter()` ou une variable partagée `transporter`). Utiliser le même pattern exact — ne pas créer un nouveau transporter.

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 6 : Composant DeliveryTimeline — `app/components/DeliveryTimeline.tsx` (nouveau)

**Fichiers :**
- Créer : `app/components/DeliveryTimeline.tsx`

**Ce qu'il faut créer :**

```tsx
'use client';

type DeliveryStatus = 'ordered' | 'confirmed' | 'in_transit' | 'delivered' | null;

const STEPS: { key: DeliveryStatus; label: string; emoji: string }[] = [
  { key: 'ordered',    label: 'Commandé',   emoji: '📦' },
  { key: 'confirmed',  label: 'Confirmé',   emoji: '✅' },
  { key: 'in_transit', label: 'En transit', emoji: '🚚' },
  { key: 'delivered',  label: 'Livré',      emoji: '📬' },
];

export default function DeliveryTimeline({
  status,
  updatedAt,
}: {
  status: DeliveryStatus;
  updatedAt?: string | null;
}) {
  const currentIdx = status ? STEPS.findIndex(s => s.key === status) : -1;

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
        Suivi de livraison
      </p>
      <div className="relative flex items-center justify-between">
        {/* Connecting line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 z-0" />
        <div
          className="absolute top-4 left-4 h-0.5 bg-green-500 z-0 transition-all duration-500"
          style={{ width: currentIdx >= 0 ? `${(currentIdx / (STEPS.length - 1)) * 100}%` : '0%' }}
        />

        {STEPS.map((step, idx) => {
          const isDone = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div key={step.key} className="relative z-10 flex flex-col items-center gap-1.5" style={{ width: '25%' }}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-all ${
                  isDone
                    ? isCurrent
                      ? 'bg-green-500 shadow-md shadow-green-200'
                      : 'bg-green-400'
                    : 'bg-gray-100'
                }`}
              >
                {isDone ? step.emoji : <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />}
              </div>
              <span
                className={`text-xs text-center leading-tight ${
                  isDone ? (isCurrent ? 'text-green-700 font-semibold' : 'text-green-600') : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      {updatedAt && (
        <p className="text-xs text-gray-400 text-center mt-3">
          Mis à jour le {new Date(updatedAt).toLocaleDateString('fr-CA')} à{' '}
          {new Date(updatedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      {!status && (
        <p className="text-xs text-gray-400 text-center mt-2 italic">
          En attente de la première mise à jour (vérification toutes les 30 min)
        </p>
      )}
    </div>
  );
}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 7 : Mettre à jour l'API requests — `app/app/api/requests/route.ts`

**Fichiers :**
- Modifier : `app/app/api/requests/route.ts`

**Ce qu'il faut modifier :**

Dans le `GET`, pour les rôles non-électricien (office/admin), étendre la requête SQL pour inclure `so.delivery_status` et `so.delivery_updated_at` :

```typescript
// Avant :
so.status as lumen_order_status, so.supplier_order_id as lumen_order_id, so.supplier as order_supplier,

// Après :
so.status as lumen_order_status, so.supplier_order_id as lumen_order_id, so.supplier as order_supplier,
so.delivery_status, so.delivery_updated_at,
```

Pour les électriciens, même chose :
```typescript
// Dans la requête électricien, ajouter après la ligne unit_price :
LEFT JOIN supplier_orders so ON so.request_id = r.id
```
(si pas déjà présent) et ajouter `so.delivery_status, so.delivery_updated_at` au SELECT.

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 8 : Mettre à jour la page Approbations — `app/app/approvals/page.tsx`

**Fichiers :**
- Modifier : `app/app/approvals/page.tsx`

**Ce qu'il faut faire :**

**1.** Ajouter `delivery_status` et `delivery_updated_at` à l'interface `Request` :
```typescript
interface Request {
  // ... champs existants ...
  delivery_status: 'ordered' | 'confirmed' | 'in_transit' | 'delivered' | null;
  delivery_updated_at: string | null;
}
```

**2.** Importer `DeliveryTimeline` :
```typescript
import DeliveryTimeline from '@/components/DeliveryTimeline';
```

**3.** Dans le modal de détail (le bottom sheet qui apparaît au clic), après la section `lumen_order_status` existante (autour de la ligne 332), ajouter la timeline pour les commandes approuvées avec un order :
```tsx
{selected.status === 'approved' && selected.lumen_order_status === 'confirmed' && (
  <div className="border-t border-gray-100 pt-4">
    <DeliveryTimeline
      status={selected.delivery_status}
      updatedAt={selected.delivery_updated_at}
    />
  </div>
)}
```

**4.** Ajouter un bouton "Vérifier maintenant" à côté de la timeline (appelle l'API sync-orders) :
```tsx
{selected.status === 'approved' && selected.lumen_order_status === 'confirmed' && (
  <div className="border-t border-gray-100 pt-4">
    <div className="flex items-center justify-between mb-2">
      <span /> {/* spacer */}
      <button
        onClick={async () => {
          await fetch('/api/supplier/sync-orders', { method: 'POST' });
          await loadRequests();
        }}
        className="text-xs text-blue-600 hover:underline"
      >
        🔄 Vérifier maintenant
      </button>
    </div>
    <DeliveryTimeline
      status={selected.delivery_status}
      updatedAt={selected.delivery_updated_at}
    />
  </div>
)}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur.

---

## Task 9 : Mettre à jour la page Mes demandes — `app/app/my-requests/page.tsx`

**Fichiers :**
- Modifier : `app/app/my-requests/page.tsx`

**Ce qu'il faut faire :**

**1.** Ajouter `delivery_status`, `delivery_updated_at` à l'interface `Request` :
```typescript
interface Request {
  // ... champs existants ...
  delivery_status: 'ordered' | 'confirmed' | 'in_transit' | 'delivered' | null;
  delivery_updated_at: string | null;
}
```

**2.** Importer `DeliveryTimeline` :
```typescript
import DeliveryTimeline from '@/components/DeliveryTimeline';
```

**3.** Dans le modal de détail (bottom sheet), après le commentaire de bureau (`office_comment`), ajouter la timeline pour les demandes approuvées :
```tsx
{selected.status === 'approved' && (
  <div className="border-t border-gray-100 pt-4 mt-3">
    <DeliveryTimeline
      status={selected.delivery_status}
      updatedAt={selected.delivery_updated_at}
    />
  </div>
)}
```

**Vérification :** `npx tsc --noEmit --skipLibCheck` → aucune erreur. Redémarrer le serveur de dev et vérifier que la timeline s'affiche pour les demandes approuvées.

---

## Vérification end-to-end

1. Démarrer l'app : `npm run dev`
2. Dans les logs serveur, voir : `[order-tracker] Polling démarré` (si on ajoute un log dans `startOrderPolling`)
3. Ouvrir la page Approbations → cliquer une commande approuvée (status='confirmed') → voir la timeline "Suivi de livraison" avec le statut actuel
4. Cliquer "Vérifier maintenant" → l'app se connecte au fournisseur et met à jour → la timeline s'actualise
5. Ouvrir "Mes demandes" en tant qu'électricien → cliquer une demande approuvée → voir la même timeline en lecture seule
6. Vérifier que `npx tsc --noEmit --skipLibCheck` retourne aucune erreur
