import { describe, expect, it } from 'vitest';
import { ENGAGEMENT_SESSION_KEEP, LEDGER_AUDIT_KEEP, SESSION_TTL_SECONDS } from '../../src/lib/constants';
import { entryCreateAudit, withdrawalCreateAudit, yearActionAudit } from '../../src/lib/audit-server';
import { readRepo, readSrc } from '../helpers/repo';

describe('engagement, sessions, retention', () => {
  it('session TTL is 24 hours', () => {
    expect(SESSION_TTL_SECONDS).toBe(60 * 60 * 24);
  });

  it('retention constants match product rules', () => {
    expect(ENGAGEMENT_SESSION_KEEP).toBe(100);
    expect(LEDGER_AUDIT_KEEP).toBe(500);
  });

  it('activity trims old sessions and audit rows', () => {
    const activity = readSrc('lib/activity.ts');
    expect(activity).toContain('trimEngagementSessions');
    expect(activity).toContain('trimLedgerAudit');
    expect(activity).toMatch(/touchVisitor[\s\S]*await swallow\(trimEngagementSessions\(\)\)/);
    expect(activity).toMatch(/recordLedgerAudit[\s\S]*await swallow\(trimLedgerAudit\(\)\)/);
    expect(activity).toMatch(/ORDER BY last_seen DESC LIMIT \?/);
    expect(activity).toMatch(/ORDER BY at DESC, id DESC LIMIT \?/);
  });

  it('listLedgerAudit default cap matches retention', () => {
    const activity = readSrc('lib/activity.ts');
    expect(activity).toMatch(/listLedgerAudit\(limit = LEDGER_AUDIT_KEEP\)/);
  });

  it('middleware records engagement on ledger GETs', () => {
    const mw = readSrc('middleware.ts');
    expect(mw).toContain('touchVisitor');
    expect(mw).toContain('recordPageView');
  });

  it('pure audit summaries format create actions', () => {
    const withdrawal = withdrawalCreateAudit({
      date: '2026-09-01',
      amount: 500,
      note: 'ATM',
    });
    expect(withdrawal[0]?.from).toBe('—');
    expect(withdrawal[0]?.to).toContain('500');

    const entry = entryCreateAudit({
      kind: 'expense',
      date: '2026-09-01',
      category: 'Repairs',
      description: '',
      mode: 'Cash',
      amount: 100,
    });
    expect(entry[0]?.to).toContain('100');

    const year = yearActionAudit('close', '2027-08-31');
    expect(year[0]?.label).toMatch(/Close books/);
  });

  it('resident column migration exists', () => {
    expect(readRepo('migrations/0007_flats_resident_column.sql')).toMatch(/resident/i);
  });
});
