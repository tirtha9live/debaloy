import { describe, expect, it } from 'vitest';
import { PAYMENT_TYPES } from '../../src/lib/online-payments';
import { formatMobileFull, formatMobileLast4, isValidMobile, normalizeMobile } from '../../src/lib/mobiles';
import { readRepo, readSrc } from '../helpers/repo';
import { DISABLED_SHEET_SLUGS, SHEETS, VISIBLE_SHEETS, isDisabledLedgerPath } from '../../src/lib/constants';

describe('e-receipts and online payments', () => {
  it('adds E-Receipts and Online payments sheets after Maintenance', () => {
    const slugs = SHEETS.map((sheet) => sheet.slug);
    expect(slugs).toContain('e-receipts');
    expect(slugs).toContain('payments');
    expect(slugs.indexOf('e-receipts')).toBe(slugs.indexOf('maintenance') + 1);
    expect(slugs.indexOf('payments')).toBe(slugs.indexOf('e-receipts') + 1);
    expect([...DISABLED_SHEET_SLUGS]).toEqual(['e-receipts', 'payments']);
    expect(VISIBLE_SHEETS.map((sheet) => sheet.slug)).not.toContain('e-receipts');
    expect(VISIBLE_SHEETS.map((sheet) => sheet.slug)).not.toContain('payments');
    expect(isDisabledLedgerPath('/ledger/e-receipts')).toBe(true);
    expect(isDisabledLedgerPath('/api/ledger/payments')).toBe(true);
    expect(isDisabledLedgerPath('/ledger/maintenance')).toBe(false);
    expect(readSrc('middleware.ts')).toMatch(/isDisabledLedgerPath/);
    expect(readSrc('components/Navigation.astro')).toMatch(/VISIBLE_SHEETS/);
  });

  it('normalizes and masks Indian mobile numbers', () => {
    expect(normalizeMobile('+91-9876543210')).toBe('9876543210');
    expect(normalizeMobile('919876543210')).toBe('9876543210');
    expect(isValidMobile('9876543210')).toBe(true);
    expect(isValidMobile('1876543210')).toBe(false);
    expect(isValidMobile('98765')).toBe(false);
    expect(formatMobileLast4('9876543210')).toBe('•••• 3210');
    expect(formatMobileFull('9876543210')).toBe('+91-9876543210');
  });

  it('payment types are maintenance, dues, and others', () => {
    expect([...PAYMENT_TYPES]).toEqual(['maintenance', 'dues', 'others']);
  });

  it('migration creates mobiles, payments, and last-used accounts', () => {
    const sql = readRepo('migrations/0009_e_receipts_and_payments.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS e_receipt_mobiles/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS online_payments/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS flat_bank_accounts/);
  });

  it('resident e-receipts UI hides full numbers and shows last 4', () => {
    const page = readSrc('pages/ledger/e-receipts.astro');
    expect(page).toMatch(/\+91/);
    expect(page).toMatch(/formatMobileLast4/);
    expect(page).toMatch(/data-overwrite-title/);
    expect(page).toMatch(/maxlength="10"/);
    expect(page).not.toMatch(/cannot be changed/i);
    expect(page).toMatch(/changeMobileHref/);
    expect(page).toMatch(/#register-mobile/);
    expect(page).not.toMatch(/formatMobileFull/);
  });

  it('resident payments submit last 4 and treasurer approve has bank fields', () => {
    const page = readSrc('pages/ledger/payments.astro');
    expect(page).toMatch(/data-fill-mobile/);
    expect(page).toMatch(/link_account/);
    expect(page).toMatch(/Account holder/);
    expect(page).toMatch(/name="bank"/);
    expect(page).toMatch(/intent" value="approve"/);
    expect(page).toMatch(/Last used bank accounts/);
    expect(page).toMatch(/Change mobile number/);
    expect(page).toMatch(/\/ledger\/e-receipts/);
  });

  it('JSON backup includes the new tables', () => {
    const backup = readSrc('lib/backup.ts');
    expect(backup).toMatch(/BACKUP_VERSION = 4/);
    expect(backup).toMatch(/e_receipt_mobiles/);
    expect(backup).toMatch(/online_payments/);
    expect(backup).toMatch(/flat_bank_accounts/);
  });

  it('approval writes to maintenance or other collections', () => {
    const lib = readSrc('lib/online-payments.ts');
    expect(lib).toContain('saveMaintenance');
    expect(lib).toContain('Outstanding Dues');
    expect(lib).toContain('Other Income');
    expect(lib).toContain('rememberBankAccount');
  });
});
