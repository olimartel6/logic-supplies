# Email Verification + Password Confirmation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 3-step email verification flow to signup (email → code → form) and a password confirmation field.

**Architecture:** New `email_verifications` DB table stores codes and tokens. Two new API routes handle sending and verifying codes. The register API gains a token check. The frontend `page.tsx` gains a `step` state machine for the 3-step signup UX.

**Tech Stack:** Next.js 14 App Router, better-sqlite3, nodemailer (already wired), TypeScript, Tailwind CSS.

---

### Task 1: Add `email_verifications` table to DB

**Files:**
- Modify: `lib/db.ts` — add table inside the `initDb` CREATE block

**Step 1: Find the right place in `initDb`**

In `lib/db.ts`, find the `CREATE TABLE IF NOT EXISTS pending_signups` block (around line 462). Add the new table right after it:

```sql
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  token TEXT,
  verified INTEGER DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Add it inside the same `db.exec(` string, right after the `pending_signups` table definition.

**Step 2: Verify locally**

```bash
cd app
node -e "const { getDb } = require('./lib/db'); const db = getDb(); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE name='email_verifications'\").get())"
```

Expected: `{ name: 'email_verifications' }`

**Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add email_verifications table"
```

---

### Task 2: Add `sendVerificationCodeEmail` to `lib/email.ts`

**Files:**
- Modify: `lib/email.ts` — append new exported function at the bottom

**Step 1: Append function**

Add at the end of `lib/email.ts`:

```typescript
export async function sendVerificationCodeEmail(to: string, code: string) {
  if (!process.env.SMTP_USER) return;
  await transporter.sendMail({
    from: `"logicSupplies" <${process.env.SMTP_USER}>`,
    to,
    subject: `${code} — Votre code de vérification logicSupplies`,
    html: `
      <h2>Vérification de votre adresse email</h2>
      <p>Voici votre code de vérification :</p>
      <div style="font-size:2.5rem;font-weight:bold;letter-spacing:0.3em;padding:16px 0;color:#2563eb;">${code}</div>
      <p style="color:#666;font-size:14px;">Ce code expire dans 15 minutes.</p>
      <p style="color:#666;font-size:14px;">Si vous n'avez pas demandé ce code, ignorez cet email.</p>
    `,
  });
}
```

**Step 2: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add sendVerificationCodeEmail"
```

---

### Task 3: Create `POST /api/auth/send-verification` route

**Files:**
- Create: `app/api/auth/send-verification/route.ts`

**Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendVerificationCodeEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Email invalide.' }, { status: 400 });
  }

  const db = getDb();

  // Check email not already registered
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Upsert: replace any previous code for this email
  db.prepare(`
    DELETE FROM email_verifications WHERE email = ?
  `).run(email.toLowerCase());

  db.prepare(`
    INSERT INTO email_verifications (email, code, expires_at)
    VALUES (?, ?, ?)
  `).run(email.toLowerCase(), code, expiresAt);

  await sendVerificationCodeEmail(email, code);

  return NextResponse.json({ ok: true });
}
```

**Step 2: Commit**

```bash
git add app/api/auth/send-verification/route.ts
git commit -m "feat: add send-verification API route"
```

---

### Task 4: Create `POST /api/auth/verify-code` route

**Files:**
- Create: `app/api/auth/verify-code/route.ts`

**Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { email, code } = await req.json();

  if (!email || !code) {
    return NextResponse.json({ error: 'Champs manquants.' }, { status: 400 });
  }

  const db = getDb();

  const row = db.prepare(`
    SELECT * FROM email_verifications
    WHERE email = ? AND code = ? AND expires_at > datetime('now')
  `).get(email.toLowerCase(), String(code)) as any;

  if (!row) {
    return NextResponse.json({ error: 'Code invalide ou expiré.' }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`
    UPDATE email_verifications
    SET token = ?, verified = 1, expires_at = ?
    WHERE id = ?
  `).run(token, tokenExpiresAt, row.id);

  return NextResponse.json({ token });
}
```

**Step 2: Commit**

```bash
git add app/api/auth/verify-code/route.ts
git commit -m "feat: add verify-code API route"
```

---

### Task 5: Update `POST /api/auth/register` to validate token

**Files:**
- Modify: `app/api/auth/register/route.ts`

**Step 1: Add token validation**

Replace the existing POST handler body. Key changes: accept `verificationToken`, validate it against the DB before proceeding, clean up the row after use.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { companyName, adminName, adminEmail, adminPassword, verificationToken } = await req.json();

  if (!companyName || !adminName || !adminEmail || !adminPassword || !verificationToken) {
    return NextResponse.json({ error: 'Tous les champs sont requis.' }, { status: 400 });
  }
  if (adminPassword.length < 6) {
    return NextResponse.json({ error: 'Mot de passe : 6 caractères minimum.' }, { status: 400 });
  }

  const db = getDb();

  // Validate verification token
  const verification = db.prepare(`
    SELECT * FROM email_verifications
    WHERE email = ? AND token = ? AND verified = 1 AND expires_at > datetime('now')
  `).get(adminEmail.toLowerCase(), verificationToken) as any;

  if (!verification) {
    return NextResponse.json({ error: 'Vérification email expirée. Recommencez.' }, { status: 400 });
  }

  // Check email not already used
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail.toLowerCase());
  if (existing) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 });
  }

  // Get configured Stripe payment link
  const linkSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'stripe_payment_link'").get() as any;
  const paymentLink = linkSetting?.value || '';
  if (!paymentLink) {
    return NextResponse.json({ error: 'Paiement non configuré. Contactez-nous.' }, { status: 503 });
  }

  const passwordHash = bcrypt.hashSync(adminPassword, 10);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO pending_signups (id, company_name, admin_name, admin_email, admin_password_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, companyName, adminName, adminEmail.toLowerCase(), passwordHash, expiresAt);

  // Clean up verification row
  db.prepare('DELETE FROM email_verifications WHERE id = ?').run(verification.id);

  const url = `${paymentLink}?client_reference_id=${id}&prefilled_email=${encodeURIComponent(adminEmail)}`;

  return NextResponse.json({ url });
}
```

**Step 2: Commit**

```bash
git add app/api/auth/register/route.ts
git commit -m "feat: require email verification token in register"
```

---

### Task 6: Update frontend `app/page.tsx` — 3-step signup + password confirmation

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add new state variables at the top of the component**

After the existing `useState` declarations, add:

```typescript
const [step, setStep] = useState<'email' | 'code' | 'form'>('email');
const [verificationToken, setVerificationToken] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');
const [codeSent, setCodeSent] = useState(false);
const [resendCooldown, setResendCooldown] = useState(0);
```

**Step 2: Add `handleSendCode` function** (after `handleSignUp`):

```typescript
async function handleSendCode(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setError('');
  const res = await fetch('/api/auth/send-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  setLoading(false);
  if (!res.ok) { setError(data.error); return; }
  setStep('code');
  setCodeSent(true);
  // 30-second resend cooldown
  setResendCooldown(30);
  const interval = setInterval(() => {
    setResendCooldown(n => { if (n <= 1) { clearInterval(interval); return 0; } return n - 1; });
  }, 1000);
}
```

**Step 3: Add `handleVerifyCode` function**:

```typescript
async function handleVerifyCode(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setError('');
  const res = await fetch('/api/auth/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code: password }), // reuse `password` state for the code field
  });
  const data = await res.json();
  setLoading(false);
  if (!res.ok) { setError(data.error); return; }
  setVerificationToken(data.token);
  setPassword(''); // clear the code field before the password step
  setStep('form');
}
```

> Note: We reuse the `password` state field to hold the code temporarily (step 2), then clear it before step 3. This avoids adding yet another state field.

**Step 4: Update `handleSignUp`** to include `confirmPassword` check and `verificationToken`:

```typescript
async function handleSignUp(e: React.FormEvent) {
  e.preventDefault();
  if (!acceptedTerms || !acceptedPrivacy) return;
  if (password !== confirmPassword) {
    setError('Les mots de passe ne correspondent pas.');
    return;
  }
  setLoading(true);
  setError('');
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName, adminName, adminEmail: email, adminPassword: password, verificationToken }),
  });
  const data = await res.json();
  if (!res.ok) {
    setError(data.error);
    setLoading(false);
    return;
  }
  window.location.href = data.url;
}
```

**Step 5: Update the `<form>` JSX for signup mode**

Replace the current `onSubmit` on the form so it routes to the right handler per step:

```tsx
<form
  onSubmit={
    mode === 'signin'
      ? handleLogin
      : step === 'email'
      ? handleSendCode
      : step === 'code'
      ? handleVerifyCode
      : handleSignUp
  }
  className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4"
>
```

**Step 6: Add step-aware signup body** — replace the existing `{mode === 'signup' && (...)}` block and the shared fields section with:

```tsx
{mode === 'signup' && step === 'email' && (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
    <input
      type="email"
      value={email}
      onChange={e => setEmail(e.target.value)}
      required
      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      placeholder="ton@email.com"
    />
  </div>
)}

{mode === 'signup' && step === 'code' && (
  <>
    <p className="text-sm text-gray-600">
      Code envoyé à <span className="font-medium">{email}</span>
    </p>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Code de vérification</label>
      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={password}
        onChange={e => setPassword(e.target.value.replace(/\D/g, ''))}
        required
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.4em] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="000000"
        autoFocus
      />
    </div>
    <button
      type="button"
      disabled={resendCooldown > 0}
      onClick={handleSendCode as any}
      className="text-sm text-blue-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {resendCooldown > 0 ? `Renvoyer le code (${resendCooldown}s)` : 'Renvoyer le code'}
    </button>
  </>
)}

{mode === 'signup' && step === 'form' && (
  <>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la compagnie</label>
      <input
        type="text"
        value={companyName}
        onChange={e => setCompanyName(e.target.value)}
        required
        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Électrique ABC Inc."
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Votre nom</label>
      <input
        type="text"
        value={adminName}
        onChange={e => setAdminName(e.target.value)}
        required
        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Jean Tremblay"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="••••••••"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le mot de passe</label>
      <input
        type="password"
        value={confirmPassword}
        onChange={e => setConfirmPassword(e.target.value)}
        required
        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="••••••••"
      />
    </div>
  </>
)}

{/* Login fields (unchanged) */}
{mode === 'signin' && (
  <>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="ton@email.com"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="••••••••"
      />
    </div>
  </>
)}
```

**Step 7: Update the legal checkboxes** — only show them when `mode === 'signup' && step === 'form'` OR `mode === 'signin'`:

```tsx
{(mode === 'signin' || step === 'form') && (
  <div className="space-y-3 pt-1">
    {/* ... existing checkboxes unchanged ... */}
  </div>
)}
```

**Step 8: Update the submit button label**:

```tsx
{loading
  ? (mode === 'signup'
      ? (step === 'email' ? 'Envoi...' : step === 'code' ? 'Vérification...' : 'Redirection vers le paiement...')
      : 'Connexion...')
  : (mode === 'signup'
      ? (step === 'email' ? 'Envoyer le code →' : step === 'code' ? 'Vérifier →' : 'Continuer vers le paiement →')
      : 'Se connecter')}
```

**Step 9: Reset step when switching modes**

In the mode toggle buttons, reset the step:

```tsx
onClick={() => { setMode('signin'); setError(''); setStep('email'); setPassword(''); }}
// and
onClick={() => { setMode('signup'); setError(''); setStep('email'); setPassword(''); }}
```

**Step 10: Update `canSubmit`** — legal checkboxes only block step 'form' for signup:

```typescript
const canSubmit = (mode === 'signin' || step === 'form' ? (acceptedTerms && acceptedPrivacy) : true) && !loading;
```

**Step 11: Commit**

```bash
git add app/page.tsx
git commit -m "feat: 3-step email verification + password confirmation in signup"
```

---

### Task 7: Final cleanup — remove debug logging from BMR

**Files:**
- Modify: `lib/bmr-catalog.ts` — remove the `[BMR DEBUG]` block added for diagnosis

Find and delete the `const debug = await page.evaluate(...)` block and the `console.error('[BMR DEBUG]', ...)` line added in a previous session.

**Commit:**

```bash
git add lib/bmr-catalog.ts
git commit -m "chore: remove BMR debug logging"
```

---

### Task 8: Push everything

```bash
git push
```

Then update parent repo submodule:

```bash
cd ..
git add app
git commit -m "feat: email verification + password confirmation on signup"
git push
```
