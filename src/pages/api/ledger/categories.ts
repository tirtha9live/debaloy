import type { APIRoute } from 'astro';
import { sameOriginPath } from '../../../lib/auth';
import type { CategoryKind } from '../../../lib/constants';
import { createCategory, renameCategory } from '../../../lib/ledger';
import { auditCategoriesSave, publishLedgerAudit } from '../../../lib/audit-server';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit || !locals.ledgerYear) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const kind: CategoryKind = form.get('kind') === 'expense' ? 'expense' : 'income';
  const fallback = kind === 'income' ? '/ledger/income' : '/ledger/expenses';
  const renames: Array<{ id: number; name: string }> = [];

  for (const [key, value] of form.entries()) {
    if (!key.startsWith('name:')) continue;
    const id = Number(key.slice(5));
    if (!Number.isInteger(id)) continue;
    renames.push({ id, name: String(value).trim() });
  }

  const newName = String(form.get('new_name') ?? '');
  const session = locals.session;
  const audit = session
    ? await auditCategoriesSave(session, request, locals.ledgerYear, kind, renames, newName)
    : [];

  for (const rename of renames) {
    await renameCategory(rename.id, rename.name, kind);
  }

  await createCategory(kind, newName);
  if (session) await publishLedgerAudit(session, request, 'categories', audit);

  return redirect(sameOriginPath(request, fallback));
};
