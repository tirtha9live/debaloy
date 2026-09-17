import type { APIRoute } from 'astro';
import { sameOriginPath } from '../../../lib/auth';
import type { CategoryKind, PayMode } from '../../../lib/constants';
import { parseAmount } from '../../../lib/format';
import { readFormIntent } from '../../../lib/form-intent';
import { createEntry, deleteEntry, updateEntry } from '../../../lib/ledger';
import {
  auditEntryDelete,
  auditEntryUpdate,
  entryCreateAudit,
  publishLedgerAudit,
} from '../../../lib/audit-server';

function asKind(value: FormDataEntryValue | null): CategoryKind {
  return value === 'expense' ? 'expense' : 'income';
}

function asMode(value: FormDataEntryValue | null): PayMode {
  return String(value) === 'Cash' ? 'Cash' : 'Bank';
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit || !locals.ledgerYear) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const kind = asKind(form.get('kind'));
  const intent = readFormIntent(form, '');
  const fallback = kind === 'income' ? '/ledger/income' : '/ledger/expenses';
  const session = locals.session;
  const year = locals.ledgerYear;

  if (intent === 'delete') {
    const id = Number(form.get('id'));
    if (Number.isInteger(id)) {
      const audit = session ? await auditEntryDelete(session, request, year, kind, id) : [];
      await deleteEntry(id, kind);
      if (session) await publishLedgerAudit(session, request, 'entries', audit);
    }
    return redirect(sameOriginPath(request, fallback));
  }

  const payload = {
    kind,
    date: String(form.get('date') ?? '') || null,
    category: String(form.get('category') ?? '').trim(),
    description: String(form.get('description') ?? '').trim(),
    mode: asMode(form.get('mode')),
    amount: parseAmount(form.get('amount')),
  };

  if (!payload.category) {
    return redirect(sameOriginPath(request, fallback));
  }

  if (intent === 'update') {
    const id = Number(form.get('id'));
    if (Number.isInteger(id)) {
      const audit = session ? await auditEntryUpdate(session, request, year, kind, id, payload) : [];
      await updateEntry({ id, ...payload });
      if (session) await publishLedgerAudit(session, request, 'entries', audit);
    }
  } else {
    const audit = entryCreateAudit(payload);
    await createEntry(payload);
    if (session) await publishLedgerAudit(session, request, 'entries', audit);
  }

  return redirect(sameOriginPath(request, fallback));
};
