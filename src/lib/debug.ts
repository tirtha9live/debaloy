import { env } from 'cloudflare:workers';

/** Wrangler `[vars] DEBUG` — when true, show maintenance messaging and a site-wide notice. */
export function parseDebugFlag(raw: string | undefined | null) {
  if (raw == null) return false;
  const text = String(raw).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export function isMaintenanceMode() {
  return parseDebugFlag((env as Cloudflare.Env).DEBUG);
}
