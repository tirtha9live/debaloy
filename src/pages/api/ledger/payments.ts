import type { APIRoute } from 'astro';
import { FLATS } from '../../../lib/constants';
import { sameOriginPath } from '../../../lib/auth';
import { parseAmount } from '../../../lib/format';
import { readFormIntent } from '../../../lib/form-intent';
import {
  approveOnlinePayment,
  asPaymentType,
  createOnlinePayment,
  paymentTypeLabel,
} from '../../../lib/online-payments';
import { paymentApproveAudit, paymentSubmitAudit, publishLedgerAudit } from '../../../lib/audit-server';

const FALLBACK = '/ledger/payments';

function canSubmit(locals: App.Locals) {
  return Boolean(locals.session) && !locals.viewAsResident && locals.ledgerYear && locals.ledgerYear.endDate == null;
}

function canApprove(locals: App.Locals) {
  return Boolean(locals.canEdit && locals.ledgerYear);
}

function withError(request: Request, code: string) {
  const next = sameOriginPath(request, FALLBACK);
  const joiner = next.includes('?') ? '&' : '?';
  return `${next}${joiner}error=${code}`;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const intent = readFormIntent(form, 'create');
  const session = locals.session;
  const year = locals.ledgerYear;

  if (intent === 'approve') {
    if (!canApprove(locals) || !year) return new Response('Forbidden', { status: 403 });
    const id = Number(form.get('id'));
    if (!Number.isInteger(id)) return redirect(withError(request, 'missing'));
    const result = await approveOnlinePayment(year, id, {
      bank: String(form.get('bank') ?? ''),
      accountHolder: String(form.get('account_holder') ?? ''),
      month: String(form.get('month') ?? '') || null,
    });
    if (!result.ok) return redirect(withError(request, result.reason));
    if (session) {
      await publishLedgerAudit(
        session,
        request,
        'payments',
        paymentApproveAudit({
          flatId: result.payment.flatId,
          resident: result.payment.resident,
          type: paymentTypeLabel(result.payment.paymentType),
          amount: result.payment.amount,
          bank: result.bank,
          accountHolder: result.accountHolder,
          month: result.appliedMonth,
        }),
      );
    }
    return redirect(sameOriginPath(request, FALLBACK));
  }

  if (!canSubmit(locals) || !year) return new Response('Forbidden', { status: 403 });
  const flatId = String(form.get('flat_id') ?? '').trim();
  const paymentType = asPaymentType(form.get('payment_type'));
  const amount = parseAmount(form.get('amount'));
  const description = String(form.get('description') ?? '').trim();
  const linkAccount = String(form.get('link_account') ?? '') === '1';
  const flat = FLATS.find((item) => item.id === flatId);
  if (!flat || !paymentType || amount <= 0) {
    return redirect(withError(request, 'payment'));
  }

  const created = await createOnlinePayment({
    yearId: year.id,
    flatId,
    paymentType,
    description,
    amount,
    linkAccount,
  });
  if (!created) return redirect(withError(request, 'payment'));
  if (session) {
    await publishLedgerAudit(
      session,
      request,
      'payments',
      paymentSubmitAudit({
        flatId,
        resident: flat.resident,
        type: paymentTypeLabel(paymentType),
        amount,
      }),
    );
  }
  return redirect(sameOriginPath(request, FALLBACK));
};
