import type { APIRoute } from 'astro';
import { FLATS, MONTHS, type PayMode } from '../../../lib/constants';
import { parseAmount } from '../../../lib/format';
import { saveMaintenance } from '../../../lib/ledger';
import { sameOriginPath } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const updates = [];
  for (const flat of FLATS) {
    for (const month of MONTHS) {
      const amount = parseAmount(form.get(`amount:${flat.id}:${month}`));
      const mode = (String(form.get(`mode:${flat.id}:${month}`) ?? 'Cash') === 'Bank' ? 'Bank' : 'Cash') as PayMode;
      updates.push({ flatId: flat.id, month, amount, mode });
    }
  }
  await saveMaintenance(updates);
  return redirect(sameOriginPath(request, '/ledger/maintenance'));
};
