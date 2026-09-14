# Debaloy

Private building ledger for the **Debaloy Flat Owners Welfare Association** — the web equivalent of the FY 2026-27 Excel workbook.

Built with **Astro** (MPA, SSR) and deployed to a dedicated **Cloudflare Worker**.

## Access

The homepage asks for a password (Worker secrets, rotatable later):

- Resident password → read-only ledger, Excel + image download
- Admin password → edit sheets like the workbook, plus “View as resident”

## Stack

- Astro (`output: 'server'`) + `@astrojs/cloudflare`
- Tailwind CSS v4 (tokens in `src/styles/global.css`)
- Cloudflare D1 `debaloy-ledger` (`0506c321-9cac-4f3b-90a9-63e1ee490ec4`) for sheet data
- Cloudflare KV `debaloy-session` (`3abc22bcdabf4082b70d15ab77fe477f`) for sessions

## Commands

| Command | Action |
| :------ | :----- |
| `npm run dev` | Local Astro/Wrangler dev server |
| `npm run build` | Production build |
| `npm run cf:deploy` | Build and deploy the **debaloy** Worker |

This Worker is separate from the live `bytebox` project. Do not reuse or modify bytebox KV/D1/secrets.

## Theme

Light mode is the default. Dark mode is optional. The toggle shows a moon in light mode and a sun in dark mode. The choice is stored on this device/browser (cookie + local storage), not on the shared resident password. It lasts until cookies are deleted.
