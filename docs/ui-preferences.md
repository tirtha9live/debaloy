# UI Preferences

UI decisions for **Debaloy** that future changes should preserve unless explicitly requested otherwise.

## Theme defaults

- Default theme is **light mode**. Dark mode is optional.
- Remember the last choice on this device/browser until cookies are cleared (`debaloy_theme` cookie + `theme-preference` in `localStorage`). Do not store it on the shared login session.
- Dark mode: **sun** icon (switch to light). Light mode: **moon** icon.
- Theme init lives in `src/layouts/Layout.astro` (`.dark` + `[data-theme]` before paint).

## Design language

- Follow [`DESIGN.md`](../DESIGN.md): Vercel-inspired ink on canvas, hairline borders, stacked shadows, sentence-case display headings with negative tracking, Inter for UI, mono for eyebrows and table headers.
- Mesh gradient only at login/hero scale.
- Login submit (click or Enter) disables the button and shows “Logging in…” with a moving ellipsis until the page navigates.
- Three wrong passwords lock login for 3 minutes (`Try again in m:ss`). After two failures, the alert is **You have 1 attempt left.** The Worker enforces the same lock.
- Marketing CTAs use pill radius; in-app controls use 6–8px radius.
- Money columns use `tabular-nums` and `Intl.NumberFormat('en-IN')`.

## Ledger UI

- Spreadsheet chrome: sticky Flat/Owner columns, cream/blue editable cells in light mode, slate/cyan in dark mode.
- Admin edits in place (amount + Bank/Cash). Residents see computed values only.
- A single **Download** control opens Excel formatted, Excel raw, and Image. Image captures `#sheet-capture`. Treasurer also sees **JSON export** and **JSON import**. Import asks Merge (keep extra rows) or Overwrite (clear, then restore). Residents never see those options.
- The Download control shows a spinner and “Downloading…” while a file is being prepared; `aria-live` reports progress. Excel formatted, Excel raw, and treasurer JSON backup still work as `/api/export?kind=` links if JS is off.
- Handover is labeled as the original takeover record (reference only). This year’s account is the live statement that updates with new data and downloads in the same form.
- President / Secretary & Treasurer signature lines are **not** shown on the web This Year view. They are included in Excel download and briefly revealed during PNG capture (`[data-export-only]`), along with closing balances carried to the next FY.
- After the treasurer saves, show **Last updated on {date}** (date only, Asia/Kolkata) under the Debaloy mark on phones, and under the welcome line on desktop. Do not show a time. Omit the line until the first save.
- Empty logs show “No rows yet.” rather than a broken table.
- Income and expense summaries list only named types. Spare blank slots are not shown. The treasurer adds a type from the category summary; it then appears there, in the row dropdown, and on This Year.
- Destructive row delete asks for confirmation.
- Treasurer save is deliberate: Save sheet / Save / Add row opens a checklist of every changed value (for example `0.00 → 5,000.00`) and writes nothing until Confirm save.
- Treasurer **Activity** (nav + home card) shows sessions and a login audit. Residents never see it.

## Responsive

- Phone-first: most residents and the treasurer will view and update on mobile.
- Sheet nav is a stacked list behind the hamburger on small screens; row of pills from `lg`.
- Last updated sits under the Debaloy mark on phones (always visible in the sticky header). The duplicate line under the page title is desktop-only.
- Header actions are a 2-column grid on phones, with Download full-width. Treasurer **Save sheet** is a full-width bar pinned to the bottom, above the iPhone home indicator.
- Inputs and selects are at least 44px tall and 16px type on phones so iOS does not zoom and thumbs can tap cells.
- Horizontal scroll for wide grids (maintenance, R&P), with a swipe hint. Sticky Flat/Owner columns stay on screen.
- Income and expense rows stack as labeled cards on phones; the spreadsheet row layout returns from `xl`.
- No horizontal overflow on the login card. Safe-area insets for notched phones.

## Analytics / ads

No third-party analytics, ad networks, or measurement IDs. Treasurer Activity is first-party session and login audit only.

## Instruction for future edits

Do not switch the default theme to dark, invert the toggle icons, store theme on the shared login, turn the ledger into an SPA, or add third-party tracking unless explicitly requested.
