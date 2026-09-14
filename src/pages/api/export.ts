import type { APIRoute } from 'astro';
import type { ExportKind } from '../../lib/excel';

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.session) return new Response('Unauthorised', { status: 401 });
  const kind: ExportKind = url.searchParams.get('kind') === 'raw' ? 'raw' : 'formatted';
  const { buildWorkbookBuffer, exportFilename } = await import('../../lib/excel');
  const bytes = await buildWorkbookBuffer(kind);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exportFilename(kind)}"`,
      'Cache-Control': 'no-store',
    },
  });
};
