import { describe, expect, it } from 'vitest';
import { isNprInput, maintenanceCellTip, NPR_LABEL } from '../../src/lib/format';
import { isMaintenancePaymentPending } from '../../src/lib/sheet';
import { readRepo, readSrc } from '../helpers/repo';

const months = ['Sep-26', 'Oct-26', 'Nov-26', 'Dec-26', 'Jan-27'];
const blank = { amount: null, npr: false };

describe('maintenance NPR and pending months', () => {
  it('recognises NPR in any case', () => {
    expect(NPR_LABEL).toBe('NPR');
    expect(isNprInput('NPR')).toBe(true);
    expect(isNprInput(' npr ')).toBe(true);
    expect(isNprInput('0')).toBe(false);
    expect(isNprInput('')).toBe(false);
  });

  it('marks blank and 0 as pending for the current and earlier months', () => {
    expect(isMaintenancePaymentPending('Sep-26', blank, months, 'Nov-26')).toBe(true);
    expect(isMaintenancePaymentPending('Oct-26', { amount: 0, npr: false }, months, 'Nov-26')).toBe(true);
    expect(isMaintenancePaymentPending('Nov-26', blank, months, 'Nov-26')).toBe(true);
  });

  it('does not mark future months, paid months, or NPR', () => {
    expect(isMaintenancePaymentPending('Dec-26', blank, months, 'Nov-26')).toBe(false);
    expect(isMaintenancePaymentPending('Sep-26', { amount: 500, npr: false }, months, 'Nov-26')).toBe(false);
    expect(isMaintenancePaymentPending('Sep-26', { amount: null, npr: true }, months, 'Nov-26')).toBe(false);
    expect(isMaintenancePaymentPending('Aug-26', blank, months, 'Nov-26')).toBe(false);
  });

  it('migration carries old 0 cells over to NPR', () => {
    const sql = readRepo('migrations/0010_maintenance_npr.sql');
    expect(sql).toMatch(/ADD COLUMN npr/);
    expect(sql).toMatch(/SET npr = 1, amount = NULL WHERE amount = 0/);
  });

  it('NPR and paid cells carry a note and received date shown as a tooltip', () => {
    expect(readRepo('migrations/0011_maintenance_npr_note.sql')).toMatch(/ADD COLUMN note/);
    expect(readRepo('migrations/0012_maintenance_paid_on.sql')).toMatch(/ADD COLUMN paid_on/);
    const page = readSrc('pages/ledger/maintenance.astro');
    expect(page).toMatch(/name=\{`note:\$\{row\.flatId\}:\$\{month\}`\}/);
    expect(page).toMatch(/name=\{`paid:\$\{row\.flatId\}:\$\{month\}`\}/);
    expect(page).toMatch(/data-cell-tip/);
    const api = readSrc('pages/api/ledger/maintenance.ts');
    expect(api).toMatch(/parseCellNote/);
    expect(api).toMatch(/parseIsoDate/);
    expect(readSrc('scripts/ledger-actions.ts')).toMatch(/bindCellTooltips/);
    expect(readSrc('lib/excel.ts')).toMatch(/maintenanceCellTip\(cell\)/);
  });

  it('builds the tooltip from received date and note', () => {
    expect(maintenanceCellTip({ npr: false, paidOn: '2026-11-12', note: null })).toMatch(/^Received 12 Nov 2026$/);
    expect(maintenanceCellTip({ npr: false, paidOn: '2026-11-12', note: 'Short by 200' })).toMatch(
      /^Received 12 Nov 2026 · Short by 200$/,
    );
    expect(maintenanceCellTip({ npr: true, paidOn: '2026-11-12', note: 'Paid in advance' })).toBe('Paid in advance');
    expect(maintenanceCellTip({ npr: false, paidOn: null, note: null })).toBe('');
  });

  it('sheet, save API, backup, and Excel understand NPR', () => {
    const page = readSrc('pages/ledger/maintenance.astro');
    expect(page).toMatch(/NPR_LABEL/);
    expect(page).toMatch(/data-npr-mode/);
    expect(page).not.toMatch(/0<\/span> means payment not required/);
    expect(page).toMatch(/paid \? formatAmount\(cell\.amount\) : ''/);
    expect(readSrc('pages/api/ledger/maintenance.ts')).toMatch(/isNprInput/);
    expect(readSrc('lib/backup.ts')).toMatch(/legacyZeroIsNpr/);
    expect(readSrc('lib/excel.ts')).toMatch(/NPR = no payment required/);
  });
});
