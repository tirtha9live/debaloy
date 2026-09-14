import type { APIRoute } from 'astro';
import { FLATS } from '../../../lib/constants';
import { parseAmount } from '../../../lib/format';
import { savePuja } from '../../../lib/ledger';
import { sameOriginPath } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const updates = FLATS.map((flat) => ({
    flatId: flat.id,
    amount: parseAmount(form.get(`amount:${flat.id}`)),
  }));
  await savePuja(updates);
  return redirect(sameOriginPath(request, '/ledger/puja'));
};
