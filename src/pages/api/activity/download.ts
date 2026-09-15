import type { APIRoute } from 'astro';
import { touchVisitor } from '../../../lib/activity';

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.session) return new Response('Unauthorised', { status: 401 });
  await touchVisitor(locals.session, request, 'download');
  return new Response(null, { status: 204 });
};
