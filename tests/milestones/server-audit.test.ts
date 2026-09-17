import { describe, expect, it } from 'vitest';
import { everySaveFollowedByPublish, readRepo, readSrc } from '../helpers/repo';

describe('server-side ledger audit', () => {
  it('audit.ts is types-only (no D1 imports)', () => {
    const audit = readSrc('lib/audit.ts');
    expect(audit).not.toMatch(/from ['"].*activity|cloudflare:workers/);
    expect(audit).toContain('export type AuditChange');
  });

  it('repo has no client applyAuditFromForm path', () => {
    expect(readRepo('src/lib/audit.ts')).not.toContain('applyAuditFromForm');
  });

  const apiCases: Array<{ file: string; awaitCalls: string[]; publishSheet: string }> = [
    { file: 'pages/api/ledger/maintenance.ts', awaitCalls: ['saveMaintenance'], publishSheet: 'maintenance' },
    { file: 'pages/api/ledger/puja.ts', awaitCalls: ['savePuja'], publishSheet: 'puja' },
    {
      file: 'pages/api/ledger/entries.ts',
      awaitCalls: ['deleteEntry', 'updateEntry', 'createEntry'],
      publishSheet: 'entries',
    },
    {
      file: 'pages/api/ledger/withdrawals.ts',
      awaitCalls: ['deleteWithdrawal', 'updateWithdrawal', 'createWithdrawal'],
      publishSheet: 'withdrawals',
    },
    {
      file: 'pages/api/ledger/settings.ts',
      awaitCalls: ['clearClosingOverride', 'saveClosingBalances'],
      publishSheet: 'settings',
    },
    { file: 'pages/api/ledger/categories.ts', awaitCalls: ['createCategory'], publishSheet: 'categories' },
  ];

  for (const { file, awaitCalls, publishSheet } of apiCases) {
    it(`${file} publishes audit after DB write`, () => {
      const text = readSrc(file);
      expect(text).toContain('publishLedgerAudit');
      expect(text).toContain(`'${publishSheet}'`);
      expect(everySaveFollowedByPublish(text, awaitCalls)).toBe(true);
    });
  }

  it('years API publishes audit only after successful handler', () => {
    const text = readSrc('pages/api/ledger/years.ts');
    expect(text).toContain('publishLedgerAudit');
    expect(text).toContain('yearActionAudit');
    const catchIdx = text.indexOf('} catch');
    const publishIdx = text.lastIndexOf('publishLedgerAudit');
    expect(publishIdx).toBeGreaterThan(catchIdx);
  });

  it('activity page lists ledger audit for treasurers', () => {
    const page = readSrc('pages/ledger/activity.astro');
    expect(page).toContain('listLedgerAudit');
    expect(page).toMatch(/Ledger changes/);
  });

  it('migration defines ledger_audit table', () => {
    const sql = readRepo('migrations/0008_engagement_and_audit.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ledger_audit/);
  });
});
