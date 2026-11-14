import { describe, expect, it } from 'vitest';
import { ASSOCIATION_BANK } from '../../src/lib/constants';
import { readSrc } from '../helpers/repo';

describe('association bank account', () => {
  it('keeps the UCO Bank deposit details', () => {
    expect(ASSOCIATION_BANK).toMatchObject({
      bank: 'UCO Bank',
      accountNumber: '17880110045862',
      ifsc: 'UCBA0001788',
      micr: '700028116',
    });
  });

  it('shows them after login on the ledger home and the resident Maintenance sheet, not on the public landing page', () => {
    expect(readSrc('pages/ledger/index.astro')).toMatch(/<BankDetails \/>/);
    expect(readSrc('pages/ledger/maintenance.astro')).toMatch(/!showMode && \(/);
    expect(readSrc('pages/index.astro')).not.toMatch(/BankDetails|17880110045862/);
    const card = readSrc('components/BankDetails.astro');
    expect(card).toMatch(/data-copy=\{bank\.accountNumber\}/);
    expect(card).toContain('Association Bank account');
    expect(card).not.toMatch(/NEFT|let the treasurer know/);
  });
});
