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

- Spreadsheet chrome: sticky Flat/Resident columns, cream/blue editable cells in light mode, slate/cyan in dark mode. On Maintenance, **NPR** means no payment required — paid in advance, or paid as dues at a later date (the amount sits in the month it was received). A subtle red inset outline means **Pending Payment / Record Updation** (not “Payment pending”, so someone who paid yesterday isn't told they haven't paid): on Maintenance, any blank or 0 cell in the current month **or any earlier month** (NPR and future months are never red); on Puja Contribution, blank/zero. On the web, a Maintenance 0 shows as blank, same as not paid. Cells can carry details the treasurer types under the amount: NPR cells get a short note (why NPR); paid cells (amount > 0) get a received date (pre-filled with today) and an optional note (e.g. why more or less than expected). Notes are up to 80 characters. Everyone else sees them as a tooltip on hover or tap, e.g. “Received 12 Nov 2026 · Short by 200”; a dotted underline marks cells that have one. Excel formatted adds the same text as a cell comment. Excel downloads blank as empty, 0 as 0, and NPR as `NPR`.
- Treasurer edits amount and Bank/Cash mode in place, and sees Total Bank, Total Cash, and Total. Residents (and View as resident) see month amounts only — no mode column, no bank/cash split, no trailing Total — so others paying online is not visible. The home Maintenance card hides the Bank · Cash split from residents too.
- A single **Download** control opens Excel formatted and Excel raw. Treasurer also sees **JSON export** and **JSON import**. Import asks Merge (keep extra rows) or Overwrite (clear, then restore). Residents never see those options.
- The Download control shows a spinner and “Downloading…” while a file is being prepared; `aria-live` reports progress. Excel formatted, Excel raw, and treasurer JSON backup still work as `/api/export?kind=` links if JS is off.
- Handover (the original takeover record) lives on **Archive**, together with closed years as frozen snapshots. This year’s account is the live statement that updates with new data and downloads in the same form.
- President / Secretary & Treasurer signature lines are **not** shown on the web This Year view. They are included in Excel download, along with closing balances carried to the next FY.
- Closing **Cash in Hand** / **Cash in Bank** follow records (opening + receipts − expenses, split by Cash/Bank, then bank-to-cash withdrawals). A circular fetch icon marks that. The treasurer can edit to override; fetch again clears the override and restores the calculated amount. Residents see the effective figure only.
- After the treasurer saves, show **Last updated on {date}** (date only, Asia/Kolkata) under the Debaloy mark on phones, and under the welcome line on desktop. Do not show a time. Omit the line until the first save.
- Empty logs show “No rows yet.” rather than a broken table.
- Other Collections and expense summaries list only named types. Spare blank slots are not shown. The treasurer adds a type from the category summary; it then appears there, in the row dropdown, and on This Year.
- Destructive row delete asks for confirmation.
- Expense receipts: treasurer rows show “View receipt (size) · Replace · Remove” or “No receipt · Attach receipt”. Picking a file compresses photos, then a confirm dialog shows the file name and size (and “compressed from …”). Residents see a **Receipt** link next to the description. Clicking a receipt link (resident or treasurer) opens an overlay that zooms out from the link: image fit to screen, or the PDF in a frame, with the expense as the title, “Open in new tab”, and an X. Esc, X, or a click outside shrinks it back to the link and returns focus. The bar also has Rotate left / Rotate right (photos only; view-only, the sideways photo is refitted) and Download (original file via `?download=1`, or a rotated JPEG when the photo has been turned). “Open in new tab” is hidden on phones. Ctrl/Cmd-click still opens a new tab; reduced-motion users get no animation.
- Treasurer save is deliberate: Save sheet / Save / Add row opens a checklist of every changed value (for example `0.00 → 5,000.00`) and writes nothing until Confirm save.
- Treasurer **Admin** (one nav pill + home card) has sub-tabs **Activity** and **Festival photos**. Activity shows engagement (pages visited, time on page, popular sheets), sessions, a page trail, **ledger changes** (confirmed saves from the treasurer checklist), and login audit. Residents never see it. Residents share one password, but each browser login gets its own session id; Activity also records IP, device, and a short fingerprint (hash of IP + user agent). Sessions expire after **24 hours** (cookie + server record); then the user must log in again.
- **Years** is where the treasurer closes books on the meeting date. Closed years then appear on **Archive**. Freeze dates can be changed from Archive. Frozen years are read-only snapshots.
- The Puja sheet is labeled **Puja Contribution**.
- The income sheet is labeled **Other Collections**.
- **E-Receipts** and **Online payments** are parked. Do not show them in nav, home, or archive until asked to turn them back on.

## Responsive

- Phone-first: most residents and the treasurer will view and update on mobile.
- Sheet nav is a stacked list behind the hamburger on small screens; row of pills from `lg`.
- Last updated sits under the Debaloy mark on phones (always visible in the sticky header). The duplicate line under the page title is desktop-only.
- Header actions are a 2-column grid on phones, with Download full-width. Treasurer **Save sheet** is a full-width bar pinned to the bottom, above the iPhone home indicator.
- Inputs and selects are at least 44px tall and 16px type on phones so iOS does not zoom and thumbs can tap cells.
- Horizontal scroll for wide grids (maintenance), with a swipe hint. The grid is a freeze pane: Flat, Resident, and month headers stay on screen while you scroll every flat and month. The pane uses a bounded max height (stable `svh`, not jumping `dvh`). When vertical scroll hits the top or bottom of the flat list, page scroll takes over. Do not use an unbounded full-page horizontal scroller on Android — it swallows vertical page scroll.
- Resident copy never tells people to edit. On Maintenance they see that **NPR** means no payment required, not “leave a cell blank”.
- This Year and Handover stack **Receipts**, then **Payments**, on phones so labels wrap. The side-by-side spreadsheet returns from `lg`. Do not rely on a four-column nowrap table on Android.
- Other Collections and expense rows stack as labeled cards on phones; the spreadsheet row layout returns from `xl`. Withdrawals use the same pattern with date, amount, and note.
- Withdrawals sit after Expenses in the sheet nav. They are a tracker only: not shown on This Year. Combined closing cash is unchanged.
- No horizontal overflow on the login card. Safe-area insets for notched phones.

## Analytics / ads

No third-party analytics, ad networks, or measurement IDs. Treasurer Activity is first-party session and login audit only.

## Instruction for future edits

Do not switch the default theme to dark, invert the toggle icons, store theme on the shared login, turn the ledger into an SPA, or add third-party tracking unless explicitly requested.
