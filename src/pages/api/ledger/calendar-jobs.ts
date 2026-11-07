import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { currentKolkataYear, refreshBankHolidays } from '../../../lib/bank-holidays';
import { CALENDAR_JOB, consolidateFestivals, refreshCalendars } from '../../../lib/calendar-jobs';
import { DRIK_JOB, refreshDrikFestivals } from '../../../lib/drik-festivals';
import { readFormIntent } from '../../../lib/form-intent';

const JOB_FOR: Record<string, string> = {
  bank: 'bank_holidays',
  drik: DRIK_JOB,
  consolidate: CALENDAR_JOB,
  all: CALENDAR_JOB,
};

function back(action: string, result: string) {
  return `/ledger/activity?job=${action}&result=${result}#background-jobs`;
}

/** Treasurer force actions from Activity. Fetches also re-consolidate so the landing page never shows stale dates. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.session?.role !== 'admin' || locals.viewAsResident) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const action = readFormIntent(form, '');
  const job = JOB_FOR[action];
  if (!job) return new Response('Unknown action', { status: 400 });

  const recent = await (env as Cloudflare.Env).DB.prepare(
    `SELECT COUNT(*) AS count FROM job_runs
     WHERE job = ? AND trigger = 'manual' AND at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`,
  )
    .bind(job)
    .first<{ count: number }>();
  if (Number(recent?.count ?? 0) > 0) return redirect(back(action, 'wait'));

  const year = currentKolkataYear();
  let ok = true;
  if (action === 'all') {
    const result = await refreshCalendars('manual', year);
    ok = result.bank.ok && result.drik.ok;
  } else if (action === 'bank') {
    ok = (await refreshBankHolidays('manual', year)).ok;
    await consolidateFestivals('manual', year);
  } else if (action === 'drik') {
    ok = (await refreshDrikFestivals('manual', year)).ok;
    await consolidateFestivals('manual', year);
  } else {
    await consolidateFestivals('manual', year);
  }
  return redirect(back(action, ok ? 'ok' : 'failed'));
};
