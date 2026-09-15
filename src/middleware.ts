import { defineMiddleware } from 'astro:middleware';
import { readSession } from './lib/auth';
import { touchVisitor } from './lib/activity';

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
  const session = await readSession(context.cookies);
  const viewAsResident =
    session?.role === 'admin' && context.url.searchParams.get('view') === 'resident';

  context.locals.session = session;
  context.locals.viewAsResident = Boolean(viewAsResident);
  context.locals.canEdit = session?.role === 'admin' && !viewAsResident;

  if (isPublicPath(context.url.pathname)) {
    return next();
  }

  if (context.url.pathname === '/404' || context.url.pathname === '/500') {
    return next();
  }

  if (!session) {
    if (context.url.pathname.startsWith('/api/')) {
      return new Response('Unauthorised', { status: 401 });
    }
    return context.redirect('/');
  }

  if (context.url.pathname === '/ledger/activity' && !context.locals.canEdit) {
    return context.redirect(viewAsResident ? '/ledger?view=resident' : '/ledger');
  }

  if (session && shouldCountView(context.request.method, context.url.pathname)) {
    await touchVisitor(session, context.request, 'view');
  }

  return next();
});
