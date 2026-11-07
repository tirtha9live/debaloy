import type { APIRoute } from 'astro';
import { FLATS, type PayMode } from '../../../lib/constants';
import { isNprInput, parseCellNote, parseIsoDate, parseOptionalAmount } from '../../../lib/format';
import { maintenanceCellExtras, saveMaintenance, type MaintenanceUpdate } from '../../../lib/ledger';
import { sameOriginPath } from '../../../lib/auth';
import { auditMaintenanceSave, publishLedgerAudit } from '../../../lib/audit-server';
import { monthsForYear } from '../../../lib/years';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit || !locals.ledgerYear) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const months = monthsForYear(locals.ledgerYear.startDate, locals.ledgerYear.endDate);
  const updates: MaintenanceUpdate[] = [];
  for (const flat of FLATS) {
    for (const month of months) {
      const rawAmount = form.get(`amount:${flat.id}:${month}`);
      const rawMode = String(form.get(`mode:${flat.id}:${month}`) ?? 'Cash');
      const typed = isNprInput(rawAmount) ? null : parseOptionalAmount(rawAmount);
      const npr = typed == null && (isNprInput(rawAmount) || isNprInput(rawMode));
      const amount = npr ? null : typed;
      const mode = (rawMode === 'Bank' ? 'Bank' : 'Cash') as PayMode;
      const extras = maintenanceCellExtras({
        amount,
        npr,
        note: parseCellNote(form.get(`note:${flat.id}:${month}`)),
        paidOn: parseIsoDate(form.get(`paid:${flat.id}:${month}`)),
      });
      updates.push({ flatId: flat.id, month, amount, mode, npr, ...extras });
    }
  }
  const year = locals.ledgerYear;
  const session = locals.session;
  const audit = session ? await auditMaintenanceSave(session, request, year, updates) : [];
  await saveMaintenance(updates);
  if (session) await publishLedgerAudit(session, request, 'maintenance', audit);
  return redirect(sameOriginPath(request, '/ledger/maintenance'));
};
