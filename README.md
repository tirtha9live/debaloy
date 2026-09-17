# Debaloy

Private building ledger for the **Debaloy Flat Owners Welfare Association** — the web equivalent of the FY 2026-27 Excel workbook.

Built with **Astro** (MPA, SSR) and deployed to a dedicated **Cloudflare Worker**.

## Access

The homepage asks for a password (Worker secrets, rotatable later):

- Resident password → read-only ledger, Excel download
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
| `npm test` | Milestone regression tests (also run before deploy) |
| `npm run cf:deploy` | Test, build, and deploy the **debaloy** Worker |

This Worker is separate from the live `bytebox` project. Do not reuse or modify bytebox KV/D1/secrets.

## Production secrets and config

Only values on **your Cloudflare account** (and your machine for local dev) matter for live access. Nothing below stores real passwords in git.

### What lives where

| Name | Type | Purpose |
| :--- | :--- | :------ |
| `RESIDENT_PASSWORD` | **Secret** | Read-only ledger login |
| `ADMIN_PASSWORD` | **Secret** | Treasurer login (edit sheets) |
| `DEBUG` | **Var** (`wrangler.toml`, default `"false"`) | When `"true"`, shows maintenance messaging on the site |
| D1 `debaloy-ledger` | Binding | Ledger data |
| KV `debaloy-session` | Binding | Login sessions (24h TTL) |

Local development: copy `.env.example` to **`.dev.vars`** (gitignored) and set the two passwords there. Optional: `DEBUG=true` for maintenance UI locally.

### Who can change production values

Anyone with **Cloudflare dashboard** access to this account (Members & Roles), or anyone who can run **`wrangler`** with your login or API token, can read or rotate secrets and deploy new vars. If you are the only member and you keep API tokens private, that is effectively only you.

### Checklist: rotate after a leak or handover

1. Cloudflare dashboard → **Workers & Pages** → **debaloy** → **Settings** → **Variables and Secrets**, or locally:
   - `npx wrangler secret put RESIDENT_PASSWORD`
   - `npx wrangler secret put ADMIN_PASSWORD`
2. **Account** → **Members** — remove anyone who should no longer have access.
3. **My Profile** → **API Tokens** — revoke old tokens; create a new one if you use CI or Wrangler with a token.
4. Enable or confirm **2FA** on the Cloudflare account.
5. Redeploy only if you changed **vars** in `wrangler.toml` (e.g. `DEBUG`); secret updates apply without redeploy.

### Maintenance mode (`DEBUG`)

- Production toggle without editing code: `npx wrangler vars set DEBUG true` (and `false` when done), or set `DEBUG = "true"` in `wrangler.toml` and `npm run cf:deploy`.
- Shows a clear message on the landing page and a small banner elsewhere; login still works.

## Theme

Light mode is the default. Dark mode is optional. The toggle shows a moon in light mode and a sun in dark mode. The choice is stored on this device/browser (cookie + local storage), not on the shared resident password. It lasts until cookies are deleted.
