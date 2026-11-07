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
- Sheets are separate routes: `/ledger`, `/ledger/handover`, `/ledger/maintenance`, `/ledger/puja`, `/ledger/income`, `/ledger/expenses`, `/ledger/withdrawals`, `/ledger/receipts`, `/ledger/years`, `/ledger/bank-holidays`. **E-Receipts** and **Online payments** are built but parked (`DISABLED_SHEET_SLUGS`): hidden from resident and treasurer nav, home, and archive snapshots. Direct URLs redirect to `/ledger`; their APIs return 404 until we turn them back on.
- Client JS is enhancement only (theme, download menu with spinner, dirty-form warning, save confirmation). Saves use form POST.
- Treasurer Save sheet (and income/expense/withdrawal Save, Add row, Add type) first lists every value that would change, such as `0.00 → 5,000.00`. Nothing is written until Confirm save. Review again cancels.
- Download is one control. Click opens **Excel formatted** and **Excel raw**. Treasurer also gets **JSON export** and **JSON import**. Import can **Merge** or **Overwrite**. Residents and View as resident do not see JSON options. Excel/JSON export links still work if JS is off (`/api/export?kind=formatted|raw|json`).
- Layout is phone-first. Residents and the treasurer should be able to view and update on a mobile browser: stacked sheet menu, 44px inputs, sticky Save on edit sheets, sideways swipe for Maintenance. This Year and Handover stack receipts then payments on phones so labels wrap. On Maintenance, **NPR** means no payment required: paid in advance, or paid as dues at a later date. The lump sum goes in the month it was received; the other months it covers are NPR. Dues for a closed year go to Other Collections → Outstanding Dues instead. NPR cells and paid cells (amount > 0) have an optional note (`maintenance.note`, 80 chars); paid cells also have a received date (`maintenance.paid_on`). Both show as a tooltip. Blank/0 cells keep neither, and the date is dropped when a cell becomes NPR. It is stored as its own flag (`maintenance.npr`), counts as 0 in totals, and exports as `NPR`. Blank or **0** means not paid. The treasurer types `NPR` or picks **NPR** in the mode dropdown (phone keypads cannot type letters). Migration `0010` turned every old 0 into NPR; JSON backups older than version 4 do the same on restore. Residents (and View as resident) do not see Bank/Cash **mode**, Total Bank, Total Cash, or a combined Total — month amounts only — so online payments are not socially visible. Treasurer still sees and edits mode, plus the three total columns.
- Handover is the original takeover record (FY 2024-26). The **Archive** tab (`/ledger/handover`) holds that takeover record plus closed years as frozen snapshots. Read-only for everyone except freeze-date changes by the treasurer.
- This year’s account (`/ledger/receipts`) is the live year receipts & payments statement in the same form as handover. The treasurer closes books on the annual meeting date (typically August–October, before Durga Puja) from **Years**. That year freezes as a read-only snapshot in **Archive**. The next year starts the following day with closing cash/bank carried forward. Changing a freeze date later re-splits dated income, expenses, and withdrawals, and maintenance months (by the 1st of the month), then recalculates the next year’s opening. Puja Contribution stays with the year it was recorded on. Withdrawals are not a This Year line. Closing cash in hand / bank are computed from that year’s opening plus Cash/Bank receipts minus Cash/Bank expenses, then withdrawals add to cash in hand and subtract from cash in bank (total unchanged). The treasurer can override a figure; the circular fetch icon clears that override and restores the amount from records.
- **Expense receipts**: the treasurer can attach one photo or PDF per expense (Attach / Replace / Remove, each confirmed). Every attached receipt is visible to residents via a **Receipt** link on the Expenses sheet. Files live in R2 bucket `debaloy-receipts` (binding `RECEIPTS`); metadata in D1 `receipts`. Photos are compressed in the browser to JPEG (max 2000 px edge, target ~800 KB, hard cap 1.5 MB); PDFs must be ≤ 4 MB. The server checks the real file type from its first bytes. Limits: 10 uploads/min and 120 views/min per session (Workers rate limiting), 50 uploads per day. Total storage is kept under **5 GB** by deleting the oldest receipts first (R2 free tier is 10 GB-month, account-wide). Deleting an expense deletes its receipt.
- **Bank Holidays** (`/ledger/bank-holidays`, everyone): the West Bengal (Kolkata) bank holiday list, read from the HDFC Bank holiday page (`hdfc.bank.in/bank-holiday-list`). The Worker first visits `https://www.hdfc.bank.in/` (cookies), then requests the list with that as referrer, and parses the **West Bengal** accordion table (not “the second table with Bengali”). Saved in D1 `bank_holidays` per year. Cron in `src/worker.ts` (custom `main`): **1 Jan 10:30 IST** (`0 5 1 1 *`), and **18:00 IST** (`30 12 1 1 *`) only if that year is still missing. A list is accepted only if it has ≥ 8 rows all in the current year (“not current year” fails). Every attempt is logged in D1 `job_runs` and shown under **Background jobs** on Activity. The treasurer can **Fetch now** (confirmed, max once a minute). Anyone can download a print-ready Excel (A4 portrait, fit to one page wide, header row repeats, page numbers). No source credit or “2nd and 4th Saturday” note on the page or in the Excel.
- **Festival landing page**: on chosen festivals the login page title becomes the greeting (e.g. “Happy Diwali.”, “Durga Pujo 2026.”, “Bhai Phota.”) with a centred photo above the password box. Date sources (merged in `buildFestivalCalendar`): **fixed** — New Year (1 Jan, shown 1–11 Jan), Republic Day (26 Jan), Independence Day (15 Aug), Gandhi Jayanti (2 Oct), Christmas (25 Dec); **bank list** — Good Friday; Bengali New Year (“Subho Noboborsho”) from the bank list, else Drik **Solar New Year + 1**; **Drik Panchang, Kolkata** (`hinducalendar.html?year=YYYY&geoname-id=1275004`, `.dpEventInfo` name + Gregorian date, only these names kept in D1 `drik_festivals`) — Maha Shivaratri, Holi, Raksha Bandhan/Rakhi, Krishna Janmashtami, Ganesh Chaturthi, Navratri Begins → “Subho Mahalaya” on the day before only, Durga Ashtami → “Durga Pujo YYYY” from Ashtami − 4 to Ashtami + 4, Diwali (n−1 and n; Drik catches weekend Diwali that the bank list skips), Bhaiya Dooj → “Bhai Phota”. Everything else shows on the festival day only. On **1 Jan 10:30 IST** the cron fetches the bank list and Drik together, then **consolidates** them (with the fixed dates) into D1 `festival_calendar` for the year; the landing page reads that table. At **18:00 IST** it refetches only what is still missing and consolidates again. Fetch now does the same as 10:30. If 1 Jan was missed, the landing page fetches the missing source(s) in the background once a day and consolidates, using fixed dates plus whatever is saved meanwhile. Logged as “Bank holidays”, “Festival dates”, and “Festival calendar”. **Activity → Background jobs** (treasurer) has force buttons: Fetch all + consolidate, Fetch bank holidays, Fetch festival dates (each fetch re-consolidates), and Consolidate calendar (no fetch). Each is confirmed, logged as “Manual (treasurer)”, and limited to once a minute per job (`/api/ledger/calendar-jobs`). Up to 7 photos per festival come from the **Pexels API** (`PEXELS_API_KEY` secret; pexels.com itself blocks servers). They are split evenly across 07:00–23:00 IST of all shown days (nights keep the last one). Each width in the srcset (150–1600) is downloaded from Pexels only when a browser first asks for it, then served from R2 (`festivals/{slug}/{year}/{idx}-{w}.jpg` in `debaloy-receipts`). Photos refresh once a year, the first time the festival window opens; if Pexels fails, last year's set stays. Attempts are logged as “Festival photos” in Activity → Background jobs. No photo credit line under the image. On festival days the hero gradient switches from the brand mesh to a festival palette (server, per festival), then eases to the photo’s own main hues (read client-side from a 48×32 sample; minor hues replaced by shades of the main one).
- **Association bank account** (`ASSOCIATION_BANK` in `constants.ts`): UCO Bank, Dakshinpara Salt Lake branch, A/c 17880110045862, IFSC UCBA0001788, MICR 700028116. Shown after login only: a **Pay the association** card on the ledger home (full details) and a compact card at the top of the resident Maintenance sheet, with Copy buttons for the account number (copied without spaces) and IFSC. Not on the public landing page.
- Withdrawals (`/ledger/withdrawals`) track bank-to-cash moves: date, amount (>0), optional note. Cash expenses already reduce cash in hand. Amount 0 is not saved.
- Other Collections and expense trackers start with the built-in types only. The treasurer can add named types from the category summary; those types then appear in the log dropdown and on This Year. Blank spare slots are not shown.
- **E-Receipts** and **Online payments** stay in the codebase for later (mobile numbers, pending bank transfers, last-3 accounts). They are not shown in either view until explicitly turned back on.
- Excel workbook always includes a frozen **Handover** sheet plus a receipts & payments sheet named for the selected year. Formatted Excel follows the Python builder’s palette (dark-blue headers, cream amount cells, section fills). Signature lines and carry-forward closing balances are in the Excel download only, not on the web This Year view.

## Tech stack

- **Astro** `output: 'server'` with **@astrojs/cloudflare** (`imageService: 'passthrough'` so Images bindings are not auto-provisioned).
- Access env via `import { env } from 'cloudflare:workers'` (Astro 6; no `Astro.locals.runtime`).
- **Tailwind CSS v4**, CSS-first via `@tailwindcss/vite`. Tokens in `src/styles/global.css` (`@theme`). No `tailwind.config.*`, no CDN.
- Design follows [`DESIGN.md`](../DESIGN.md): Vercel-inspired ink/canvas, hairline borders, stacked shadows, mesh gradient at hero/login only, Inter + JetBrains Mono.
- D1 `debaloy-ledger` stores ledger rows. KV `debaloy-session` stores sessions. JSON backup includes `withdrawals`; an older backup without that key restores as an empty list.
- Excel download is generated server-side with `exceljs` (excluded from Vite’s dep optimizer; bundled for the Worker). Formatted matches `temp/build_workbook.py`; raw is an unstyled values workbook.

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
