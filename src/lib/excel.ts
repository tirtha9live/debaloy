import ExcelJS from 'exceljs';
import {
  ADDRESS,
  ASSOCIATION,
  FY_LABEL,
  HANDOVER_CLOSING_BANK,
  HANDOVER_CLOSING_CASH,
  HANDOVER_LINES,
  MONTHS,
} from './constants';
import {
  buildReceiptsPayments,
  categoryTotals,
  loadLedger,
  type LedgerSnapshot,
} from './ledger';

export type ExportKind = 'formatted' | 'raw';

const DARK_BLUE = 'FF1F4E78';
const MED_BLUE = 'FF4472C4';
const CREAM = 'FFFFF9E6';
const BLUE_TEXT = 'FF0000FF';
const WHITE = 'FFFFFFFF';
const GREY = 'FFBFBFBF';
const SUBTEXT = 'FF595959';
const SECTION = 'FFD9E1F2';
const TOTAL_FILL = 'FFD6E4F0';
const RED_TEXT = 'FFC00000';
const EXP_RED = 'FF922B21';
const EXP_SUMM = 'FFFDECEA';
const INC_GREEN = 'FF1E6B3C';
const INC_SUMM = 'FFEAF4EC';
const PUJA_COL = 'FF6B2D8B';
const PUJA_CREAM = 'FFFAF0FF';
const INR = '#,##0.00';
const ARIAL = 'Arial';

const thin = { style: 'thin' as const, color: { argb: GREY } };
const box: ExcelJS.Borders = { top: thin, left: thin, bottom: thin, right: thin };

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function font(opts: Partial<ExcelJS.Font> = {}): ExcelJS.Font {
  return { name: ARIAL, size: 11, color: { argb: 'FF000000' }, ...opts };
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return Number(value);
}

function header(cell: ExcelJS.Cell, value: string, bg = DARK_BLUE, size = 10, align: ExcelJS.Alignment['horizontal'] = 'center') {
  cell.value = value;
  cell.font = font({ bold: true, size, color: { argb: WHITE } });
  cell.fill = fill(bg);
  cell.border = box;
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true };
}

function plain(cell: ExcelJS.Cell, value: ExcelJS.CellValue = '', opts?: { bold?: boolean; align?: ExcelJS.Alignment['horizontal']; color?: string; numFmt?: string }) {
  cell.value = value;
  cell.font = font({ bold: opts?.bold, color: { argb: opts?.color ?? 'FF000000' } });
  cell.border = box;
  cell.alignment = { horizontal: opts?.align ?? 'left', vertical: 'middle' };
  if (opts?.numFmt) cell.numFmt = opts.numFmt;
}

function dataCell(cell: ExcelJS.Cell, value: ExcelJS.CellValue = '', bg = CREAM) {
  cell.value = value === '' ? null : value;
  cell.font = font({ color: { argb: BLUE_TEXT } });
  cell.fill = fill(bg);
  cell.border = box;
  cell.alignment = { vertical: 'middle' };
  cell.numFmt = INR;
}

