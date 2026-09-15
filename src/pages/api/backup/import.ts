import type { APIRoute } from 'astro';
import { isSameOriginRequest } from '../../../lib/auth';
import {
  MAX_BACKUP_BYTES,
  parseLedgerBackup,
  restoreLedgerBackup,
  type RestoreMode,
} from '../../../lib/backup';

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
  if (!isSameOriginRequest(request)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const mode = String(form.get('mode') ?? '') === 'merge' ? 'merge' : 'overwrite';
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'Choose a Debaloy JSON backup.' }, { status: 400 });
  }
  if (file.size > MAX_BACKUP_BYTES) {
    return Response.json({ error: 'That backup file is too large.' }, { status: 400 });
  }

  try {
    const backup = parseLedgerBackup(await file.text());
    if (mode === 'overwrite' && backup.tables.flats.length === 0) {
      return Response.json({ error: 'That backup has no flats to restore.' }, { status: 400 });
    }
    await restoreLedgerBackup(backup, mode as RestoreMode);
    return Response.json({ ok: true, mode });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore that backup.';
    return Response.json({ error: message }, { status: 400 });
  }
};
