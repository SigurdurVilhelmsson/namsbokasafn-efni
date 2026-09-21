/**
 * The per-chapter autorun driver is BOOK-AGNOSTIC, and its book argument is required.
 *
 * WHY THIS EXISTS. `scripts/chemistry-autorun-chapter.sh` hardcoded `efnafraedi-2e`
 * 23 times and took no book argument, so it could not be pointed at organic
 * (`lifraen-efnafraedi`) — the next book in the campaign. The handoff's ruling was
 * "parameterise the book, and keep ONE driver": its value is the 38 audited defects
 * baked into v3, and a fork inherits the bugs while losing every later fix.
 *
 * 🔴 THE BOOK ARGUMENT HAS NO DEFAULT, DELIBERATELY. The driver SPENDS MONEY at step 3.
 * A default would let the old two-argument invocation buy the wrong book's chapter with
 * every downstream tool agreeing, because they all default to the same slug. Required
 * plus validated-against-the-tree means the old form dies before step 1.
 *
 * 🔴 AND THE KNOWN-INJECT-FAILURE SET IS PER BOOK. Chemistry's four ⑰ modules
 * (m68700/m68733/m68747/m68844) are chemistry module ids. Carrying them to another book
 * would mean a real inject refusal there was silently answered with --no-annotate-en.
 * Every other book starts with an empty set, so any FAILED module halts — conservative,
 * and the only honest starting state.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔴 EVERY BEHAVIOURAL TEST RUNS A COPY OF THE DRIVER IN A TEMP DIR. THIS IS NOT
 * TIDINESS — IT IS THE FIX FOR A MEASURED INCIDENT, 2026-09-21.
 *
 * An earlier version of this file ran the real driver at the repo root with
 * `('17', 'cell, battery')` to prove the OLD two-argument form is refused. That is
 * safe against the CURRENT driver (`17` is rejected as a book slug). It is NOT safe
 * against the ORIGINAL one — where `17` is a valid CHAPTER — and mutation-testing this
 * file necessarily restores exactly that original. The run re-extracted chemistry ch17
 * and reached step 3, buying TWO modules against the test's fake 2-term subset before
 * the 30 s timeout killed it. The committed 18-term output had to be restored from git.
 *
 * ▶ THE LESSON IS GENERAL AND IT IS ABOUT THE HARNESS, NOT THE ASSERTION: a mutation
 * test runs code that NO LONGER EXISTS, so test arguments must be refused by every
 * version the file could be reverted to — and for a script that spends money, the only
 * way to guarantee that is to deny it the tree it needs. The driver does
 * `cd "$(dirname "$0")/.."`, so a copy at <tmp>/scripts/ has no `tools/` and no
 * `books/`: every version fails at argument parsing or at step 1, and none can reach
 * an API call.
 * ⚠️ A TIMEOUT IN A TEST IS NOT A SLOW TEST. It is a test that did something.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ THE COMMENT-STRIPPING BELOW IS ALSO LOAD-BEARING. CLAUDE.md records that a pin
 * forbidding a token trips on the comment that documents the token. The driver explains
 * the `case`-with-a-variable trap in prose, so the assertions read CODE ONLY.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DRIVER = path.join(REPO_ROOT, 'scripts', 'chemistry-autorun-chapter.sh');

const raw = fs.readFileSync(DRIVER, 'utf8');
/** Code only: drop whole-line comments. */
const code = raw
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');

/**
 * A throwaway tree holding ONLY <sandbox>/scripts/<driver> and the book-config
 * fixtures a test needs. No `tools/`, so no version of the driver can reach a
 * paid API call from here even if it parses its arguments happily.
 */
let sandbox;
beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'autorun-driver-'));
  fs.mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });
  fs.copyFileSync(DRIVER, path.join(sandbox, 'scripts', 'driver.sh'));
  // The ONE book the sandbox knows about, for the book-check positive control.
  fs.mkdirSync(path.join(sandbox, 'books', 'lifraen-efnafraedi'), { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'books', 'lifraen-efnafraedi', 'book-config.json'), '{}');
});
afterAll(() => {
  if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
});

function run(...args) {
  const r = spawnSync('bash', [path.join(sandbox, 'scripts', 'driver.sh'), ...args], {
    cwd: sandbox,
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, MALSTADUR_API_KEY: '' },
  });
  return { ...r, all: `${r.stdout || ''}${r.stderr || ''}` };
}