function section(cell: ExcelJS.Cell, value: string, bg = SECTION, color = DARK_BLUE) {
  cell.value = value;
  cell.font = font({ bold: true, color: { argb: color } });
  cell.fill = fill(bg);
  cell.border = box;
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

function total(cell: ExcelJS.Cell, value: ExcelJS.CellValue, numFmt = INR) {
  cell.value = value;
  cell.font = font({ bold: true, color: { argb: WHITE } });
  cell.fill = fill(DARK_BLUE);
  cell.border = box;
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.numFmt = numFmt;
}

function title(cell: ExcelJS.Cell, value: string, color = DARK_BLUE, size = 14) {
  cell.value = value;
  cell.font = font({ bold: true, size, color: { argb: color } });
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function addRawSheet(workbook: ExcelJS.Workbook, name: string, rows: Array<Array<string | number>>) {
  const sheet = workbook.addWorksheet(name);
  for (const row of rows) {
    sheet.addRow(row);
  }
  sheet.columns.forEach((column) => {
    column.width = 16;
  });
}

function buildRawWorkbook(workbook: ExcelJS.Workbook, snapshot: LedgerSnapshot) {
  const handoverRows: Array<Array<string | number>> = [
    [ASSOCIATION],
    [ADDRESS],
    ['Receipts & Payments Account — Financial Year 2024-2026 (ended 31st August)'],
    ['Original handover received at takeover. For later reference. Do not edit.'],
    [],
    ['RECEIPTS', 'Amount (Rs.)', 'PAYMENTS', 'Amount (Rs.)'],
  ];
  for (const line of HANDOVER_LINES) {
    handoverRows.push([
      line.receiptLabel ?? '',
      money(line.receiptAmount),
      line.paymentLabel ?? '',
      money(line.paymentAmount),
    ]);
  }
  const receiptTotal = HANDOVER_LINES.reduce((sum, line) => sum + (line.receiptAmount ?? 0), 0);
  const paymentTotal = HANDOVER_LINES.reduce((sum, line) => sum + (line.paymentAmount ?? 0), 0);
  handoverRows.push(['TOTAL', receiptTotal, 'TOTAL', paymentTotal]);
  handoverRows.push([]);
  handoverRows.push(['Closing Bank Balance to FY 2026-27:', HANDOVER_CLOSING_BANK]);
  handoverRows.push(['Closing Cash Balance to FY 2026-27:', HANDOVER_CLOSING_CASH]);
  addRawSheet(workbook, 'Handover', handoverRows);

  const maintHeader = ['Flat', 'Owner', ...MONTHS.flatMap((month) => [month, 'Mode']), 'Total Bank', 'Total Cash', 'Total'];
  const maintRows: Array<Array<string | number>> = [
    [ASSOCIATION],
    [`Maintenance Collection Tracker  |  ${FY_LABEL}`],
    [],
    maintHeader,
  ];
  for (const row of snapshot.maintenance) {
    maintRows.push([
      row.flatId,
      row.owner,
      ...MONTHS.flatMap((month) => [money(row.months[month].amount), row.months[month].mode]),
      money(row.totalBank),
      money(row.totalCash),
      money(row.total),
    ]);
  }
  maintRows.push([
    'Grand Total',
    '',
    ...MONTHS.flatMap((month) => [money(snapshot.maintenanceTotals.months[month]), '']),
    money(snapshot.maintenanceTotals.bank),
    money(snapshot.maintenanceTotals.cash),
    money(snapshot.maintenanceTotals.grand),
  ]);
  addRawSheet(workbook, 'Maintenance', maintRows);

  const pujaRows: Array<Array<string | number>> = [
    [`Debaloy — Puja Subscription ${FY_LABEL}`],
    ['Cash only — one payment per flat.'],
    [],
    ['Flat', 'Owner', 'Amount (Rs.)'],
  ];
  for (const row of snapshot.puja) {
    pujaRows.push([row.flatId, row.owner, money(row.amount)]);
  }
  pujaRows.push(['Grand Total (Cash)', '', money(snapshot.pujaTotal)]);
  addRawSheet(workbook, 'Puja Subscription', pujaRows);

  for (const kind of ['income', 'expense'] as const) {
    const titleLabel = kind === 'income' ? 'Income Tracker' : 'Expense Tracker';
    const entries = snapshot.entries.filter((entry) => entry.kind === kind);
    const totals = categoryTotals(snapshot, kind);
    const rows: Array<Array<string | number>> = [
      [`${ASSOCIATION} — ${titleLabel}`],
      [],
      ['Date', `${kind === 'income' ? 'Income' : 'Expense'} Type`, 'Description', 'Mode', 'Amount (Rs.)', '', 'Category Summary', 'Total (Rs.)'],
    ];
    const max = Math.max(entries.length, totals.length, 1);
    for (let i = 0; i < max; i += 1) {
      const entry = entries[i];
      const totalRow = totals[i];
      rows.push([
        entry?.date ?? '',
        entry?.category ?? '',
        entry?.description ?? '',
        entry?.mode ?? '',
        entry ? money(entry.amount) : '',
        '',
        totalRow?.name ?? '',
        totalRow ? money(totalRow.total) : '',
      ]);
    }
    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      `TOTAL ${kind === 'income' ? 'INCOME' : 'EXPENSES'}`,
      money(totals.reduce((sum, item) => sum + item.total, 0)),
    ]);
    addRawSheet(workbook, kind === 'income' ? 'Income' : 'Expenses', rows);
  }

  const report = buildReceiptsPayments(snapshot);
  const rpRows: Array<Array<string | number>> = [
    [ASSOCIATION],
    [ADDRESS],
    ['Receipts & Payments Account — Financial Year 2026-2027 (September 2026 to August 2027)'],
    ['Current-year statement. Totals update as new data is added. Same form as the handover.'],
    ['RECEIPTS', 'Amount (Rs.)', 'PAYMENTS', 'Amount (Rs.)'],
  ];
  for (const line of report.lines) {
    rpRows.push([
      line.receiptLabel,
      line.receiptAmount === null ? '' : money(line.receiptAmount),
      line.paymentLabel,
      line.paymentAmount === null ? '' : money(line.paymentAmount),
    ]);
  }
  rpRows.push(['TOTAL', money(report.receiptTotal), 'TOTAL', money(report.paymentTotal)]);
  rpRows.push([]);
  rpRows.push(['Closing Bank Balance to FY 2027-28:', money(snapshot.cashInBank)]);
  rpRows.push(['Closing Cash Balance to FY 2027-28:', money(snapshot.cashInHand)]);
  rpRows.push([]);
  rpRows.push(['Signed by: Signature of President', '', 'Signed by: Signature of Secretary & Treasurer']);
  addRawSheet(workbook, 'This Year 2026-27', rpRows);
}

