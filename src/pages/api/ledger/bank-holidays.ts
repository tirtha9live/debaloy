import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sameOriginPath } from '../../../lib/auth';
import { refreshCalendars } from '../../../lib/calendar-jobs';

const FALLBACK = '/ledger/bank-holidays';

function back(request: Request, status: string) {
  const next = new URL(sameOriginPath(request, FALLBACK), 'http://local');
  next.searchParams.set('fetch', status);
  return `${next.pathname}${next.search}`;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.session?.role !== 'admin' || locals.viewAsResident) return new Response('Forbidden', { status: 403 });

  const recent = await (env as Cloudflare.Env).DB.prepare(
    `SELECT COUNT(*) AS count FROM job_runs
     WHERE job = 'bank_holidays' AND trigger = 'manual'
       AND at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`,
  ).first<{ count: number }>();
  if (Number(recent?.count ?? 0) > 0) return redirect(back(request, 'wait'));

  const result = await refreshCalendars('manual');
  return redirect(back(request, result.bank.ok ? 'ok' : 'failed'));
};
