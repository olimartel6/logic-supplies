# Auto-Approve Electricians Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin can toggle a per-electrician "auto-approve" flag so their requests are instantly approved and auto-ordered without office intervention.

**Architecture:** Add `auto_approve INTEGER DEFAULT 0` to `users`. Extract approval logic from `PATCH /api/requests/[id]` into `lib/approval.ts`. In `POST /api/requests`, check the flag and call `triggerApproval()` immediately if set. Add PATCH to `api/users/[id]` for the toggle. Add toggle UI in the admin users list.

**Tech Stack:** Next.js App Router, better-sqlite3, TypeScript, Tailwind CSS

---

### Task 1: DB migration — add `auto_approve` column to `users`

**Files:**
- Modify: `lib/db.ts:382-386`

**Step 1: Add ALTER TABLE guard**

Find this block (around line 382):
```typescript
const userCols = db.pragma('table_info(users)') as { name: string }[];
if (!userCols.find(c => c.name === 'supplier_preference')) {
  db.exec(`ALTER TABLE users ADD COLUMN supplier_preference TEXT DEFAULT NULL`);
}
```

Add immediately after it:
```typescript
if (!userCols.find(c => c.name === 'auto_approve')) {
  db.exec(`ALTER TABLE users ADD COLUMN auto_approve INTEGER DEFAULT 0`);
}
```

**Step 2: Verify it runs without error**

Run: `cd "/Users/oli/Downloads/project sparky/app" && npx tsx -e "import { getDb } from './lib/db'; const db = getDb(); console.log(db.pragma('table_info(users)').map((c: any) => c.name))"`
Expected: array includes `'auto_approve'`

**Step 3: Commit**
```bash
git add lib/db.ts
git commit -m "feat: add auto_approve column to users table"
```

---

### Task 2: Extract `triggerApproval()` into `lib/approval.ts`

**Files:**
- Create: `lib/approval.ts`
- The logic comes from `app/api/requests/[id]/route.ts` lines 34-197

**Step 1: Create `lib/approval.ts` with this exact content:**

