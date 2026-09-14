import { env } from 'cloudflare:workers';
import type { APIContext, AstroCookies } from 'astro';
import { LOGIN_LOCK_SECONDS, SESSION_COOKIE, SESSION_TTL_SECONDS } from './constants';

export type SessionRole = 'resident' | 'admin';

export type Session = {
  id: string;
  role: SessionRole;
  createdAt: number;
};

function getBindings() {
  return env as Cloudflare.Env;
}

async function digestEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

export async function resolveRole(password: string): Promise<SessionRole | null> {
  const { RESIDENT_PASSWORD, ADMIN_PASSWORD } = getBindings();
  if (!RESIDENT_PASSWORD || !ADMIN_PASSWORD) return null;
  if (await digestEqual(password, ADMIN_PASSWORD)) return 'admin';
  if (await digestEqual(password, RESIDENT_PASSWORD)) return 'resident';
  return null;
}

export async function createSession(role: SessionRole, cookies: AstroCookies, secure: boolean) {
  const id = crypto.randomUUID();
  const session: Session = { id, role, createdAt: Date.now() };
  await getBindings().SESSION.put(`session:${id}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: SESSION_TTL_SECONDS,
  });
  return session;
}

export async function readSession(cookies: AstroCookies): Promise<Session | null> {
  const id = cookies.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const raw = await getBindings().SESSION.get(`session:${id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    if (parsed.id !== id) return null;
    if (parsed.role !== 'admin' && parsed.role !== 'resident') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function destroySession(cookies: AstroCookies) {
  const id = cookies.get(SESSION_COOKIE)?.value;
  if (id) {
    await getBindings().SESSION.delete(`session:${id}`);
  }
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function isSecureRequest(url: URL) {
  return url.protocol === 'https:';
}

export function viewQuery(viewAsResident: boolean): string {
  return viewAsResident ? '?view=resident' : '';
}

export function withView(href: string, viewAsResident: boolean): string {
  if (!viewAsResident) return href;
  return href.includes('?') ? `${href}&view=resident` : `${href}?view=resident`;
}

export function sameOriginPath(request: Request, fallback: string): string {
  const referer = request.headers.get('referer');
  if (!referer) return fallback;
  try {
    const next = new URL(referer);
    const current = new URL(request.url);
    if (next.origin !== current.origin) return fallback;
    return `${next.pathname}${next.search}`;
  } catch {
    return fallback;
  }
}

export function requireRole(context: APIContext, role?: SessionRole) {
  const session = context.locals.session;
  if (!session) {
    return new Response('Unauthorised', { status: 401 });
  }
  if (role && session.role !== role) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}

function clientIp(request: Request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('True-Client-IP') ||
    request.headers.get('X-Real-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

async function loginLockKey(request: Request) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientIp(request)));
  const hex = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `loginlock:${hex}`;
}

export async function getLoginLockRemaining(request: Request): Promise<number> {
  const raw = await getBindings().SESSION.get(await loginLockKey(request));
  if (!raw) return 0;
  try {
    const until = Number((JSON.parse(raw) as { until?: number }).until);
    if (!Number.isFinite(until)) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

export async function lockLogin(request: Request) {
  const until = Date.now() + LOGIN_LOCK_SECONDS * 1000;
  await getBindings().SESSION.put(await loginLockKey(request), JSON.stringify({ until }), {
    expirationTtl: LOGIN_LOCK_SECONDS,
  });
}
