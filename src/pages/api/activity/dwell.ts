import type { APIRoute } from 'astro';
import { addPageDwell } from '../../../lib/activity';

export const POST: APIRoute = async ({ request, locals }) => {
  const session = locals.session;
  if (!session) return new Response(null, { status: 204 });
  let body: { path?: string; duration_sec?: number } | null = null;
  try {
    body = (await request.json()) as { path?: string; duration_sec?: number };
  } catch {
    return new Response(null, { status: 400 });
  }
  const path = String(body?.path ?? '');
  const seconds = Number(body?.duration_sec);
  if (!path || !Number.isFinite(seconds)) return new Response(null, { status: 400 });
  await addPageDwell(session.id, path, seconds);
  return new Response(null, { status: 204 });
};
