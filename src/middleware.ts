import { defineMiddleware } from 'astro:middleware';
import { readSession } from './lib/auth';
import { recordPageView, touchVisitor } from './lib/activity';
import { isMaintenanceMode } from './lib/debug';
import { listYears, resolveYear } from './lib/years';

const PUBLIC_PREFIXES = [
  '/api/login',
  '/api/logout',
  '/favicon',
  '/robots.txt',
  '/sitemap.xml',
  '/apple-touch-icon',
];

function isPublicPath(pathname: string) {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}.`));
}

function shouldCountView(method: string, pathname: string) {
  if (method !== 'GET') return false;
  if (pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/_astro/') || pathname.startsWith('/_image')) return false;
  return true;
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.maintenanceMode = isMaintenanceMode();
  const session = await readSession(context.cookies);
  const viewAsResident =
    session?.role === 'admin' && context.url.searchParams.get('view') === 'resident';

  context.locals.session = session;
  context.locals.viewAsResident = Boolean(viewAsResident);

  if (isPublicPath(context.url.pathname)) {
    context.locals.canEdit = false;
    return next();
  }

  if (context.url.pathname === '/404' || context.url.pathname === '/500') {
    context.locals.canEdit = false;
    return next();
  }

  if (!session) {
    if (context.url.pathname.startsWith('/api/')) {
      return new Response('Unauthorised', { status: 401 });
    }
    return context.redirect('/');
  }

  const years = await listYears();
  const requested = Number(context.url.searchParams.get('year'));
  const selected = resolveYear(years, Number.isInteger(requested) && requested > 0 ? requested : null);
  context.locals.ledgerYears = years;
  context.locals.ledgerYear = selected;
  context.locals.canEdit = session.role === 'admin' && !viewAsResident && selected.endDate == null;

  if (context.url.pathname === '/ledger/activity' && !(session.role === 'admin' && !viewAsResident)) {
    return context.redirect(viewAsResident ? '/ledger?view=resident' : '/ledger');
  }

  if (session && shouldCountView(context.request.method, context.url.pathname)) {
    await touchVisitor(session, context.request, 'view');
    await recordPageView(session, context.request);
  }

  return next();
});
