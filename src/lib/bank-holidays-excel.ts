import ExcelJS from 'exceljs';
import { ADDRESS, ASSOCIATION } from './constants';
import { BANK_HOLIDAY_STATE, type BankHoliday } from './bank-holidays';

const DARK_BLUE = 'FF1F4E78';
const ROW_ALT = 'FFF3F6FA';
const GREY = 'FFBFBFBF';
const SUBTEXT = 'FF595959';
const thin = { style: 'thin' as const, color: { argb: GREY } };
const box: ExcelJS.Borders = { top: thin, left: thin, bottom: thin, right: thin };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function asUtcDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function weekday(iso: string) {
  return DAYS[asUtcDate(iso).getUTCDay()];
}

export function bankHolidaysFilename(year: number) {
  return `Bank-Holidays-${year}-West-Bengal.xlsx`;
}

/** A4 portrait, one page wide, header repeated on every page. */
export async function buildBankHolidaysWorkbook(year: number, holidays: BankHoliday[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = ASSOCIATION;
  workbook.created = new Date();
  const ws = workbook.addWorksheet(`Bank Holidays ${year}`, {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      printTitlesRow: '5:5',
    },
    headerFooter: { oddFooter: `&L${ASSOCIATION}&RPage &P of &N` },
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
  });

  ws.columns = [
    { key: 'no', width: 6 },
    { key: 'date', width: 16 },
    { key: 'day', width: 13 },
    { key: 'name', width: 52 },
  ];

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = ASSOCIATION;
  ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: DARK_BLUE } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 22;

  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = `Bank Holidays ${year} — ${BANK_HOLIDAY_STATE} (Kolkata)`;
  ws.getCell('A2').font = { name: 'Arial', size: 12, bold: true };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.mergeCells('A3:D3');
  ws.getCell('A3').value = ADDRESS;
  ws.getCell('A3').font = { name: 'Arial', size: 9, italic: true, color: { argb: SUBTEXT } };
  ws.getCell('A3').alignment = { horizontal: 'center', wrapText: true };
  ws.getRow(3).height = 26;

  const header = ws.getRow(5);
  header.values = ['#', 'Date', 'Day', 'Holiday'];
  header.height = 20;
  header.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = box;
  });

  holidays.forEach((holiday, index) => {
    const row = ws.getRow(6 + index);
    row.values = [index + 1, asUtcDate(holiday.date), weekday(holiday.date), holiday.name];
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Arial', size: 10, bold: col === 4 ? false : undefined };
      cell.border = box;
      cell.alignment = { vertical: 'middle', horizontal: col === 4 ? 'left' : 'center', wrapText: col === 4 };
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } };
    });
    row.getCell(2).numFmt = 'dd mmm yyyy';
  });

  const totalRow = ws.getRow(6 + holidays.length + 1);
  ws.mergeCells(totalRow.number, 1, totalRow.number, 4);
  totalRow.getCell(1).value = `${holidays.length} bank holidays.`;
  totalRow.getCell(1).font = { name: 'Arial', size: 9, italic: true, color: { argb: SUBTEXT } };

  ws.pageSetup.printArea = `A1:D${totalRow.number}`;
  return workbook.xlsx.writeBuffer();
}
