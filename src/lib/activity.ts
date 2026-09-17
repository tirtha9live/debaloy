import { env } from 'cloudflare:workers';
import { clientIp, type Session, type SessionRole } from './auth';
import { ENGAGEMENT_SESSION_KEEP, LEDGER_AUDIT_KEEP } from './constants';

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

async function trimEngagementSessions(keep = ENGAGEMENT_SESSION_KEEP) {
  const database = db();
  await database
    .prepare(
      `DELETE FROM page_views
       WHERE session_id NOT IN (
         SELECT session_id FROM (
           SELECT session_id FROM visitors ORDER BY last_seen DESC LIMIT ?
         )
       )`,
    )
    .bind(keep)
    .run();
  await database
    .prepare(
      `DELETE FROM visitors
       WHERE session_id NOT IN (
         SELECT session_id FROM (
           SELECT session_id FROM visitors ORDER BY last_seen DESC LIMIT ?
         )
       )`,
    )
    .bind(keep)
    .run();
}

async function trimLedgerAudit(keep = LEDGER_AUDIT_KEEP) {
  await db()
    .prepare(
      `DELETE FROM ledger_audit
       WHERE id NOT IN (
         SELECT id FROM (
           SELECT id FROM ledger_audit ORDER BY at DESC, id DESC LIMIT ?
         )
       )`,
    )
    .bind(keep)
    .run();
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
  await swallow(trimEngagementSessions());
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

export type PageViewRow = {
  id: number;
  sessionId: string;
  role: string;
  path: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
};

export type SessionEngagementRow = {
  sessionId: string;
  role: string;
  ip: string;
  device: string;
  firstSeen: string;
  lastSeen: string;
  pageViews: number;
  activeSec: number;
  downloads: number;
};

export type PopularPageRow = {
  path: string;
  visits: number;
  activeSec: number;
};

export type LedgerAuditRow = {
  id: number;
  at: string;
  sessionId: string;
  role: string;
  ip: string;
  device: string;
  sheet: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
};

function pagePath(request: Request) {
  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;
  return path.slice(0, 240);
}

async function closeOpenPageView(sessionId: string, endedAt: string) {
  const open = await db()
    .prepare(
      `SELECT id, started_at, duration_sec FROM page_views
       WHERE session_id = ? AND ended_at IS NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ id: number; started_at: string; duration_sec: number }>();
  if (!open) return;
  const extra = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(open.started_at)) / 1000));
  const duration = Math.max(Number(open.duration_sec) || 0, extra);
  await swallow(
    db()
      .prepare(`UPDATE page_views SET ended_at = ?, duration_sec = ? WHERE id = ?`)
      .bind(endedAt, duration, open.id)
      .run(),
  );
}

export async function recordPageView(session: Session, request: Request) {
  const path = pagePath(request);
  if (path.startsWith('/api/') || path.startsWith('/_astro/')) return;
  const at = nowIso();
  await closeOpenPageView(session.id, at);
  await swallow(
    db()
      .prepare(
        `INSERT INTO page_views (session_id, role, path, started_at, duration_sec)
         VALUES (?, ?, ?, ?, 0)`,
      )
      .bind(session.id, session.role, path, at)
      .run(),
  );
}

export async function addPageDwell(sessionId: string, path: string, seconds: number) {
  const safePath = path.slice(0, 240);
  const add = Math.min(Math.max(0, Math.round(seconds)), 60 * 60 * 4);
  if (add <= 0) return;
  await swallow(
    db()
      .prepare(
        `UPDATE page_views
         SET duration_sec = duration_sec + ?
         WHERE id = (
           SELECT id FROM page_views
           WHERE session_id = ? AND path = ? AND ended_at IS NULL
           ORDER BY id DESC LIMIT 1
         )`,
      )
      .bind(add, sessionId, safePath)
      .run(),
  );
}

export async function recordLedgerAudit(
  session: Session,
  request: Request,
  sheet: string,
  changes: Array<{ label: string; from: string; to: string }>,
) {
  const { ip, device } = requestMeta(request);
  const at = nowIso();
  const safeSheet = sheet.slice(0, 32);
  for (const change of changes.slice(0, 120)) {
    await swallow(
      db()
        .prepare(
          `INSERT INTO ledger_audit (
             at, session_id, role, ip, device, sheet, field_label, old_value, new_value
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          at,
          session.id,
          session.role,
          ip,
          device,
          safeSheet,
          change.label,
          change.from,
          change.to,
        )
        .run(),
    );
  }
  await swallow(trimLedgerAudit());
}

