/**
 * §C210: `cnxml-render.js --help` must print usage, and a run with no (or an
 * unknown) `--book` must say so, instead of dying with a raw stack trace.
 *
 * `main()` loaded the book's render config BEFORE it checked `--help` and
 * `--book`, so with no `--book` it reached `path.join(null)` inside
 * `book-rendering-config.js` and crashed with an unhandled TypeError. That hid
 * the usage text from exactly the reader who asked for it, and turned the
 * positional form `cnxml-render.js <book> <chapter>` into a stack trace.
 *
 * Every case is a spawned CLI that exits before any read or write of book
 * content, so it runs against the real repo safely. The controls pass a real
 * `--book`, which reached the help and chapter checks even before the fix: they
 * prove the harness sees those paths, so the failures are the ordering's doing.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { join } from 'path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const RENDER = join(REPO_ROOT, 'tools', 'cnxml-render.js');
const USAGE_HEADER = 'cnxml-render.js - Render CNXML to semantic HTML';

function runRender(args) {
  return spawnSync('node', [RENDER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

describe('§C210: cnxml-render prints usage instead of crashing', () => {
  for (const flag of ['--help', '-h']) {
    it(`${flag} with no --book prints usage and exits 0`, () => {
      const r = runRender([flag]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(USAGE_HEADER);
      expect(r.stderr).not.toContain('TypeError');
    });
  }

  it('no arguments at all says --book is required, without a stack trace', () => {
    const r = runRender([]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--book is required');
    expect(r.stderr).not.toContain('TypeError');
    expect(r.stderr).not.toMatch(/^\s+at /m); // no stack frames
  });

  it('the positional form (<book> <chapter>) says --book is required, without a stack trace', () => {
    const r = runRender(['efnafraedi-2e', '1']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--book is required');
    expect(r.stderr).not.toContain('TypeError');
    expect(r.stderr).not.toMatch(/^\s+at /m);
  });

  it('an unknown --book says so, without a stack trace', () => {
    const r = runRender(['--book', 'no-such-book-c210', '--chapter', '1']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown book "no-such-book-c210"');
    expect(r.stderr).not.toMatch(/^\s+at /m);
  });
});

describe('§C210 controls: paths that already worked with a real --book', () => {
  it('--help with a real --book prints usage and exits 0', () => {
    const r = runRender(['--book', 'efnafraedi-2e', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(USAGE_HEADER);
  });

  it('a real --book with no --chapter says --chapter is required', () => {
    const r = runRender(['--book', 'efnafraedi-2e']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--chapter is required');
  });
});
