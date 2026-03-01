# Email Verification & Password Confirmation — Design

**Date:** 2026-03-01

## Overview

Add email verification (6-digit code) and password confirmation to the signup flow. Currently signup goes straight from form → Stripe. The new flow adds a verification gate before the full form is shown.

## New Signup Flow (3 steps, inline on the existing page)

### Step 1 — Email
- User enters their email address
- Clicks "Envoyer le code"
- API generates a 6-digit code, stores it in DB with 15 min expiry, sends it by email
- UI transitions to Step 2

### Step 2 — Code verification
- Displays "Code envoyé à [email]"
- 6-digit code input + "Vérifier" button
- "Renvoyer le code" link (calls the same send API)
- API validates code, returns a short-lived signed token (15 min)
- UI transitions to Step 3

### Step 3 — Full form
- Company name, full name, password, confirm password
- Client-side validation: passwords must match before submitting
- Submits token + all fields to register API
- Register API validates token before creating pending_signup
- Redirects to Stripe as before

## API Changes

### New: `POST /api/auth/send-verification`
- Body: `{ email }`
- Generates 6-digit code, upserts row in `email_verifications`, sends email
- Returns: `{ ok: true }`

### New: `POST /api/auth/verify-code`
- Body: `{ email, code }`
- Checks code matches and is not expired
- Marks row as verified, returns `{ token }` (random UUID, 15 min expiry)
- Returns 400 if code wrong or expired

### Modified: `POST /api/auth/register`
- Adds `verificationToken` to accepted body
- Checks `email_verifications` table: token must match email, be verified, and not expired
- Proceeds as before if valid; returns 400 if not

## Database

New table added in `initDb`:

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

## Frontend (`app/page.tsx`)

- Add `step` state: `'email' | 'code' | 'form'` (only for signup mode)
- Step 1: email input + send button
- Step 2: code input (6 digits) + verify button + resend link
- Step 3: existing fields + `confirmPassword` field
- Client-side password match check before calling register
- Pass `verificationToken` in register body

## Email (`lib/email.ts`)

Add `sendVerificationCodeEmail(to, code)` — simple transactional email with the 6-digit code and 15-minute expiry notice.

## What Does NOT Change

- Login flow is unchanged
- Password confirmation is frontend-only (no backend change)
- `pending_signups` table is unchanged
- Stripe redirect flow is unchanged
