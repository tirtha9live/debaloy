import type { APIRoute } from 'astro';
import { sameOriginPath } from '../../../lib/auth';
import { parseAmount } from '../../../lib/format';
import { readFormIntent } from '../../../lib/form-intent';
import { createWithdrawal, deleteWithdrawal, updateWithdrawal } from '../../../lib/ledger';
import {
  auditWithdrawalDelete,
  auditWithdrawalUpdate,
  publishLedgerAudit,
  withdrawalCreateAudit,
} from '../../../lib/audit-server';

const FALLBACK = '/ledger/withdrawals';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit || !locals.ledgerYear) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const intent = readFormIntent(form, '');
  const session = locals.session;
  const year = locals.ledgerYear;

  if (intent === 'delete') {
    const id = Number(form.get('id'));
    if (Number.isInteger(id)) {
      const audit = session ? await auditWithdrawalDelete(session, request, year, id) : [];
      await deleteWithdrawal(id);
      if (session) await publishLedgerAudit(session, request, 'withdrawals', audit);
    }
    return redirect(sameOriginPath(request, FALLBACK));
  }

  const payload = {
    date: String(form.get('date') ?? '') || null,
    amount: parseAmount(form.get('amount')),
    note: String(form.get('note') ?? '').trim(),
  };

  if (payload.amount <= 0) {
    return redirect(sameOriginPath(request, FALLBACK));
  }

  if (intent === 'update') {
    const id = Number(form.get('id'));
    if (Number.isInteger(id)) {
      const audit = session ? await auditWithdrawalUpdate(session, request, year, id, payload) : [];
      await updateWithdrawal({ id, ...payload });
      if (session) await publishLedgerAudit(session, request, 'withdrawals', audit);
    }
  } else {
    const audit = withdrawalCreateAudit(payload);
    await createWithdrawal(payload);
    if (session) await publishLedgerAudit(session, request, 'withdrawals', audit);
  }

  return redirect(sameOriginPath(request, FALLBACK));
};
