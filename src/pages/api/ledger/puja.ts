import type { APIRoute } from 'astro';
import { FLATS } from '../../../lib/constants';
import { parseAmount } from '../../../lib/format';
import { savePuja } from '../../../lib/ledger';
import { sameOriginPath } from '../../../lib/auth';
import { auditPujaSave, publishLedgerAudit } from '../../../lib/audit-server';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
  const yearId = locals.ledgerYear?.id;
  if (!yearId) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const updates = FLATS.map((flat) => ({
    flatId: flat.id,
    amount: parseAmount(form.get(`amount:${flat.id}`)),
  }));
  const session = locals.session;
  const audit =
    session && locals.ledgerYear ? await auditPujaSave(session, request, locals.ledgerYear, updates) : [];
  await savePuja(yearId, updates);
  if (session) await publishLedgerAudit(session, request, 'puja', audit);
  return redirect(sameOriginPath(request, '/ledger/puja'));
};
