import type { APIRoute } from 'astro';
import { destroySession, readSession } from '../../lib/auth';
import { recordLoginEvent } from '../../lib/activity';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const session = await readSession(cookies);
  if (session) {
    await recordLoginEvent(request, 'signout', session.role, session.id);
  }
  await destroySession(cookies);
  return redirect('/');
};
