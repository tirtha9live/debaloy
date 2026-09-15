import type { APIRoute } from 'astro';
import {
  clearLoginFailures,
  createSession,
  getLoginLockRemaining,
  isSecureRequest,
  recordFailedLogin,
  resolveRole,
} from '../../lib/auth';
import { recordLoginEvent } from '../../lib/activity';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if ((await getLoginLockRemaining(request)) > 0) {
    await recordLoginEvent(request, 'locked');
    return redirect('/?error=1');
  }

  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const role = await resolveRole(password);
  if (!role) {
    const result = await recordFailedLogin(request);
    if (result.locked) {
      await recordLoginEvent(request, 'locked');
      return redirect('/?error=1');
    }
    await recordLoginEvent(request, 'failed');
    return redirect(`/?error=1&left=${result.remaining}`);
  }
  await clearLoginFailures(request);
  const session = await createSession(role, cookies, isSecureRequest(new URL(request.url)));
  await recordLoginEvent(request, 'success', role, session.id);
  return redirect('/ledger');
};