function buildFormattedHandover(workbook: ExcelJS.Workbook) {
  const ws = workbook.addWorksheet('Handover');
  ws.mergeCells('A1:D1');
  title(ws.getCell('A1'), ASSOCIATION);
  ws.getRow(1).height = 22;
  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = ADDRESS;
  ws.getCell('A2').font = font({ size: 10, color: { argb: SUBTEXT } });
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.mergeCells('A3:D3');
  ws.getCell('A3').value = 'Receipts & Payments Account — Financial Year 2024-2026 (ended 31st August)';
  ws.getCell('A3').font = font({ bold: true, color: { argb: DARK_BLUE } });
  ws.getCell('A3').alignment = { horizontal: 'center' };
  ws.mergeCells('A4:D4');
  ws.getCell('A4').value = 'This is the original handover record. Do not edit.';
  ws.getCell('A4').font = font({ bold: true, size: 9, color: { argb: RED_TEXT } });
  ws.getCell('A4').alignment = { horizontal: 'center' };

  ['RECEIPTS', 'Amount (Rs.)', 'PAYMENTS', 'Amount (Rs.)'].forEach((label, index) => {
    header(ws.getCell(6, index + 1), label, DARK_BLUE, 11);
  });

  HANDOVER_LINES.forEach((line, offset) => {
    const row = 7 + offset;
    if (line.receiptLabel) {
      if (line.receiptSection) section(ws.getCell(row, 1), line.receiptLabel);
      else plain(ws.getCell(row, 1), line.receiptLabel);
    } else {
      ws.getCell(row, 1).border = box;
    }
    if (line.receiptAmount !== null) {
      plain(ws.getCell(row, 2), line.receiptAmount, { align: 'right', numFmt: INR });
    } else {
      ws.getCell(row, 2).border = box;
      ws.getCell(row, 2).fill = fill(line.receiptSection ? SECTION : WHITE);
    }
    if (line.paymentLabel) {
      if (line.paymentSection) section(ws.getCell(row, 3), line.paymentLabel);
      else plain(ws.getCell(row, 3), line.paymentLabel);
    } else {
      ws.getCell(row, 3).border = box;
    }
    if (line.paymentAmount !== null) {
      plain(ws.getCell(row, 4), line.paymentAmount, { align: 'right', numFmt: INR });
    } else {
      ws.getCell(row, 4).border = box;
      ws.getCell(row, 4).fill = fill(line.paymentSection ? SECTION : WHITE);
    }
  });

  const last = 7 + HANDOVER_LINES.length;
  const receiptTotal = HANDOVER_LINES.reduce((sum, line) => sum + (line.receiptAmount ?? 0), 0);
  const paymentTotal = HANDOVER_LINES.reduce((sum, line) => sum + (line.paymentAmount ?? 0), 0);
  total(ws.getCell(last, 1), 'TOTAL', 'General');
  total(ws.getCell(last, 2), receiptTotal);
  total(ws.getCell(last, 3), 'TOTAL', 'General');
  total(ws.getCell(last, 4), paymentTotal);
  ws.getCell(last, 2).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(last, 4).alignment = { horizontal: 'right', vertical: 'middle' };

  let note = last + 2;
  for (const [label, value] of [
    ['Closing Bank Balance to FY 2026-27:', HANDOVER_CLOSING_BANK],
    ['Closing Cash Balance to FY 2026-27:', HANDOVER_CLOSING_CASH],
  ] as const) {
    ws.getCell(note, 1).value = label;
    ws.getCell(note, 1).font = font({ bold: true, color: { argb: DARK_BLUE } });
    ws.getCell(note, 2).value = value;
    ws.getCell(note, 2).font = font({ bold: true, color: { argb: DARK_BLUE } });
    ws.getCell(note, 2).numFmt = INR;
    note += 1;
  }

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 42;
  ws.getColumn(4).width = 16;
}

