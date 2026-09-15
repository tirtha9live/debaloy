import { env } from 'cloudflare:workers';
import { clientIp, type Session, type SessionRole } from './auth';

export type LoginOutcome = 'success' | 'failed' | 'locked' | 'signout';

export type VisitorRow = {
  sessionId: string;
  role: string;
  ip: string;
  device: string;
  userAgent: string;
  fingerprint: string;
  firstSeen: string;
  lastSeen: string;
  views: number;
  downloads: number;
};

export type LoginEventRow = {
  id: number;
  at: string;
  outcome: LoginOutcome;
  role: string | null;
  ip: string;
  device: string;
  userAgent: string;
  fingerprint: string;
  sessionId: string | null;
};

function db() {
  return (env as Cloudflare.Env).DB;
}

function nowIso() {
  return new Date().toISOString();
}

function userAgent(request: Request) {
  return (request.headers.get('User-Agent') ?? '').slice(0, 240);
}

export function deviceFromUa(ua: string) {
  const text = ua.toLowerCase();
  if (/ipad|tablet/.test(text)) return 'Tablet';
  if (/mobi|iphone|android/.test(text)) return 'Mobile';
  if (!text) return 'Unknown';
  return 'Desktop';
}

export function displayRole(role: string | null | undefined) {
  if (!role) return '—';
  if (role === 'admin') return 'Treasurer';
  if (role === 'resident') return 'Resident';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function shortId(value: string | null | undefined) {
  if (!value) return '—';
  return value.slice(0, 8);
}

async function fingerprintOf(ip: string, ua: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${ua}`));
  return [...new Uint8Array(bytes)]
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function requestMeta(request: Request) {
  const ip = clientIp(request);
  const ua = userAgent(request);
  return { ip, ua, device: deviceFromUa(ua) };
}

async function swallow(task: Promise<unknown>) {
  try {
    await task;
  } catch {
    /* Tracking must not break login or ledger pages. */
  }
}

export async function recordLoginEvent(
  request: Request,
  outcome: LoginOutcome,
  role?: SessionRole | null,
  sessionId?: string | null,
) {
  const { ip, ua, device } = requestMeta(request);
  const fingerprint = await fingerprintOf(ip, ua);
  await swallow(
    db()
      .prepare(
        `INSERT INTO login_events (at, outcome, role, ip, device, user_agent, fingerprint, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(nowIso(), outcome, role ?? null, ip, device, ua, fingerprint, sessionId ?? null)
      .run(),
  );
}

export async function touchVisitor(session: Session, request: Request, kind: 'view' | 'download' = 'view') {
  const { ip, ua, device } = requestMeta(request);
  const fingerprint = await fingerprintOf(ip, ua);
  const at = nowIso();
  const viewInc = kind === 'view' ? 1 : 0;
  const downloadInc = kind === 'download' ? 1 : 0;
  await swallow(
    db()
      .prepare(
        `INSERT INTO visitors (session_id, role, ip, device, user_agent, fingerprint, first_seen, last_seen, views, downloads)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           last_seen = excluded.last_seen,
           ip = excluded.ip,
           device = excluded.device,
           user_agent = excluded.user_agent,
           fingerprint = excluded.fingerprint,
           views = visitors.views + excluded.views,
           downloads = visitors.downloads + excluded.downloads`,
      )
      .bind(session.id, session.role, ip, device, ua, fingerprint, at, at, viewInc, downloadInc)
      .run(),
  );
}

export async function listVisitors(limit = 200): Promise<VisitorRow[]> {
  try {
    const result = await db()
      .prepare(
        `SELECT session_id, role, ip, device, user_agent, fingerprint, first_seen, last_seen, views, downloads
         FROM visitors
         ORDER BY last_seen DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{
        session_id: string;
        role: string;
        ip: string;
        device: string;
        user_agent: string;
        fingerprint: string;
        first_seen: string;
        last_seen: string;
        views: number;
        downloads: number;
      }>();
    return (result.results ?? []).map((row) => ({
      sessionId: row.session_id,
      role: row.role,
      ip: row.ip,
      device: row.device,
      userAgent: row.user_agent,
      fingerprint: row.fingerprint,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      views: Number(row.views) || 0,
      downloads: Number(row.downloads) || 0,
    }));
  } catch {
    return [];
  }
}

export async function listLoginEvents(limit = 200): Promise<LoginEventRow[]> {
  try {
    const result = await db()
      .prepare(
        `SELECT id, at, outcome, role, ip, device, user_agent, fingerprint, session_id
         FROM login_events
         ORDER BY at DESC, id DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{
        id: number;
        at: string;
        outcome: LoginOutcome;
        role: string | null;
        ip: string;
        device: string;
        user_agent: string;
        fingerprint: string;
        session_id: string | null;
      }>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      at: row.at,
      outcome: row.outcome,
      role: row.role,
      ip: row.ip,
      device: row.device,
      userAgent: row.user_agent,
      fingerprint: row.fingerprint,
      sessionId: row.session_id,
    }));
  } catch {
    return [];
  }
}

export function loginOutcomeLabel(outcome: string) {
  if (outcome === 'success') return 'Signed in';
  if (outcome === 'failed') return 'Wrong password';
  if (outcome === 'locked') return 'Locked out';
  if (outcome === 'signout') return 'Signed out';
  return outcome;
}
