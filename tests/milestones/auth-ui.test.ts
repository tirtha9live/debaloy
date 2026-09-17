import { describe, expect, it } from 'vitest';
import { FLATS } from '../../src/lib/constants';
import { readSrc } from '../helpers/repo';

describe('login and resident UI milestones', () => {
  it('flats use resident field in constants', () => {
    for (const flat of FLATS) {
      expect(flat).toHaveProperty('resident');
      expect(flat).not.toHaveProperty('owner');
    }
  });

  it('login page has password show/hide control', () => {
    const index = readSrc('pages/index.astro');
    expect(index).toContain('id="password-toggle"');
    expect(index).toContain('password-toggle');
    expect(index).toMatch(/type="password"/);
  });

  it('ledger home shows current cash balances not statement totals', () => {
    const home = readSrc('pages/ledger/index.astro');
    expect(home).toMatch(/Cash in hand/);
    expect(home).toMatch(/Cash in bank/);
    expect(home).toMatch(/Current cash at hand/);
    expect(home).not.toMatch(/Including opening balances/);
    expect(home).not.toMatch(/Including closing cash/);
  });

  it('maintenance sheet labels Resident', () => {
    const page = readSrc('pages/ledger/maintenance.astro');
    expect(page).toMatch(/sheet-sticky-resident/);
    expect(page).toMatch(/>Resident</);
    expect(page).not.toMatch(/>Owner</);
  });
});
