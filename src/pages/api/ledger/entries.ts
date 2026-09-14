import type { APIRoute } from 'astro';
import { sameOriginPath } from '../../../lib/auth';
import type { CategoryKind, PayMode } from '../../../lib/constants';
import { parseAmount } from '../../../lib/format';
import { createEntry, deleteEntry, updateEntry } from '../../../lib/ledger';

function asKind(value: FormDataEntryValue | null): CategoryKind {
  return value === 'expense' ? 'expense' : 'income';
}

function asMode(value: FormDataEntryValue | null): PayMode {
  return String(value) === 'Cash' ? 'Cash' : 'Bank';
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const kind = asKind(form.get('kind'));
  const intent = String(form.get('intent') ?? '');
  const fallback = kind === 'income' ? '/ledger/income' : '/ledger/expenses';

  if (intent === 'delete') {
    const id = Number(form.get('id'));
    if (Number.isInteger(id)) await deleteEntry(id, kind);
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
    if (Number.isInteger(id)) await updateEntry({ id, ...payload });
  } else {
    await createEntry(payload);
  }

  return redirect(sameOriginPath(request, fallback));
};
