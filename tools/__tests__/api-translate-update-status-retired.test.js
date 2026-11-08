/**
 * `--update-status` is RETIRED, and `api-translate.js` loads no `server/` code.
 *
 * The flag used to require AGPL `server/services/pipelineStatusService.js` from this MIT
 * tool to mark a chapter's `mtOutput` stage complete — the optional, try/catch-guarded edge
 * CLAUDE.md § E-2 said to sever. Its entry in root `LICENSE` class 1 is gone, and these tests
 * keep this file from bringing it, or any other `server/` load, back.
 *
 * ⚠️ The flag stays DECLARED in `parseCliArgs`: `parseArgs` drops an undeclared flag
 * silently, so an old command line would run at full strength with the flag ignored. The
 * refusal tests below are therefore also the "still declared" pin — an undeclared flag would
 * let the dry run exit 0 and print its plan, which test 1 rejects.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const API_TRANSLATE = path.join(REPO, 'tools', 'api-translate.js');

// Same helper as api-translate-rerequest.test.js: a bogus key, so nothing can be bought.
const cli = (...args) =>
  spawnSync(process.execPath, ['tools/api-translate.js', '--book', 'efnafraedi-2e', ...args], {
    cwd: REPO,
    env: { ...process.env, MALSTADUR_API_KEY: 'bogus-key-for-tests' },
    encoding: 'utf8',
  });

// A static `from '…'`, a `require('…')` or an `import('…')`: the specifier is the capture.
const LOAD = /\bfrom\s+(['"])([^'"]+)\1|\b(?:require|import)\s*\(\s*(['"`])([^'"`]+)\3\s*\)/g;
// A string literal reaching ../server/ (LICENSE search shape 1), wherever it sits — which also
// catches a load through an aliased require: `const req = createRequire(…); req('../server/…')`.
const PARENT_SERVER = /['"`](?:\.\.\/)+server\//;
// A path built toward server/: a separate 'server' argument (shape 2) or a literal beginning
// 'server' (shape 3's anchor form), handed to join/resolve/createRequire. The argument list may
// hold calls nested two deep, as in path.dirname(fileURLToPath(import.meta.url)).
const BUILT_TOWARD_SERVER =
  /\b(?:join|resolve|createRequire)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*['"`]server\b/;
const E2_EDGE =
  'a tools/ → server/ load is an E-2 edge; if it is deliberate, list it in root LICENSE and CLAUDE.md § E-2';

describe('--update-status refuses — api-translate no longer writes the status database', () => {
  it('1 · a dry run with --update-status is refused before any plan is printed', () => {
    const r = cli('--chapter', '1', '--dry-run', '--update-status');
    expect([
      r.status,
      r.stderr.includes('--update-status is retired'),
      r.stderr.includes('Nothing was sent.'),
      r.stdout.includes('Dry run —'),
    ]).toEqual([1, true, true, false]);
  });

  it('2 · control: the same dry run without the flag succeeds and prints its plan', () => {
    const r = cli('--chapter', '1', '--dry-run');
    expect([r.status, r.stdout.includes('Dry run —')]).toEqual([0, true]);
  });

  it('3 · a live run with a glossary arm is refused the same way', () => {
    // --chapter 99 has no modules: even unrefused, nothing could be sent.
    const r = cli('--chapter', '99', '--no-glossary', '--update-status');
    expect([r.status, r.stderr.includes('--update-status is retired')]).toEqual([1, true]);
  });

  it('4 · --help still lists the flag, marked retired', () => {
    const r = cli('--help');
    expect([r.status, /--update-status\s+Retired/.test(r.stdout)]).toEqual([0, true]);
  });
});

describe('api-translate.js loads no server/ code — its LICENSE class-1 edge stays severed', () => {
  const src = fs.readFileSync(API_TRANSLATE, 'utf8');
  const specifiers = [...src.matchAll(LOAD)].map((m) => m[2] ?? m[4]);

  it("5 · control: the specifier scan finds the file's own imports", () => {
    expect(specifiers).toEqual(
      expect.arrayContaining(['fs', './lib/malstadur-api.js', './lib/mt-lock.cjs'])
    );
  });

  it('6 · no load names server/', () => {
    expect(
      specifiers.filter((s) => s.includes('server')),
      E2_EDGE
    ).toEqual([]);
  });

  it('6b · no string literal reaches ../server/', () => {
    expect(src, E2_EDGE).not.toMatch(PARENT_SERVER);
  });

  it('6c · control: that pattern catches a load through an aliased require', () => {
    expect(
      PARENT_SERVER.test("const req = createRequire(import.meta.url); req('../server/x.js');")
    ).toBe(true);
  });

  it('7 · no path is built toward server/', () => {
    expect(src, E2_EDGE).not.toMatch(BUILT_TOWARD_SERVER);
  });

  it('7c · control: the path pattern does match a server/ path', () => {
    expect(BUILT_TOWARD_SERVER.test("path.join(REPO_ROOT, 'server', 'lib', 'x.js')")).toBe(true);
  });

  it('7n · control: the path pattern crosses nested calls (this file builds its root that way)', () => {
    expect(
      BUILT_TOWARD_SERVER.test(
        "path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'lib')"
      )
    ).toBe(true);
  });

  it('8 · updatePipelineStatus is gone', () => {
    expect(src).not.toContain('updatePipelineStatus');
  });

  it('9 · computeCompleteChapters is gone — it existed only to feed the status write', () => {
    expect(src).not.toContain('computeCompleteChapters');
  });
});
