# Auto-Approve Electricians Design

**Date:** 2026-02-27

## Goal

Admin can mark specific electricians as "no approval needed". Their requests are automatically approved and trigger the auto-order flow immediately, with an email notification sent to the office.

## Architecture

- Add `auto_approve` column to `users` table
- On request creation, check if electrician has `auto_approve = 1` — if so, skip the pending state and run the same approval + auto-order logic as a manual approval
- Extract shared `triggerApproval(requestId, db)` function to avoid duplicating the approval logic
- Admin UI toggle per electrician in the users list

## Components

### DB
- `users.auto_approve INTEGER DEFAULT 0` — added via ALTER TABLE guard in `initDb()`

### API
- `PATCH /api/admin/users/[id]` — new endpoint, admin only, accepts `{ auto_approve: boolean }`
- `POST /api/requests` — after insert, if `auto_approve = 1`: call `triggerApproval()`
- `lib/approval.ts` — new shared file with `triggerApproval(requestId, companyId, db)` extracted from PATCH `/api/requests/[id]`

### UI
- `/app/admin/page.tsx` — add toggle next to each electrician: "Commandes auto-approuvées"

## Notifications
- When auto-approved, send the same office notification email as a manual approval
- Electrician also receives the order confirmation email
