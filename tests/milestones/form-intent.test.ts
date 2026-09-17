import { describe, expect, it } from 'vitest';
import { readFormIntent } from '../../src/lib/form-intent';
import { readSrc } from '../helpers/repo';

describe('form intent (delete vs hidden update)', () => {
  it('prefers delete when hidden update and delete button both submit', () => {
    const form = new FormData();
    form.append('intent', 'update');
    form.append('intent', 'delete');
    form.append('id', '42');
    expect(readFormIntent(form, '')).toBe('delete');
  });

  it('ledger APIs use readFormIntent', () => {
    for (const file of [
      'pages/api/ledger/withdrawals.ts',
      'pages/api/ledger/entries.ts',
      'pages/api/ledger/settings.ts',
      'pages/api/ledger/years.ts',
    ]) {
      expect(readSrc(file), file).toContain('readFormIntent');
    }
  });

  it('row forms put update intent on Save button not hidden field', () => {
    expect(readSrc('pages/ledger/withdrawals.astro')).toMatch(/name="intent" value="update"/);
    expect(readSrc('pages/ledger/withdrawals.astro')).not.toMatch(
      /type="hidden" name="intent" value="update"/,
    );
    expect(readSrc('components/EntriesSheet.astro')).toMatch(/name="intent" value="update"/);
    expect(readSrc('components/EntriesSheet.astro')).not.toMatch(
      /type="hidden" name="intent" value="update"/,
    );
  });
});
