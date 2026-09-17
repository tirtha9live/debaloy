import { describe, expect, it } from 'vitest';
import { importSourcesFromTs, readRepo, readSrc } from '../helpers/repo';

describe('save confirmation (client + layout)', () => {
  const ledgerActions = readSrc('scripts/ledger-actions.ts');
  const layout = readRepo('src/layouts/Layout.astro');

  it('ledger-actions only imports browser-safe modules', () => {
    const imports = importSourcesFromTs(ledgerActions);
    expect(imports.every((spec) => spec.startsWith('../lib/format'))).toBe(true);
    expect(imports.some((spec) => spec.includes('audit'))).toBe(false);
    expect(imports.some((spec) => spec.includes('activity'))).toBe(false);
  });

  it('does not rely on client-side audit hidden fields', () => {
    expect(ledgerActions).not.toMatch(/audit_log|audit_sheet|attachAuditLog|applyAuditFromForm/);
  });

  it('intercepts ledger forms until confirmed', () => {
    expect(ledgerActions).toContain("form[data-ledger-form]");
    expect(ledgerActions).toContain("dataset.confirmed = '1'");
    expect(ledgerActions).toContain('openConfirm');
    expect(ledgerActions).toContain('collectChanges');
    expect(ledgerActions).toContain('event.preventDefault()');
  });

  it('layout provides the confirmation dialog hooks', () => {
    for (const id of [
      'save-confirm',
      'save-confirm-title',
      'save-confirm-copy',
      'save-confirm-list',
      'save-confirm-cancel',
      'save-confirm-ok',
    ]) {
      expect(layout).toContain(`id="${id}"`);
    }
    expect(layout).toContain('data-save-confirm-dismiss');
  });

  it('ledger write forms are marked for confirmation', () => {
    const forms = [
      'pages/ledger/maintenance.astro',
      'pages/ledger/puja.astro',
      'pages/ledger/receipts.astro',
      'pages/ledger/withdrawals.astro',
      'pages/ledger/years.astro',
      'components/EntriesSheet.astro',
    ];
    for (const file of forms) {
      expect(readSrc(file), file).toMatch(/data-ledger-form/);
    }
  });

  it('ledger pages load ledger-actions script', () => {
    const pages = [
      'pages/ledger/maintenance.astro',
      'pages/ledger/withdrawals.astro',
      'pages/ledger/receipts.astro',
    ];
    for (const file of pages) {
      expect(readSrc(file), file).toContain('ledger-actions.ts');
    }
  });
});
