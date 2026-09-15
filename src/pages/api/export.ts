import type { APIRoute } from 'astro';
import type { ExportKind } from '../../lib/excel';
import { touchVisitor } from '../../lib/activity';
import { backupFilename, buildLedgerBackup } from '../../lib/backup';

export const GET: APIRoute = async ({ locals, request, url }) => {
  if (!locals.session) return new Response('Unauthorised', { status: 401 });
  const kind = url.searchParams.get('kind');

  if (kind === 'json') {
    if (!locals.canEdit) return new Response('Forbidden', { status: 403 });
    const backup = await buildLedgerBackup();
    await touchVisitor(locals.session, request, 'download');
    return new Response(`${JSON.stringify(backup, null, 2)}\n`, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${backupFilename()}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const excelKind: ExportKind = kind === 'raw' ? 'raw' : 'formatted';
  const { buildWorkbookBuffer, exportFilename } = await import('../../lib/excel');
  const bytes = await buildWorkbookBuffer(excelKind);
  await touchVisitor(locals.session, request, 'download');
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exportFilename(excelKind)}"`,
      'Cache-Control': 'no-store',
    },
  });
};
