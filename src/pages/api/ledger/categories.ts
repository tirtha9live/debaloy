import type { APIRoute } from 'astro';
import { sameOriginPath } from '../../../lib/auth';
import type { CategoryKind } from '../../../lib/constants';
import { createCategory, renameCategory } from '../../../lib/ledger';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const kind: CategoryKind = form.get('kind') === 'expense' ? 'expense' : 'income';
  const fallback = kind === 'income' ? '/ledger/income' : '/ledger/expenses';

  for (const [key, value] of form.entries()) {
    if (!key.startsWith('name:')) continue;
    const id = Number(key.slice(5));
    if (!Number.isInteger(id)) continue;
    await renameCategory(id, String(value).trim(), kind);
  }

  await createCategory(kind, String(form.get('new_name') ?? ''));

  return redirect(sameOriginPath(request, fallback));
};