describe('autorun driver: book parameterisation', () => {
  it('reads a non-empty driver (guard against a vacuous pass)', () => {
    // Without this, a renamed or emptied script makes every `not.toMatch` below
    // pass by asserting nothing — the repo's oldest failure class.
    expect(raw.length).toBeGreaterThan(5000);
    expect(code).toMatch(/cnxml-inject\.js/);
    expect(code).toMatch(/api-translate\.js/);
  });

  it('is syntactically valid bash', () => {
    const r = spawnSync('bash', ['-n', DRIVER], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('passes no hardcoded book slug to any tool invocation', () => {
    // The ONE permitted occurrence is the per-book known-set lookup, which is a
    // book-keyed branch rather than a book-bound invocation.
    const offenders = code
      .split('\n')
      .filter((l) => /efnafraedi-2e/.test(l))
      .filter((l) => !/KNOWN_INJECT_FAILURES=/.test(l));
    expect(offenders).toEqual([]);
  });

  it('builds every books/ path and every --book flag from $BOOK', () => {
    expect(code).not.toMatch(/books\/efnafraedi-2e/);
    expect(code).not.toMatch(/--book\s+efnafraedi-2e/);
    // And it really does use the variable — an absence is not an answer.
    expect(code.match(/\$BOOK|\$\{BOOK/g).length).toBeGreaterThanOrEqual(15);
  });

  it('still knows chemistry’s four ⑰ modules (regression: do not lose them)', () => {
    for (const m of ['m68700', 'm68733', 'm68747', 'm68844']) {
      expect(code).toMatch(new RegExp(m));
    }
  });

  it('gives a non-chemistry book an EMPTY known set, so any refusal halts', () => {
    expect(code).toMatch(/KNOWN_INJECT_FAILURES='__none__'/);
  });

  it('tests the known-set with grep -E, never with a case pattern from a variable', () => {
    // MEASURED 2026-09-21: `case "$M" in $P)` with P='a|b' matches NEITHER, because
    // alternation is parsed before expansion. The helper exists for that reason.
    expect(code).toMatch(/is_known_inject_failure\(\)/);
    expect(code).toMatch(/grep -qE "\^\(\$KNOWN_INJECT_FAILURES\)\$"/);
    expect(code).not.toMatch(/case\s+"\$M"\s+in\s+\$/);
  });
});

describe('autorun driver: the book argument is required and validated', () => {
  it('the sandbox really is inert (control for every test below)', () => {
    // If this fixture were wrong — a stray tools/ dir, say — the refusals below
    // could be coming from somewhere other than the argument checks.
    expect(fs.existsSync(path.join(sandbox, 'tools'))).toBe(false);
    expect(
      fs.existsSync(path.join(sandbox, 'books', 'lifraen-efnafraedi', 'book-config.json'))
    ).toBe(true);
    expect(fs.existsSync(path.join(sandbox, 'books', 'efnafraedi-2e'))).toBe(false);
  });

  it('refuses with no arguments', () => {
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.all).toMatch(/usage/i);
  });

  it('refuses a two-argument invocation: the book argument has no default', () => {
    // The v3 signature was `<chapter> "<subset>"`. Under v4 the third argument is
    // required, so the old form cannot silently become a run against a default book.
    const r = run('17', 'cell, battery');
    expect(r.status).not.toBe(0);
    expect(r.all).toMatch(/usage/i);
    expect(r.all).not.toMatch(/re-extract/);
  });

  it('refuses an unknown book slug by exit code 3, naming the missing config', () => {
    const r = run('no-such-book', '1', 'x');
    expect(r.status).toBe(3);
    expect(r.all).toMatch(/no such book/);
    expect(r.all).toMatch(/book-config\.json/);
  });

  it('accepts a known book slug and fails on the CHAPTER instead', () => {
    // The positive control for the test above: proves the book check is what
    // rejected `no-such-book`, not something earlier that rejects everything.
    const r = run('lifraen-efnafraedi', 'zz', 'x');
    expect(r.status).toBe(3);
    expect(r.all).toMatch(/chapter 'zz'/);
    expect(r.all).not.toMatch(/no such book/);
  });

  it('reaches neither the extract nor the buy on any rejected invocation', () => {
    const cases = [
      [],
      ['17', 'cell, battery'],
      ['no-such-book', '1', 'x'],
      ['lifraen-efnafraedi', 'zz', 'x'],
    ];
    for (const args of cases) {
      const r = run(...args);
      expect(r.all).not.toMatch(/--- 1 re-extract/);
      expect(r.all).not.toMatch(/--- 3 buy text/);
      // A timeout is not a slow test — it is a test that did something.
      expect(r.signal).toBeNull();
    }
  });
});