```typescript
import type Database from 'better-sqlite3';
import { sendStatusEmail, sendOrderConfirmationEmail, sendCartNotificationEmail, sendBudgetAlertEmail } from './email';
import { selectAndOrder } from './supplier-router';
import { randomUUID } from 'crypto';
import { decrypt } from './encrypt';
import type { PaymentInfo } from './lumen';

/**
 * Approve a request and trigger auto-order.
 * Called both from the manual approval PATCH route and from POST /api/requests for auto-approve users.
 */
export async function triggerApproval(
  requestId: number | bigint,
  companyId: number,
  db: Database.Database,
  delivery_override?: 'office' | 'jobsite',
  office_comment?: string,
) {
  db.prepare(`
    UPDATE requests SET status = 'approved', office_comment = ?, decision_date = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).run(office_comment || '', requestId, companyId);

  const request = db.prepare(`
    SELECT r.*, u.email as electrician_email, u.name as electrician_name,
           j.name as job_site_name, j.address as job_site_address
    FROM requests r
    LEFT JOIN users u ON r.electrician_id = u.id
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    WHERE r.id = ? AND r.company_id = ?
  `).get(requestId, companyId) as any;

  if (!request) return;

  // ─── Budget tracking ───
  if (request.job_site_id) {
    try {
      const settings = db.prepare('SELECT large_order_threshold FROM company_settings WHERE company_id = ?').get(companyId) as any;
      const threshold: number = settings?.large_order_threshold ?? 2000;

      const productRow = db.prepare(
        "SELECT price FROM products WHERE LOWER(name) LIKE LOWER(?) ORDER BY price ASC LIMIT 1"
      ).get(`%${request.product}%`) as any;
      const unitPrice: number = productRow?.price ?? 0;
      const orderAmount: number = unitPrice * request.quantity;

      if (orderAmount > 0) {
        db.prepare('UPDATE job_sites SET budget_committed = COALESCE(budget_committed, 0) + ? WHERE id = ? AND company_id = ?')
          .run(orderAmount, request.job_site_id, companyId);
      }

      const site = db.prepare(
        'SELECT budget_total, budget_committed FROM job_sites WHERE id = ? AND company_id = ?'
      ).get(request.job_site_id, companyId) as any;

      const officeEmails = db.prepare(
        "SELECT email FROM users WHERE role IN ('office', 'admin') AND company_id = ?"
      ).all(companyId) as { email: string }[];

      if (site?.budget_total && orderAmount > 0) {
        const prevCommitted = (site.budget_committed ?? 0) - orderAmount;
        const oldPct = (prevCommitted / site.budget_total) * 100;
        const newPct = ((site.budget_committed ?? 0) / site.budget_total) * 100;

        if (oldPct < 80 && newPct >= 80 && newPct < 100) {
          db.prepare(
            "INSERT INTO budget_alerts (company_id, job_site_id, type, amount, message) VALUES (?, ?, '80_percent', ?, ?)"
          ).run(companyId, request.job_site_id, site.budget_committed, `80% du budget atteint pour ${request.job_site_name}`);
          for (const u of officeEmails) {
            sendBudgetAlertEmail(u.email, {
              type: '80_percent', jobSite: request.job_site_name,
              committed: site.budget_committed, total: site.budget_total,
            }).catch(console.error);
          }
        }
        if (oldPct < 100 && newPct >= 100) {
          db.prepare(
            "INSERT INTO budget_alerts (company_id, job_site_id, type, amount, message) VALUES (?, ?, '100_percent', ?, ?)"
          ).run(companyId, request.job_site_id, site.budget_committed, `Budget dépassé pour ${request.job_site_name}`);
          for (const u of officeEmails) {
            sendBudgetAlertEmail(u.email, {
              type: '100_percent', jobSite: request.job_site_name,
              committed: site.budget_committed, total: site.budget_total,
            }).catch(console.error);
          }
        }
      }

      if (orderAmount > threshold) {
        db.prepare(
          "INSERT INTO budget_alerts (company_id, job_site_id, type, amount, message) VALUES (?, ?, 'large_order', ?, ?)"
        ).run(companyId, request.job_site_id, orderAmount, `Commande de ${orderAmount.toFixed(2)}$ pour ${request.product}`);
        for (const u of officeEmails) {
          sendBudgetAlertEmail(u.email, {
            type: 'large_order', jobSite: request.job_site_name,
            amount: orderAmount, product: request.product, threshold,
          }).catch(console.error);
        }
      }
    } catch (err) {
      console.error('Budget tracking error:', err);
    }
  }

  // Send status email to electrician
  if (request.electrician_email) {
    sendStatusEmail(request.electrician_email, {
      product: request.product,
      quantity: request.quantity,
      unit: request.unit,
      status: 'approved',
      officeComment: office_comment,
    }).catch(console.error);
  }

  // Trigger auto-order async
  const companySettings = db.prepare('SELECT supplier_preference, office_address, default_delivery FROM company_settings WHERE company_id = ?').get(companyId) as any;
  const preference: 'cheapest' | 'fastest' = companySettings?.supplier_preference || 'cheapest';
  const deliveryMode: 'office' | 'jobsite' = delivery_override || companySettings?.default_delivery || 'office';
  const deliveryAddress: string =
    deliveryMode === 'office'
      ? (companySettings?.office_address || '')
      : (request.job_site_address || companySettings?.office_address || '');

  let payment: PaymentInfo | undefined;
  const pm = db.prepare('SELECT card_holder, card_number_encrypted, card_expiry, card_last4, card_cvv_encrypted FROM company_payment_methods WHERE company_id = ?').get(companyId) as any;
  if (pm) {
    payment = {
      cardHolder: pm.card_holder,
      cardNumber: decrypt(pm.card_number_encrypted),
      cardExpiry: pm.card_expiry,
      cardCvv: decrypt(pm.card_cvv_encrypted),
    };
  }

  ;(async () => {
    try {
      const { result, supplier, reason } = await selectAndOrder(
        preference,
        request.job_site_address || '',
        request.product,
        request.quantity,
        request.supplier || undefined,
        companyId,
        deliveryAddress || undefined,
        payment,
      );

      const cancelToken = randomUUID();
      const cancelExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const orderStatus = result.success ? 'confirmed' : result.inCart ? 'pending' : 'failed';

      db.prepare(`
        INSERT INTO supplier_orders (company_id, request_id, supplier, supplier_order_id, status, cancel_token, cancel_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, requestId, supplier, result.orderId || null, orderStatus, cancelToken, cancelExpiresAt);

      const officeUsers = db.prepare("SELECT email FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(companyId) as { email: string }[];
      const allEmails = [...officeUsers.map(u => u.email), request.electrician_email].filter(Boolean);

      if (result.success) {
        for (const email of allEmails) {
          sendOrderConfirmationEmail(email, {
            product: request.product, quantity: request.quantity, unit: request.unit,
            jobSite: request.job_site_name, supplier, reason, orderId: result.orderId!, cancelToken,
          }).catch(console.error);
        }
      } else if (result.inCart) {
        for (const email of allEmails) {
          sendCartNotificationEmail(email, {
            product: request.product, quantity: request.quantity, unit: request.unit,
            jobSite: request.job_site_name, supplier, reason,
          }).catch(console.error);
        }
      }
    } catch (err) {
      console.error('Supplier ordering failed:', err);
    }
  })();
}
```

**Step 2: Refactor `app/api/requests/[id]/route.ts` to use `triggerApproval()`**

Replace the entire PATCH body with:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { triggerApproval } from '@/lib/approval';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { status, office_comment, delivery_override } = await req.json();
  const db = getDb();

  if (status === 'approved') {
    await triggerApproval(parseInt(id), ctx.companyId, db, delivery_override, office_comment);
  } else {
    // rejected
    db.prepare(`
      UPDATE requests SET status = ?, office_comment = ?, decision_date = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?
    `).run(status, office_comment || '', id, ctx.companyId);

    const request = db.prepare(`
      SELECT r.*, u.email as electrician_email FROM requests r
      LEFT JOIN users u ON r.electrician_id = u.id
      WHERE r.id = ? AND r.company_id = ?
    `).get(id, ctx.companyId) as any;

    if (request?.electrician_email) {
      const { sendStatusEmail } = await import('@/lib/email');
      sendStatusEmail(request.electrician_email, {
        product: request.product, quantity: request.quantity, unit: request.unit,
        status, officeComment: office_comment,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}
```

Keep the DELETE handler unchanged.

**Step 3: Verify the app builds**

Run: `cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 4: Commit**
```bash
git add lib/approval.ts app/api/requests/[id]/route.ts
git commit -m "refactor: extract triggerApproval() into lib/approval.ts"
```

---

### Task 3: Add PATCH to `app/api/users/[id]/route.ts`

**Files:**
- Modify: `app/api/users/[id]/route.ts`

**Step 1: Add PATCH handler at the end of the file:**

```typescript
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id);
  const body = await req.json();

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND company_id = ?').get(userId, ctx.companyId);
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

  if (typeof body.auto_approve === 'boolean') {
    db.prepare('UPDATE users SET auto_approve = ? WHERE id = ? AND company_id = ?')
      .run(body.auto_approve ? 1 : 0, userId, ctx.companyId);
  }

  return NextResponse.json({ ok: true });
}
```

**Step 2: Verify builds**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**
```bash
git add app/api/users/[id]/route.ts
git commit -m "feat: add PATCH /api/users/[id] to toggle auto_approve"
```

---

### Task 4: Update `POST /api/requests` to trigger auto-approval

**Files:**
- Modify: `app/api/requests/route.ts`

**Step 1: Update the POST handler**

Replace the current POST function with:
```typescript
export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { product, quantity, unit, job_site_id, urgency, note, supplier } = await req.json();
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO requests (company_id, product, quantity, unit, job_site_id, electrician_id, urgency, note, status, supplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(ctx.companyId, product, quantity, unit, job_site_id, ctx.userId, urgency ? 1 : 0, note || '', supplier || null);

  const requestId = result.lastInsertRowid;

  // Check if this electrician has auto_approve enabled
  const userRow = db.prepare('SELECT auto_approve FROM users WHERE id = ? AND company_id = ?').get(ctx.userId, ctx.companyId) as any;

  const officeUsers = db.prepare("SELECT email FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(ctx.companyId) as { email: string }[];
  const jobSite = db.prepare('SELECT name FROM job_sites WHERE id = ?').get(job_site_id) as { name: string } | undefined;

  if (userRow?.auto_approve) {
    // Auto-approve: skip pending, trigger approval immediately
    const { triggerApproval } = await import('@/lib/approval');
    triggerApproval(requestId, ctx.companyId, db).catch(console.error);
  } else {
    // Normal flow: notify office of pending request
    for (const u of officeUsers) {
      sendNewRequestEmail(u.email, {
        product, quantity, unit,
        jobSite: jobSite?.name || '',
        electrician: '',
        urgency: !!urgency,
        note: note || '',
      }).catch(console.error);
    }
  }

  return NextResponse.json({ id: requestId });
}
```

**Step 2: Verify builds**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**
```bash
git add app/api/requests/route.ts
git commit -m "feat: auto-approve requests for flagged electricians"
```

---

### Task 5: Admin UI — add toggle to user list

**Files:**
- Modify: `app/admin/page.tsx`

**Step 1: Update the `User` interface and add toggle function**

Change line 7:
```typescript
interface User { id: number; name: string; email: string; role: string; auto_approve: number; }
```

Add this function after `handleDeleteUser`:
```typescript
async function handleToggleAutoApprove(id: number, current: number) {
  await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_approve: !current }),
  });
  loadUsers();
}
```

**Step 2: Add toggle button in the user card**

Find this block in the user list (around line 162):
```tsx
<div key={u.id} className="bg-white rounded-2xl border border-gray-200 p-4">
  <div className="flex items-center justify-between">
    <div>
      <p className="font-semibold text-gray-900">{u.name}</p>
      <p className="text-sm text-gray-500">{u.email}</p>
    </div>
    <div className="flex items-center gap-2">
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor[u.role]}`}>
        {roleLabel[u.role]}
      </span>
      <button
        onClick={() => handleDeleteUser(u.id)}
        ...
      >
```

Replace with:
```tsx
<div key={u.id} className="bg-white rounded-2xl border border-gray-200 p-4">
  <div className="flex items-center justify-between">
    <div>
      <p className="font-semibold text-gray-900">{u.name}</p>
      <p className="text-sm text-gray-500">{u.email}</p>
    </div>
    <div className="flex items-center gap-2">
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor[u.role]}`}>
        {roleLabel[u.role]}
      </span>
      {u.role === 'electrician' && (
        <button
          onClick={() => handleToggleAutoApprove(u.id, u.auto_approve)}
          title={u.auto_approve ? 'Auto-approuvé — cliquer pour désactiver' : 'Cliquer pour activer auto-approbation'}
          className={`text-xs px-2 py-1 rounded-full font-medium transition ${
            u.auto_approve
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
        >
          {u.auto_approve ? 'Auto ✓' : 'Auto'}
        </button>
      )}
      <button
        onClick={() => handleDeleteUser(u.id)}
        ...
      >
```

**Step 3: Verify builds**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 4: Commit and push**
```bash
git add app/admin/page.tsx
git commit -m "feat: add auto-approve toggle in admin user list"
git push origin main
```
