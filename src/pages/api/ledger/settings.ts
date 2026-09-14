import type { APIRoute } from 'astro';
import { sameOriginPath } from '../../../lib/auth';
import { parseAmount } from '../../../lib/format';
import { saveSettings } from '../../../lib/ledger';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  await saveSettings(parseAmount(form.get('cash_in_hand')), parseAmount(form.get('cash_in_bank')));
  return redirect(sameOriginPath(request, '/ledger/receipts'));
};
