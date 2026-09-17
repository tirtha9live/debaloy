import type { APIRoute } from 'astro';
import { FLATS, type PayMode } from '../../../lib/constants';
import { parseOptionalAmount } from '../../../lib/format';
import { saveMaintenance } from '../../../lib/ledger';
import { sameOriginPath } from '../../../lib/auth';
import { auditMaintenanceSave, publishLedgerAudit } from '../../../lib/audit-server';
import { monthsForYear } from '../../../lib/years';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit || !locals.ledgerYear) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const months = monthsForYear(locals.ledgerYear.startDate, locals.ledgerYear.endDate);
  const updates = [];
  for (const flat of FLATS) {
    for (const month of months) {
      const amount = parseOptionalAmount(form.get(`amount:${flat.id}:${month}`));
      const mode = (String(form.get(`mode:${flat.id}:${month}`) ?? 'Cash') === 'Bank' ? 'Bank' : 'Cash') as PayMode;
      updates.push({ flatId: flat.id, month, amount, mode });
    }
  }
  const year = locals.ledgerYear;
  const session = locals.session;
  const audit = session ? await auditMaintenanceSave(session, request, year, updates) : [];
  await saveMaintenance(updates);
  if (session) await publishLedgerAudit(session, request, 'maintenance', audit);
  return redirect(sameOriginPath(request, '/ledger/maintenance'));
};