export function formatActiveDuration(totalSec: number) {
  const sec = Math.max(0, Math.round(totalSec));
  if (sec < 60) return `${sec}s`;
  const minutes = Math.floor(sec / 60);
  const rest = sec % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minRest = minutes % 60;
  return minRest ? `${hours}h ${minRest}m` : `${hours}h`;
}

export function displaySheet(sheet: string) {
  const map: Record<string, string> = {
    maintenance: 'Maintenance',
    puja: 'Puja',
    entries: 'Collections / expenses',
    categories: 'Categories',
    settings: 'This year’s account',
    withdrawals: 'Withdrawals',
    years: 'Years',
  };
  return map[sheet] ?? sheet;
}

export async function listPopularPages(limit = 15): Promise<PopularPageRow[]> {
  try {
    const result = await db()
      .prepare(
        `SELECT path, COUNT(*) AS visits, COALESCE(SUM(duration_sec), 0) AS active_sec
         FROM page_views
         GROUP BY path
         ORDER BY active_sec DESC, visits DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{ path: string; visits: number; active_sec: number }>();
    return (result.results ?? []).map((row) => ({
      path: row.path,
      visits: Number(row.visits) || 0,
      activeSec: Number(row.active_sec) || 0,
    }));
  } catch {
    return [];
  }
}

export async function listSessionEngagement(limit = 100): Promise<SessionEngagementRow[]> {
  try {
    const result = await db()
      .prepare(
        `SELECT
           v.session_id,
           v.role,
           v.ip,
           v.device,
           v.first_seen,
           v.last_seen,
           COUNT(pv.id) AS page_views,
           COALESCE(SUM(pv.duration_sec), 0) AS active_sec,
           v.downloads AS downloads
         FROM visitors v
         LEFT JOIN page_views pv ON pv.session_id = v.session_id
         GROUP BY v.session_id
         ORDER BY v.last_seen DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{
        session_id: string;
        role: string;
        ip: string;
        device: string;
        first_seen: string;
        last_seen: string;
        page_views: number;
        active_sec: number;
        downloads: number;
      }>();
    return (result.results ?? []).map((row) => ({
      sessionId: row.session_id,
      role: row.role,
      ip: row.ip,
      device: row.device,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      pageViews: Number(row.page_views) || 0,
      activeSec: Number(row.active_sec) || 0,
      downloads: Number(row.downloads) || 0,
    }));
  } catch {
    return [];
  }
}

export async function listPageViewsForSession(sessionId: string, limit = 40): Promise<PageViewRow[]> {
  try {
    const result = await db()
      .prepare(
        `SELECT id, session_id, role, path, started_at, ended_at, duration_sec
         FROM page_views
         WHERE session_id = ?
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .bind(sessionId, limit)
      .all<{
        id: number;
        session_id: string;
        role: string;
        path: string;
        started_at: string;
        ended_at: string | null;
        duration_sec: number;
      }>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      path: row.path,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSec: Number(row.duration_sec) || 0,
    }));
  } catch {
    return [];
  }
}

export async function listRecentPageViews(limit = 60): Promise<PageViewRow[]> {
  try {
    const result = await db()
      .prepare(
        `SELECT id, session_id, role, path, started_at, ended_at, duration_sec
         FROM page_views
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{
        id: number;
        session_id: string;
        role: string;
        path: string;
        started_at: string;
        ended_at: string | null;
        duration_sec: number;
      }>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      path: row.path,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSec: Number(row.duration_sec) || 0,
    }));
  } catch {
    return [];
  }
}

export async function listLedgerAudit(limit = LEDGER_AUDIT_KEEP): Promise<LedgerAuditRow[]> {
  try {
    const result = await db()
      .prepare(
        `SELECT id, at, session_id, role, ip, device, sheet, field_label, old_value, new_value
         FROM ledger_audit
         ORDER BY at DESC, id DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{
        id: number;
        at: string;
        session_id: string;
        role: string;
        ip: string;
        device: string;
        sheet: string;
        field_label: string;
        old_value: string;
        new_value: string;
      }>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      at: row.at,
      sessionId: row.session_id,
      role: row.role,
      ip: row.ip,
      device: row.device,
      sheet: row.sheet,
      fieldLabel: row.field_label,
      oldValue: row.old_value,
      newValue: row.new_value,
    }));
  } catch {
    return [];
  }
}
