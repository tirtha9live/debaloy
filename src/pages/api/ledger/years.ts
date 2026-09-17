import type { APIRoute } from 'astro';
import { readFormIntent } from '../../../lib/form-intent';
import { loadLedger } from '../../../lib/ledger';
import { closeCurrentYear, currentYear, getYear, updateYearEnd } from '../../../lib/years';
import { publishLedgerAudit, yearActionAudit } from '../../../lib/audit-server';

function yearsRedirect(intent: string, error?: string) {
  const path = intent === 'update_end' ? '/ledger/handover' : '/ledger/years';
  if (!error) return path;
  return `${path}?error=${encodeURIComponent(error)}`;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const treasurer = locals.session?.role === 'admin' && !locals.viewAsResident;
  if (!treasurer) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const intent = readFormIntent(form, '');
  const meetingDate = String(form.get('meeting_date') ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    return redirect(yearsRedirect(intent, 'Choose a valid meeting date.'));
  }

  const session = locals.session;

  try {
    if (intent === 'close') {
      const open = await currentYear();
      const snapshot = await loadLedger({ ...open, endDate: meetingDate });
      await closeCurrentYear(meetingDate, {
        cash: snapshot.computedCashInHand,
        bank: snapshot.computedCashInBank,
      });
    } else if (intent === 'update_end') {
      const id = Number(form.get('year_id'));
      const year = Number.isInteger(id) ? await getYear(id) : null;
      if (year?.endDate) {
        const snapshot = await loadLedger({ ...year, endDate: meetingDate });
        await updateYearEnd(year.id, meetingDate, {
          cash: snapshot.computedCashInHand,
          bank: snapshot.computedCashInBank,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update the year.';
    return redirect(yearsRedirect(intent, message));
  }

  if (session) {
    await publishLedgerAudit(session, request, 'years', yearActionAudit(intent, meetingDate));
  }

  return redirect(yearsRedirect(intent));
};
