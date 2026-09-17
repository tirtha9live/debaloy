import { describe, expect, it } from 'vitest';
import { parseDebugFlag } from '../../src/lib/debug';
import { readRepo, readSrc } from '../helpers/repo';

describe('DEBUG maintenance mode', () => {
  it('parseDebugFlag accepts common true values', () => {
    expect(parseDebugFlag('true')).toBe(true);
    expect(parseDebugFlag('TRUE')).toBe(true);
    expect(parseDebugFlag('1')).toBe(true);
    expect(parseDebugFlag('yes')).toBe(true);
    expect(parseDebugFlag('false')).toBe(false);
    expect(parseDebugFlag('')).toBe(false);
    expect(parseDebugFlag(undefined)).toBe(false);
  });

  it('wrangler.toml declares DEBUG var default false', () => {
    const toml = readRepo('wrangler.toml');
    expect(toml).toMatch(/\[vars\]/);
    expect(toml).toMatch(/DEBUG\s*=\s*"false"/);
  });

  it('middleware sets maintenanceMode from debug helper', () => {
    const mw = readSrc('middleware.ts');
    expect(mw).toContain('isMaintenanceMode');
    expect(mw).toContain('maintenanceMode');
  });

  it('layout and landing show maintenance UI when enabled', () => {
    expect(readRepo('src/layouts/Layout.astro')).toContain('MaintenanceBanner');
    expect(readSrc('pages/index.astro')).toMatch(/maintenanceMode/);
    expect(readSrc('components/MaintenanceBanner.astro')).toMatch(/maintenance mode/i);
  });
});
