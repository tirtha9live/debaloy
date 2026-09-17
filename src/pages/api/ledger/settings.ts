import type { APIRoute } from 'astro';
import { sameOriginPath } from '../../../lib/auth';
import { parseAmount } from '../../../lib/format';
import { readFormIntent } from '../../../lib/form-intent';
import { clearClosingOverride, saveClosingBalances } from '../../../lib/ledger';
import { auditClosingRefetch, auditClosingSave, publishLedgerAudit } from '../../../lib/audit-server';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
  const yearId = locals.ledgerYear?.id;
  if (!yearId) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const intent = readFormIntent(form);
  const session = locals.session;
  const year = locals.ledgerYear;
  if (intent === 'refetch_cash_in_hand') {
    const audit = session ? await auditClosingRefetch(session, request, year, 'cash_in_hand') : [];
    await clearClosingOverride(yearId, 'cash_in_hand');
    if (session) await publishLedgerAudit(session, request, 'settings', audit);
  } else if (intent === 'refetch_cash_in_bank') {
    const audit = session ? await auditClosingRefetch(session, request, year, 'cash_in_bank') : [];
    await clearClosingOverride(yearId, 'cash_in_bank');
    if (session) await publishLedgerAudit(session, request, 'settings', audit);
  } else {
    const next = {
      cashInHand: parseAmount(form.get('cash_in_hand')),
      cashInBank: parseAmount(form.get('cash_in_bank')),
    };
    const audit = session ? await auditClosingSave(session, request, year, next) : [];
    await saveClosingBalances(yearId, next.cashInHand, next.cashInBank);
    if (session) await publishLedgerAudit(session, request, 'settings', audit);
  }
  return redirect(sameOriginPath(request, '/ledger/receipts'));
};
