import type { APIRoute } from 'astro';
import { FLATS } from '../../../lib/constants';
import { sameOriginPath } from '../../../lib/auth';
import { readFormIntent } from '../../../lib/form-intent';
import { getFlatMobile, isValidMobile, normalizeMobile, saveFlatMobile } from '../../../lib/mobiles';
import { mobileSaveAudit, publishLedgerAudit } from '../../../lib/audit-server';

const FALLBACK = '/ledger/e-receipts';

function canWrite(locals: App.Locals) {
  return Boolean(locals.session) && !locals.viewAsResident;
}

function canEditFull(locals: App.Locals) {
  return locals.session?.role === 'admin' && !locals.viewAsResident;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canWrite(locals)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const intent = readFormIntent(form, 'save');
  const treasurer = canEditFull(locals);
  if (intent === 'update' && !treasurer) return new Response('Forbidden', { status: 403 });

  const flatId = String(form.get('flat_id') ?? '').trim();
  const mobile = normalizeMobile(form.get('mobile'));
  const flat = FLATS.find((item) => item.id === flatId);
  if (!flat || !isValidMobile(mobile)) {
    const next = sameOriginPath(request, FALLBACK);
    return redirect(`${next}${next.includes('?') ? '&' : '?'}error=mobile`);
  }

  const previous = await getFlatMobile(flatId);
  const saved = await saveFlatMobile(flatId, mobile);
  const session = locals.session;
  if (saved && session && previous !== mobile) {
    await publishLedgerAudit(
      session,
      request,
      'e-receipts',
      mobileSaveAudit({
        flatId,
        resident: flat.resident,
        from: previous,
        to: mobile,
        masked: !treasurer,
      }),
    );
  }
  return redirect(sameOriginPath(request, FALLBACK));
};
