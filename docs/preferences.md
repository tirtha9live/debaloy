# Project Preferences

This file persists product, UI, and implementation decisions for **Debaloy** across tasks and threads. Review it at the start of every task and update it whenever decisions change.

## Product identity

- Project / brand name: **Debaloy**.
- Association: Debaloy Flat Owners Welfare Association, 93 Baguiati Road, 3rd Lane & 68 Baguiati Road, 4th Lane, Kolkata – 700028.
- Domain: Cloudflare Workers hostname `https://debaloy.tirtha-das-in.workers.dev` (free). Not a polished custom domain.
- Positioning: a private building ledger. The Excel workbook in `temp/Debaloy_2026-27.xlsx` (built by `temp/build_workbook.py`) is the source of truth for sheets, flats, months, and formulas.
- MVP: web equivalent of that workbook for FY 2026-27.

## Access model

- Landing page is a password gate. No public ledger data.
- Resident password and admin password are **Worker secrets** (`RESIDENT_PASSWORD`, `ADMIN_PASSWORD`) so they can be rotated later with `wrangler secret put` on the **debaloy** Worker only.
- Local values live in `.dev.vars` (gitignored). Never commit secrets. Never overwrite secrets on other Workers (`bytebox`, `easyhumanize`, etc.).
- Password `debaloy6893` (secret) → welcome resident, read-only ledger.
- Password `ledgeradmin4979` (secret) → welcome treasurer, Excel-like editing.
- Treasurer login does not change the books. When the treasurer adds or edits data, stamp `last_updated_at` in `settings`. Residents (and treasurer) see **Last updated on {date}** only — calendar date in Asia/Kolkata, no time. Hidden until the first save.
- Admin can **View as resident** via `?view=resident` on ledger URLs (MPA, deep-linkable). “Back to treasurer” drops the query param.
- Sessions live in Cloudflare KV (`SESSION`), HttpOnly cookie `debaloy_sid`, 7-day TTL.
- A wrong password is allowed **3 times**. After the second failure the login page says **You have 1 attempt left.** The third failure locks that client IP for **3 minutes** in KV (`loginlock:`). The Worker rejects further POSTs during the lock. The button shows a countdown. Failed attempts expire after 30 minutes if they never reach the lock. A successful login clears the count. Login submit (click or Enter) otherwise shows “Logging in…”. All of this uses Workers KV + Web Crypto only (no Node APIs).
- Treasurer **Activity** (`/ledger/activity`) lists sessions (IP, device, UA, views, downloads, fingerprint) because the resident password is shared. A login audit records signed in/out, wrong password, and lockouts. Roles are stored as text so more roles can be added later. First-party D1 only — no third-party analytics. Hidden from residents and View as resident.

## Architecture preference

- Prefer **MPA pages** over SPA routing for SEO and shareable sheet URLs.
- Sheets are separate routes: `/ledger`, `/ledger/handover`, `/ledger/maintenance`, `/ledger/puja`, `/ledger/income`, `/ledger/expenses`, `/ledger/receipts`.
- Client JS is enhancement only (theme, download menu with spinner, dirty-form warning, save confirmation). Saves use form POST.
- Treasurer Save sheet (and income/expense Save, Add row, Add type) first lists every value that would change, such as `0.00 → 5,000.00`. Nothing is written until Confirm save. Review again cancels.
- Download is one control. Click opens **Excel formatted** (workbook colours and layout from `temp/build_workbook.py`), **Excel raw** (values only), and **Image** (PNG of the current sheet). Treasurer also gets **JSON export** (dated D1 dump) and **JSON import**. Import can **Merge** (upsert, keep extra rows) or **Overwrite** (clear the live tables, then restore the file). Residents and View as resident do not see JSON options. Excel/JSON export links still work if JS is off (`/api/export?kind=formatted|raw|json`).
- Layout is phone-first. Residents and the treasurer should be able to view and update on a mobile browser: stacked sheet menu, 44px inputs, sticky Save on edit sheets, sideways swipe for wide grids.
- Handover is the original takeover record (FY 2024-26). Read-only for everyone. Kept for later reference.
- This year’s account (`/ledger/receipts`) is the live FY 2026-27 receipts & payments statement in the same form as handover. It updates as Maintenance, Puja, Income, and Expenses are added, and is what residents/admins download. Closing cash in hand / bank are the only R&P fields editable by admin.
- Income and expense trackers start with the built-in types only. The treasurer can add named types from the category summary; those types then appear in the log dropdown and on This Year. Blank spare slots are not shown.
- Excel workbook always includes a frozen **Handover** sheet plus a live **This Year 2026-27** sheet. Formatted Excel follows the Python builder’s palette (dark-blue headers, cream amount cells, section fills). Image download of This Year also includes carry-forward closing balances and signature lines.

