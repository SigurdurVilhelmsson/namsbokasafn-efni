import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'check-held-glossary.sh');
const require = createRequire(import.meta.url);
const { termsSha256 } = require('../../tools/lib/glossary-terms-hash.cjs');

function run(args, env) {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function envWithout(...names) {
  const env = { ...process.env };
  for (const n of names) delete env[n];
  return env;
}

describe('check-held-glossary.sh', () => {
  it('exits 2 and names PROD_SSH when it is unset', () => {
    const r = run(['chemistry'], envWithout('PROD_SSH'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('PROD_SSH');
  });

  it('exits 2 on a slug that is not [a-z0-9-]+', () => {
    const r = run(['../x'], { ...process.env, PROD_SSH: 'nobody@example.invalid' });
    expect(r.status).toBe(2);
  });

  it("--hash-only prints the exporter's terms hash", () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const payload = { terms: [{ english: 'atom', icelandic: 'frumeind' }], generated: 'x' };
      const file = path.join(dir, 'p.json');
      writeFileSync(file, JSON.stringify(payload));
      const r = run(['--hash-only', file], envWithout('PROD_SSH'));
      expect(r.stdout.trim()).toBe(termsSha256(payload));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 with "nothing held" when production\'s status does not hold the book', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const fake = path.join(dir, 'ssh');
      const status = JSON.stringify({ books: { chemistry: { outcome: 'unchanged' } } });
      writeFileSync(fake, `#!/bin/sh\nprintf '%s' '${status}'\n`);
      chmodSync(fake, 0o755);
      const r = run(['chemistry'], {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PROD_SSH: 'fake-host',
      });
      expect(r.status).toBe(2);
      expect(r.stderr + r.stdout).toContain('nothing held');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
