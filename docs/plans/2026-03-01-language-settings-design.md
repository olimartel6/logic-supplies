# Language Settings Design

**Goal:** Allow each user (electrician, office, admin) to individually choose their app language (FR/EN/ES), with the preference persisted in the database and applied to both the UI and outgoing emails.

**Architecture:** React Context + DB column. No external i18n library. Language preference stored per user in `users.language`, loaded at login, applied globally via a `LanguageContext`. Emails respect the recipient's language preference.

**Supported languages:** French (`fr`), English (`en`), Spanish (`es`)

---

## Data Layer

- Add column `language TEXT DEFAULT 'fr'` to `users` table via migration in `initDb`
- `PATCH /api/auth/me` accepts `{ language }` field and persists it
- `GET /api/auth/me` returns `language` in the response

## Translation Layer

- New file `lib/i18n.ts` exporting a translations object: `{ fr: {...}, en: {...}, es: {...} }`
- All UI strings for every page are included (NavBar, new-request, approvals, my-requests, profile, settings, admin, superadmin, etc.)
- Hook `useT()` exported from `lib/i18n.ts` — reads from `LanguageContext`, returns `(key: string) => string`

## Context Layer

- New file `lib/LanguageContext.tsx` — React Context holding `{ lang, setLang }`
- `LanguageProvider` wraps `app/layout.tsx`, fetches language from `/api/auth/me` on mount
- All pages use `const t = useT()` then `t('key')` for all displayed text

## UI — Language Selector

- In `app/profile/page.tsx`, add a language picker section (visible to all roles)
- Three toggle buttons: 🇫🇷 Français / 🇨🇦 English / 🇪🇸 Español
- On select: `PATCH /api/auth/me` with `{ language }`, then update context (`setLang`)
- Change takes effect immediately (no page reload needed)

## Emails

- All email functions in `lib/email.ts` accept a `lang: 'fr' | 'en' | 'es'` parameter
- Subject lines and HTML bodies switch based on `lang`
- Callers (API routes) look up the target user's `language` from DB before calling email function

---

## Files to Create

- `lib/i18n.ts` — translations + `useT` hook
- `lib/LanguageContext.tsx` — React Context provider

## Files to Modify

- `lib/db.ts` — add migration for `language` column
- `lib/email.ts` — add `lang` param to all send functions
- `app/layout.tsx` — wrap with `LanguageProvider`
- `app/profile/page.tsx` — add language selector
- `app/api/auth/me/route.ts` — handle `language` in GET and PATCH
- All page files — replace hardcoded strings with `t('key')`
- All API routes that send emails — pass user's `language` to email functions