## Tech stack

- **Astro** `output: 'server'` with **@astrojs/cloudflare** (`imageService: 'passthrough'` so Images bindings are not auto-provisioned).
- Access env via `import { env } from 'cloudflare:workers'` (Astro 6; no `Astro.locals.runtime`).
- **Tailwind CSS v4**, CSS-first via `@tailwindcss/vite`. Tokens in `src/styles/global.css` (`@theme`). No `tailwind.config.*`, no CDN.
- Design follows [`DESIGN.md`](../DESIGN.md): Vercel-inspired ink/canvas, hairline borders, stacked shadows, mesh gradient at hero/login only, Inter + JetBrains Mono.
- D1 `debaloy-ledger` stores ledger rows. KV `debaloy-session` stores sessions.
- Excel download is generated server-side with `exceljs` (excluded from Vite’s dep optimizer; bundled for the Worker). Formatted matches `temp/build_workbook.py`; raw is an unstyled values workbook. Image download is client-side PNG of `#sheet-capture` via `html-to-image`.

## Theme preference

- Default theme is **light mode**. Dark mode is optional (the moon/sun toggle).
- Do **not** store theme on the login session. Residents share one password, so a server-side choice would apply to everyone.
- Remember the last choice on this device/browser until site cookies are cleared (Chrome “delete cookies”, etc.). Cookie `debaloy_theme` (400 days, sliding) plus `localStorage` key `theme-preference`. Another phone starts on light.
- Dark mode shows the **sun** icon (switch to light). Light mode shows the **moon** icon.
- Applied before paint via `.dark` + `[data-theme]` on `<html>`. Tailwind `dark:` is bound to `.dark`.

## Analytics / ads

- **No** third-party analytics, ad networks, or measurement IDs (no gtag, AdSense, pixels). Do not reintroduce.
- First-party session and login audit for the treasurer lives in D1 (`visitors`, `login_events`). That is the only tracking.

## Cloudflare isolation

- This is a **new** Worker named `debaloy`. It must not reuse, delete, or overwrite live **bytebox** resources:
  - Worker `bytebox`
  - KV `bytebox-session` id `5eb979cbb1ce4ce39ff556d37e3e7b58`
  - D1 `bytebox-feedback` id `cdf20eac-64b4-41da-b945-b04b4bb409b5`
- Account ID (unchanged): `b6bd3fa3e8ee9d0873fd3b19564b2215`.
- Dedicated resources:
  - Worker: `debaloy`
  - KV `debaloy-session` (binding `SESSION`, id `3abc22bcdabf4082b70d15ab77fe477f`)
  - D1 `debaloy-ledger` (binding `DB`, id `0506c321-9cac-4f3b-90a9-63e1ee490ec4`)
- Secrets on debaloy: `RESIDENT_PASSWORD`, `ADMIN_PASSWORD` only. Do not put or overwrite `ADMIN_USERNAME` / `DEEPSEEK_API_KEY` from the old project.

## Hidden or disabled UI

- No pricing, signup, marketing tools, email extractor, or contact/feedback forms unless explicitly requested.
- Ledger pages are `noindex`.

## Working rule

- At task start: review and follow this file.
- At task completion: update this file if preferences changed.

## Related references

- [`docs/ui-preferences.md`](ui-preferences.md)
- [`DESIGN.md`](../DESIGN.md)
- [`temp/build_workbook.py`](../temp/build_workbook.py)
- [`wrangler.toml`](../wrangler.toml)
