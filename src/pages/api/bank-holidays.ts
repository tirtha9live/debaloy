import type { APIRoute } from 'astro';
import { touchVisitor } from '../../lib/activity';
import { currentKolkataYear, listBankHolidays } from '../../lib/bank-holidays';

export const GET: APIRoute = async ({ locals, request, url }) => {
  if (!locals.session) return new Response('Unauthorised', { status: 401 });
  const requested = Number(url.searchParams.get('year'));
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : currentKolkataYear();
  const holidays = await listBankHolidays(year);
  if (!holidays.length) return new Response(`No bank holidays saved for ${year} yet.`, { status: 404 });

  const { buildBankHolidaysWorkbook, bankHolidaysFilename } = await import('../../lib/bank-holidays-excel');
  const bytes = await buildBankHolidaysWorkbook(year, holidays);
  await touchVisitor(locals.session, request, 'download');
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${bankHolidaysFilename(year)}"`,
      'Cache-Control': 'no-store',
    },
  });
};
