import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { cpSync, rmSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, sep } from 'path';
import { tmpdir } from 'os';

const REAL_ROOT = join(import.meta.dirname, '..', '..');
const INJECT = join(REAL_ROOT, 'tools', 'cnxml-inject.js');

// A pristine, media-free copy of the real book, made once (fast: text-only).
// Excludes 03-translated: it's a *generated, write-only* output directory for
// this tool (never read — see cnxml-inject.js's use of BOOKS_DIR/03-translated),
// but the real working tree has it populated from prior real publishes. Without
// this exclusion, existsSync(OUT(...)) checks below would observe stale
// pre-existing output rather than what this test run's `inject` actually wrote.
let BASE;
beforeAll(() => {
  BASE = mkdtempSync(join(tmpdir(), 'efni-a2-base-'));
  cpSync(join(REAL_ROOT, 'books', 'efnafraedi-2e'), join(BASE, 'efnafraedi-2e'), {
    recursive: true,
    filter: (src) =>
      !src.includes(`${sep}media`) &&
      !src.includes('.backup') &&
      !src.includes(`${sep}03-translated`),
  });
}, 60_000);
afterAll(() => {
  if (BASE) rmSync(BASE, { recursive: true, force: true });
});

// Each test mutates its own throwaway working copy.
let WORK, BOOKS;
beforeEach(() => {
  WORK = mkdtempSync(join(tmpdir(), 'efni-a2-work-'));
  BOOKS = join(WORK, 'books', 'efnafraedi-2e');
  cpSync(join(BASE, 'efnafraedi-2e'), BOOKS, { recursive: true });
});
afterEach(() => {
  if (WORK) rmSync(WORK, { recursive: true, force: true });
});

function runInject(extraArgs) {
  return spawnSync('node', [INJECT, '--book', 'efnafraedi-2e', ...extraArgs], {
    cwd: WORK,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

const CH01 = (stage, file) => join(BOOKS, stage, 'ch01', file);
const OUT = (mod) => join(BOOKS, '03-translated', 'mt-preview', 'ch01', `${mod}.cnxml`);

describe('A2-a: module-scoped EN fallback', () => {
  it('refuses a missing translation that is NOT allowlisted (no EN publish)', () => {
    rmSync(CH01('02-mt-output', 'm68664-segments.is.md'));
    const r = runInject(['--chapter', '1']);
    expect(r.status).toBe(1);
    expect(existsSync(OUT('m68664'))).toBe(false); // never fell back to EN
  });

  it('allows EN fallback ONLY for an allowlisted module', () => {
    rmSync(CH01('02-mt-output', 'm68664-segments.is.md'));
    runInject(['--chapter', '1', '--module', 'm68664', '--allow-en-fallback', 'm68664']);
    expect(existsSync(OUT('m68664'))).toBe(true); // scoped fallback produced output
    const cnxml = readFileSync(OUT('m68664'), 'utf8');
    expect(cnxml).toContain('m68664');
  });

  it('keeps residue-checking a well-translated module during a fallback run', () => {
    // m68663 made 100% English (synthetic residue); m68664 missing → allowlisted fallback.
    writeFileSync(
      CH01('02-mt-output', 'm68663-segments.is.md'),
      readFileSync(CH01('02-for-mt', 'm68663-segments.en.md'), 'utf8')
    );
    rmSync(CH01('02-mt-output', 'm68664-segments.is.md'));
    runInject(['--chapter', '1', '--allow-en-fallback', 'm68664', '--allow-incomplete']);
    const report = JSON.parse(readFileSync(join(BOOKS, 'residue-report.mt-preview.json'), 'utf8'));
    // Under the OLD run-wide flag, a fallback run set checkResidue=false for ALL
    // modules, so m68663 would be absent. Per-module suppression keeps it checked.
    expect(report.modules.m68663).toBeDefined();
    expect(report.modules.m68663.exact.length).toBeGreaterThan(0);
  });
});
