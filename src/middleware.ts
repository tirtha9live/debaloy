import { defineMiddleware } from 'astro:middleware';
import { readSession } from './lib/auth';

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

  return next();
});
