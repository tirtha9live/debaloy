import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT, walkJsFiles } from '../helpers/repo';

const FORBIDDEN_IN_CLIENT = [
  'recordLedgerAudit',
  'applyAuditFromForm',
  'cloudflare:workers',
  'trimEngagementSessions',
];

describe('production build guard', () => {
  it('astro build completes', () => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  }, 120_000);

  it('client JS bundles do not embed server-only audit/activity code', () => {
    const dist = ROOT + '/dist';
    const jsFiles = walkJsFiles(dist);
    expect(jsFiles.length).toBeGreaterThan(0);

    const ledgerActionBundles = jsFiles.filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return text.includes('save-confirm') || text.includes('data-ledger-form');
    });
    expect(ledgerActionBundles.length).toBeGreaterThan(0);

    for (const file of ledgerActionBundles) {
      const text = fs.readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_IN_CLIENT) {
        expect(text, `${file} must not contain ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
