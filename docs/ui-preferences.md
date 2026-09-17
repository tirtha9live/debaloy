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

- Spreadsheet chrome: sticky Flat/Resident columns, cream/blue editable cells in light mode, slate/cyan in dark mode. Maintenance blank cells are not recorded. **0** means payment not required (paid in advance, or some operating expenses were paid directly for the society, etc.). A subtle red inset outline on the **current** maintenance month (blank only) or on Puja Contribution (blank/zero) means **Payment pending**. Excel downloads blank as empty and 0 as 0.
- Admin edits in place (amount + Bank/Cash). Residents see computed values only.
- A single **Download** control opens Excel formatted and Excel raw. Treasurer also sees **JSON export** and **JSON import**. Import asks Merge (keep extra rows) or Overwrite (clear, then restore). Residents never see those options.
- The Download control shows a spinner and “Downloading…” while a file is being prepared; `aria-live` reports progress. Excel formatted, Excel raw, and treasurer JSON backup still work as `/api/export?kind=` links if JS is off.
- Handover (the original takeover record) lives on **Archive**, together with closed years as frozen snapshots. This year’s account is the live statement that updates with new data and downloads in the same form.
- President / Secretary & Treasurer signature lines are **not** shown on the web This Year view. They are included in Excel download, along with closing balances carried to the next FY.
- Closing **Cash in Hand** / **Cash in Bank** follow records (opening + receipts − expenses, split by Cash/Bank, then bank-to-cash withdrawals). A circular fetch icon marks that. The treasurer can edit to override; fetch again clears the override and restores the calculated amount. Residents see the effective figure only.
- After the treasurer saves, show **Last updated on {date}** (date only, Asia/Kolkata) under the Debaloy mark on phones, and under the welcome line on desktop. Do not show a time. Omit the line until the first save.
- Empty logs show “No rows yet.” rather than a broken table.
- Other Collections and expense summaries list only named types. Spare blank slots are not shown. The treasurer adds a type from the category summary; it then appears there, in the row dropdown, and on This Year.
- Destructive row delete asks for confirmation.
- Treasurer save is deliberate: Save sheet / Save / Add row opens a checklist of every changed value (for example `0.00 → 5,000.00`) and writes nothing until Confirm save.
- Treasurer **Activity** (nav + home card) shows engagement (pages visited, time on page, popular sheets), sessions, a page trail, **ledger changes** (confirmed saves from the treasurer checklist), and login audit. Residents never see it. Residents share one password, but each browser login gets its own session id; Activity also records IP, device, and a short fingerprint (hash of IP + user agent). Sessions expire after **24 hours** (cookie + server record); then the user must log in again.
- **Years** is where the treasurer closes books on the meeting date. Closed years then appear on **Archive**. Freeze dates can be changed from Archive. Frozen years are read-only snapshots.
- The Puja sheet is labeled **Puja Contribution**.
- The income sheet is labeled **Other Collections**.

## Responsive

- Phone-first: most residents and the treasurer will view and update on mobile.
- Sheet nav is a stacked list behind the hamburger on small screens; row of pills from `lg`.
- Last updated sits under the Debaloy mark on phones (always visible in the sticky header). The duplicate line under the page title is desktop-only.
- Header actions are a 2-column grid on phones, with Download full-width. Treasurer **Save sheet** is a full-width bar pinned to the bottom, above the iPhone home indicator.
- Inputs and selects are at least 44px tall and 16px type on phones so iOS does not zoom and thumbs can tap cells.
- Horizontal scroll for wide grids (maintenance), with a swipe hint. The grid is a freeze pane: Flat, Resident, and month headers stay on screen while you scroll every flat and month. The pane uses a bounded max height (stable `svh`, not jumping `dvh`). When vertical scroll hits the top or bottom of the flat list, page scroll takes over. Do not use an unbounded full-page horizontal scroller on Android — it swallows vertical page scroll.
- Resident copy never tells people to edit. On Maintenance they see that **0** means payment not required, not “leave a cell blank”.
- This Year and Handover stack **Receipts**, then **Payments**, on phones so labels wrap. The side-by-side spreadsheet returns from `lg`. Do not rely on a four-column nowrap table on Android.
- Other Collections and expense rows stack as labeled cards on phones; the spreadsheet row layout returns from `xl`. Withdrawals use the same pattern with date, amount, and note.
- Withdrawals sit after Expenses in the sheet nav. They are a tracker only: not shown on This Year. Combined closing cash is unchanged.
- No horizontal overflow on the login card. Safe-area insets for notched phones.

## Analytics / ads

No third-party analytics, ad networks, or measurement IDs. Treasurer Activity is first-party session and login audit only.

## Instruction for future edits

Do not switch the default theme to dark, invert the toggle icons, store theme on the shared login, turn the ledger into an SPA, or add third-party tracking unless explicitly requested.