function buildFormattedMaintenance(workbook: ExcelJS.Workbook, snapshot: LedgerSnapshot) {
  const ws = workbook.addWorksheet('Maintenance');
  const lastCol = 3 + MONTHS.length * 2 + 2;
  ws.mergeCells(1, 1, 1, lastCol);
  title(ws.getCell('A1'), ASSOCIATION);
  ws.getRow(1).height = 22;
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell('A2').value = `Maintenance Collection Tracker  |  Sept 2026 to Aug 2027`;
  ws.getCell('A2').font = font({ bold: true, size: 12, color: { argb: DARK_BLUE } });
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell('A3').value = 'Enter amount and select mode (Bank/Cash) for each month. Mode defaults to Cash.';
  ws.getCell('A3').font = font({ size: 9, italic: true, color: { argb: SUBTEXT } });
  ws.getCell('A3').alignment = { horizontal: 'center' };

  header(ws.getCell('A5'), 'Flat');
  header(ws.getCell('A6'), '');
  ws.mergeCells('A5:A6');
  header(ws.getCell('B5'), 'Owner');
  header(ws.getCell('B6'), '');
  ws.mergeCells('B5:B6');

  MONTHS.forEach((month, index) => {
    const amountCol = 3 + index * 2;
    const modeCol = amountCol + 1;
    header(ws.getCell(5, amountCol), month);
    header(ws.getCell(5, modeCol), month);
    ws.mergeCells(5, amountCol, 5, modeCol);
    header(ws.getCell(6, amountCol), 'Amount (Rs.)', MED_BLUE, 9);
    header(ws.getCell(6, modeCol), 'Mode', MED_BLUE, 9);
  });

  const bankCol = lastCol - 2;
  const cashCol = lastCol - 1;
  const totalCol = lastCol;
  header(ws.getCell(5, bankCol), 'Total Bank');
  header(ws.getCell(6, bankCol), '');
  ws.mergeCells(5, bankCol, 6, bankCol);
  header(ws.getCell(5, cashCol), 'Total Cash');
  header(ws.getCell(6, cashCol), '');
  ws.mergeCells(5, cashCol, 6, cashCol);
  header(ws.getCell(5, totalCol), 'Total');
  header(ws.getCell(6, totalCol), '');
  ws.mergeCells(5, totalCol, 6, totalCol);
  ws.getRow(5).height = 18;
  ws.getRow(6).height = 16;

  snapshot.maintenance.forEach((row, index) => {
    const excelRow = 7 + index;
    plain(ws.getCell(excelRow, 1), row.flatId, { align: 'center' });
    plain(ws.getCell(excelRow, 2), row.owner);
    MONTHS.forEach((month, monthIndex) => {
      const amountCol = 3 + monthIndex * 2;
      const modeCol = amountCol + 1;
      const cell = row.months[month];
      dataCell(ws.getCell(excelRow, amountCol), cell.amount || null);
      const mode = ws.getCell(excelRow, modeCol);
      mode.value = cell.mode;
      mode.font = font({ size: 10, color: { argb: BLUE_TEXT } });
      mode.fill = fill(CREAM);
      mode.border = box;
      mode.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    const bank = ws.getCell(excelRow, bankCol);
    bank.value = row.totalBank;
    bank.font = font({ bold: true, color: { argb: DARK_BLUE } });
    bank.fill = fill(TOTAL_FILL);
    bank.border = box;
    bank.numFmt = INR;
    bank.alignment = { horizontal: 'right', vertical: 'middle' };
    const cash = ws.getCell(excelRow, cashCol);
    cash.value = row.totalCash;
    cash.font = font({ bold: true, color: { argb: DARK_BLUE } });
    cash.fill = fill(TOTAL_FILL);
    cash.border = box;
    cash.numFmt = INR;
    cash.alignment = { horizontal: 'right', vertical: 'middle' };
    plain(ws.getCell(excelRow, totalCol), row.total, { bold: true, align: 'right', numFmt: INR });
  });

  const totalRow = 7 + snapshot.maintenance.length + 1;
  total(ws.getCell(totalRow, 1), 'Grand Total', 'General');
  header(ws.getCell(totalRow, 2), '', DARK_BLUE);
  ws.mergeCells(totalRow, 1, totalRow, 2);
  MONTHS.forEach((month, monthIndex) => {
    const amountCol = 3 + monthIndex * 2;
    const modeCol = amountCol + 1;
    total(ws.getCell(totalRow, amountCol), snapshot.maintenanceTotals.months[month]);
    ws.getCell(totalRow, amountCol).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(totalRow, modeCol).fill = fill(DARK_BLUE);
    ws.getCell(totalRow, modeCol).border = box;
  });
  total(ws.getCell(totalRow, bankCol), snapshot.maintenanceTotals.bank);
  total(ws.getCell(totalRow, cashCol), snapshot.maintenanceTotals.cash);
  total(ws.getCell(totalRow, totalCol), snapshot.maintenanceTotals.grand);
  [bankCol, cashCol, totalCol].forEach((col) => {
    ws.getCell(totalRow, col).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 22;
  MONTHS.forEach((_, index) => {
    ws.getColumn(3 + index * 2).width = 12;
    ws.getColumn(4 + index * 2).width = 8;
  });
  ws.getColumn(bankCol).width = 13;
  ws.getColumn(cashCol).width = 13;
  ws.getColumn(totalCol).width = 13;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 6 }];
}

function buildFormattedPuja(workbook: ExcelJS.Workbook, snapshot: LedgerSnapshot) {
  const ws = workbook.addWorksheet('Puja Subscription');
  ws.mergeCells('A1:C1');
  title(ws.getCell('A1'), `Debaloy — Puja Subscription ${FY_LABEL}`, PUJA_COL, 12);
  ws.getRow(1).height = 22;
  ws.mergeCells('A2:C2');
  ws.getCell('A2').value = 'Cash only — one payment per flat. Total feeds this year’s account.';
  ws.getCell('A2').font = font({ size: 9, italic: true, color: { argb: SUBTEXT } });
  ws.getCell('A2').alignment = { horizontal: 'center', wrapText: true };
  ws.mergeCells('A3:C3');
  ws.getCell('A3').value = 'FY 2026-27  |  Sept 2026 – Aug 2027  |  Cash Only';
  ws.getCell('A3').font = font({ bold: true, size: 10, color: { argb: PUJA_COL } });
  ws.getCell('A3').alignment = { horizontal: 'center' };

  ['Flat', 'Owner', 'Amount (Rs.)'].forEach((label, index) => {
    header(ws.getCell(5, index + 1), label, PUJA_COL);
  });

  snapshot.puja.forEach((row, index) => {
    const excelRow = 6 + index;
    plain(ws.getCell(excelRow, 1), row.flatId, { align: 'center' });
    plain(ws.getCell(excelRow, 2), row.owner);
    dataCell(ws.getCell(excelRow, 3), row.amount || null, PUJA_CREAM);
  });

  const totalRow = 6 + snapshot.puja.length;
  total(ws.getCell(totalRow, 1), 'Grand Total (Cash)', 'General');
  header(ws.getCell(totalRow, 2), '', PUJA_COL);
  ws.mergeCells(totalRow, 1, totalRow, 2);
  const totCell = ws.getCell(totalRow, 3);
  totCell.value = snapshot.pujaTotal;
  totCell.font = font({ bold: true, color: { argb: WHITE } });
  totCell.fill = fill(PUJA_COL);
  totCell.border = box;
  totCell.numFmt = INR;
  totCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 16;
}

function buildFormattedLog(
  workbook: ExcelJS.Workbook,
  snapshot: LedgerSnapshot,
  kind: 'income' | 'expense',
) {
  const isIncome = kind === 'income';
  const ws = workbook.addWorksheet(isIncome ? 'Income' : 'Expenses');
  const accent = isIncome ? INC_GREEN : EXP_RED;
  const summaryFill = isIncome ? INC_SUMM : EXP_SUMM;
  const entries = snapshot.entries.filter((entry) => entry.kind === kind);
  const totals = categoryTotals(snapshot, kind);
  const grand = totals.reduce((sum, item) => sum + item.total, 0);

  ws.mergeCells('A1:I1');
  title(
    ws.getCell('A1'),
    `${ASSOCIATION} — ${isIncome ? 'Income' : 'Expense'} Tracker`,
    accent,
    12,
  );
  ws.getRow(1).height = 20;
  ws.mergeCells('A2:I2');
  ws.getCell('A2').value = isIncome
    ? 'Every receipt with date, type and amount. Category totals on the right feed this year’s account.'
    : 'Every expense with date, type and amount. Category totals on the right feed this year’s account.';
  ws.getCell('A2').font = font({ size: 9, italic: true, color: { argb: SUBTEXT } });
  ws.getCell('A2').alignment = { horizontal: 'center', wrapText: true };
  ws.getRow(2).height = 24;

  ['Date', isIncome ? 'Income Type' : 'Expense Type', 'Description', 'Mode', 'Amount (Rs.)'].forEach(
    (label, index) => {
      header(ws.getCell(4, index + 1), label, accent);
    },
  );
  header(ws.getCell('G4'), 'Category Summary (auto)', accent);
  header(ws.getCell('H4'), '', accent);
  ws.mergeCells('G4:H4');
  header(ws.getCell('I4'), isIncome ? 'Total Received (Rs.)' : 'Total Spent (Rs.)', accent);

  const logRows = Math.max(entries.length, 8);
  for (let i = 0; i < logRows; i += 1) {
    const excelRow = 5 + i;
    const entry = entries[i];
    const dateCell = ws.getCell(excelRow, 1);
    dateCell.value = entry?.date ?? null;
    dateCell.numFmt = 'DD-MMM-YYYY';
    dateCell.font = font({ color: { argb: BLUE_TEXT } });
    dateCell.fill = fill(CREAM);
    dateCell.border = box;
    for (const col of [2, 3, 4]) {
      const cell = ws.getCell(excelRow, col);
      cell.value = col === 2 ? entry?.category ?? '' : col === 3 ? entry?.description ?? '' : entry?.mode ?? '';
      cell.font = font({ color: { argb: BLUE_TEXT } });
      cell.fill = fill(CREAM);
      cell.border = box;
    }
    dataCell(ws.getCell(excelRow, 5), entry ? entry.amount : null);
  }

  totals.forEach((category, index) => {
    const excelRow = 5 + index;
    const label = ws.getCell(excelRow, 7);
    label.value = category.name || null;
    label.font = font({ size: 10, bold: Boolean(category.name), color: { argb: accent } });
    label.fill = fill(summaryFill);
    label.border = box;
    ws.getCell(excelRow, 8).fill = fill(summaryFill);
    ws.getCell(excelRow, 8).border = box;
    ws.mergeCells(excelRow, 7, excelRow, 8);
    const amount = ws.getCell(excelRow, 9);
    amount.value = category.name ? category.total : null;
    amount.font = font({ bold: true, color: { argb: DARK_BLUE } });
    amount.fill = fill(TOTAL_FILL);
    amount.border = box;
    amount.numFmt = INR;
    amount.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  const grandRow = 5 + totals.length;
  header(ws.getCell(grandRow, 7), isIncome ? 'TOTAL INCOME' : 'TOTAL EXPENSES', accent, 10, 'right');
  header(ws.getCell(grandRow, 8), '', accent);
  ws.mergeCells(grandRow, 7, grandRow, 8);
  total(ws.getCell(grandRow, 9), grand);
  ws.getCell(grandRow, 9).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.getColumn(1).width = 13;
  ws.getColumn(2).width = isIncome ? 30 : 36;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 3;
  ws.getColumn(7).width = isIncome ? 30 : 36;
  ws.getColumn(8).width = 2;
  ws.getColumn(9).width = 18;
  ws.views = [{ state: 'frozen', ySplit: 4 }];
}

function buildFormattedThisYear(workbook: ExcelJS.Workbook, snapshot: LedgerSnapshot) {
  const ws = workbook.addWorksheet('This Year 2026-27');
  const report = buildReceiptsPayments(snapshot);
  ws.mergeCells('A1:D1');
  title(ws.getCell('A1'), ASSOCIATION);
  ws.getRow(1).height = 22;
  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = ADDRESS;
  ws.getCell('A2').font = font({ size: 10, color: { argb: SUBTEXT } });
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.mergeCells('A3:D3');
  ws.getCell('A3').value = 'Receipts & Payments Account — Financial Year 2026-2027 (September 2026 to August 2027)';
  ws.getCell('A3').font = font({ bold: true, color: { argb: DARK_BLUE } });
  ws.getCell('A3').alignment = { horizontal: 'center' };
  ws.mergeCells('A4:D4');
  ws.getCell('A4').value = 'Current-year statement. Totals update as new data is added. Same form as the handover.';
  ws.getCell('A4').font = font({ size: 9, italic: true, color: { argb: RED_TEXT } });
  ws.getCell('A4').alignment = { horizontal: 'center' };

  ['RECEIPTS', 'Amount (Rs.)', 'PAYMENTS', 'Amount (Rs.)'].forEach((label, index) => {
    header(ws.getCell(6, index + 1), label, DARK_BLUE, 11);
  });

  report.lines.forEach((line, offset) => {
    const row = 7 + offset;
    const editable = Boolean(line.paymentEditable);
    if (line.receiptSection && line.receiptLabel) {
      section(ws.getCell(row, 1), line.receiptLabel);
      ws.getCell(row, 2).fill = fill(SECTION);
      ws.getCell(row, 2).border = box;
    } else if (line.receiptLabel) {
      plain(ws.getCell(row, 1), line.receiptLabel, { color: DARK_BLUE });
      if (line.receiptAmount === null) {
        ws.getCell(row, 2).border = box;
      } else {
        const amount = ws.getCell(row, 2);
        amount.value = line.receiptAmount;
        amount.font = font({ bold: true, color: { argb: DARK_BLUE } });
        amount.fill = fill(TOTAL_FILL);
        amount.border = box;
        amount.numFmt = INR;
        amount.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    } else {
      ws.getCell(row, 1).border = box;
      ws.getCell(row, 2).border = box;
    }

    if (line.paymentSection && line.paymentLabel) {
      section(ws.getCell(row, 3), line.paymentLabel);
      ws.getCell(row, 4).fill = fill(SECTION);
      ws.getCell(row, 4).border = box;
    } else if (line.paymentLabel) {
      plain(ws.getCell(row, 3), line.paymentLabel);
      if (line.paymentAmount === null) {
        ws.getCell(row, 4).border = box;
      } else if (editable) {
        dataCell(ws.getCell(row, 4), line.paymentAmount);
        ws.getCell(row, 4).alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        const amount = ws.getCell(row, 4);
        amount.value = line.paymentAmount;
        amount.font = font();
        amount.fill = fill(TOTAL_FILL);
        amount.border = box;
        amount.numFmt = INR;
        amount.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    } else {
      ws.getCell(row, 3).border = box;
      ws.getCell(row, 4).border = box;
    }
  });

  const totalRow = 7 + report.lines.length;
  total(ws.getCell(totalRow, 1), 'TOTAL', 'General');
  total(ws.getCell(totalRow, 2), report.receiptTotal);
  total(ws.getCell(totalRow, 3), 'TOTAL', 'General');
  total(ws.getCell(totalRow, 4), report.paymentTotal);
  ws.getCell(totalRow, 2).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(totalRow, 4).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(totalRow).height = 20;

  const closeRow = totalRow + 2;
  ws.getCell(closeRow, 1).value = 'Closing Bank Balance to FY 2027-28:';
  ws.getCell(closeRow, 1).font = font({ bold: true, color: { argb: DARK_BLUE } });
  ws.getCell(closeRow, 2).value = snapshot.cashInBank;
  ws.getCell(closeRow, 2).font = font({ bold: true, color: { argb: DARK_BLUE } });
  ws.getCell(closeRow, 2).numFmt = INR;
  ws.getCell(closeRow + 1, 1).value = 'Closing Cash Balance to FY 2027-28:';
  ws.getCell(closeRow + 1, 1).font = font({ bold: true, color: { argb: DARK_BLUE } });
  ws.getCell(closeRow + 1, 2).value = snapshot.cashInHand;
  ws.getCell(closeRow + 1, 2).font = font({ bold: true, color: { argb: DARK_BLUE } });
  ws.getCell(closeRow + 1, 2).numFmt = INR;

  const signRow = closeRow + 3;
  ws.getCell(signRow, 1).value = 'Signed by: Signature of President';
  ws.getCell(signRow, 1).font = font({ size: 9, color: { argb: SUBTEXT } });
  ws.getCell(signRow, 3).value = 'Signed by: Signature of Secretary & Treasurer';
  ws.getCell(signRow, 3).font = font({ size: 9, color: { argb: SUBTEXT } });

  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 44;
  ws.getColumn(4).width = 16;
}

export function exportFilename(kind: ExportKind) {
  return kind === 'raw' ? 'Debaloy_2026-27-raw.xlsx' : 'Debaloy_2026-27.xlsx';
}

export async function buildWorkbookBuffer(kind: ExportKind = 'formatted'): Promise<Uint8Array> {
  const snapshot = await loadLedger();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = ASSOCIATION;
  workbook.created = new Date();
  if (kind === 'raw') {
    buildRawWorkbook(workbook, snapshot);
  } else {
    buildFormattedHandover(workbook);
    buildFormattedMaintenance(workbook, snapshot);
    buildFormattedPuja(workbook, snapshot);
    buildFormattedLog(workbook, snapshot, 'income');
    buildFormattedLog(workbook, snapshot, 'expense');
    buildFormattedThisYear(workbook, snapshot);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
