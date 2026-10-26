/**
 * ai-review-config.test.js — the cap and the API-key source (Unit D,
 * docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md).
 *
 * The cap is an ENFORCEABLE VALUE ([USER] 2026-10-26, decision record
 * docs/decisions/2026-10-26-pre-s-week-ai-layer-answers.md): this test is its pin.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  CAP_USD,
  REPO_ROOT,
  resolveApiKey,
  defaultRecordsDir,
  assertBookSlug,
} from '../ai-review/config.js';

const tmpDirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-config-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('CAP_USD', () => {
  it('is USD 100, as [USER] ruled on 2026-10-26', () => {
    expect(CAP_USD).toBe(100);
  });
});

describe('REPO_ROOT', () => {
  it('is resolved from the module file, not from process.cwd()', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'tools', 'ai-review', 'config.js'))).toBe(true);
  });
});

describe('defaultRecordsDir', () => {
  it('is books/<slug>/ai-review under the repo root', () => {
    expect(defaultRecordsDir('efnafraedi-2e')).toBe(
      path.join(REPO_ROOT, 'books', 'efnafraedi-2e', 'ai-review')
    );
  });

  it('refuses a slug that is not a plain book slug (control: a real slug passes)', () => {
    expect(() => assertBookSlug('efnafraedi-2e')).not.toThrow();
    expect(() => defaultRecordsDir('../efnafraedi-2e')).toThrow(/slug/);
    expect(() => defaultRecordsDir('')).toThrow(/slug/);
  });

  it('refuses organic chemistry, which OpenStax has not authorised for translation', () => {
    expect(() => defaultRecordsDir('lifraen-efnafraedi')).toThrow(/not translated/);
  });
});

describe('resolveApiKey', () => {
  it('prefers ANTHROPIC_API_KEY from the environment', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, 'ANTHROPIC_API_KEY=from-file\n');
    expect(resolveApiKey({ env: { ANTHROPIC_API_KEY: 'from-env' }, envFile })).toBe('from-env');
  });

  it('falls back to the .env file when the environment has no key', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, '# comment\nOTHER=1\nANTHROPIC_API_KEY="from-file"\n');
    expect(resolveApiKey({ env: {}, envFile })).toBe('from-file');
  });

  it('treats an empty environment value as absent', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, 'ANTHROPIC_API_KEY=from-file\n');
    expect(resolveApiKey({ env: { ANTHROPIC_API_KEY: '  ' }, envFile })).toBe('from-file');
  });

  it('refuses loudly with neither, naming both sources and no key', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env'); // does not exist
    let message = '';
    try {
      resolveApiKey({ env: {}, envFile });
    } catch (e) {
      message = e.message;
    }
    expect(message).toMatch(/ANTHROPIC_API_KEY/);
    expect(message).toMatch(/\.env/);
  });

  it('refuses when the .env exists but carries no Anthropic key', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, 'MALSTADUR_API_KEY=something-else\n');
    expect(() => resolveApiKey({ env: {}, envFile })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
