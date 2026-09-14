import type { APIRoute } from 'astro';
import {
  createSession,
  getLoginLockRemaining,
  isSecureRequest,
  lockLogin,
  resolveRole,
} from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if ((await getLoginLockRemaining(request)) > 0) {
    return redirect('/?error=1');
  }

  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const role = await resolveRole(password);
  if (!role) {
    await lockLogin(request);
    return redirect('/?error=1');
  }
  await createSession(role, cookies, isSecureRequest(new URL(request.url)));
  return redirect('/ledger');
};
