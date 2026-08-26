/**
 * audit-render-output-defects.test.js — §C82 Plan B Task 11, R4's four defects.
 *
 * 🔴 EVERY TEST IN THE FIRST FOUR BLOCKS WAS MEASURED RED AGAINST THE TOOL AS IT
 * STOOD ON 2026-08-26, BEFORE THE FIX WAS WRITTEN. A regression test written
 * together with its fix is not evidence that it detects the defect — §C82 L55,
 * where a pin comparing `[]` to `[]` passed whatever the port did.
 *
 * ── WHY THESE ARE CLI TESTS AND NOT UNIT TESTS ────────────────────────────────
 * All four defects live in argument handling and the EXIT CODE. `audit-render-output.js`
 * exports only `checkPlaceholderLeaks`; `main()`, its `parseArgs` and the exit
 * expression had zero coverage, which is exactly the gap the same three-defect
 * pattern occupied in the battery CLI (Task 2). The tool is safe to spawn: it is
 * read-only — measured, `grep` for `writeFileSync|mkdirSync|appendFile|rmSync|
 * unlinkSync|renameSync|createWriteStream` returns 0 against it and 2 against
 * `cnxml-extract.js` (the positive control that proves the pattern works). It is
 * also already classified read-only in `source-write-guard.test.js`'s ALLOW set.
 *
 * ⚠️ STDOUT AND STDERR ARE KEPT SEPARATE, WHICH THE BATTERY CLI's SHARED IDIOM DOES
 * NOT DO. Defect 3's whole substance is that STDOUT says `Result: PASS` while STDERR
 * says every module failed; merging them into one string makes the two
 * indistinguishable and the test unable to state which stream carried which claim.
 *
 * ⚠️ THE RUNNER IS `spawnSync`, DELIBERATELY NOT THIS REPO'S USUAL
 * `execFileSync`-in-a-try/catch (`tools/__tests__/module-flag-honesty.test.js:27-37`,
 * copied into the battery CLI test). The reason is measured and is recorded on
 * `runAudit` below: that idiom cannot see stderr on a ZERO-exit run, which silently
 * makes every stderr assertion here vacuous.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Run the tool and return BOTH streams plus the real exit code.
 *
 * 🔴 `spawnSync`, NOT the `execFileSync`-in-a-try/catch idiom the battery CLI test
 * uses — and the difference was measured, not stylistic. `execFileSync` RETURNS
 * stdout on success and only carries `stderr` on the thrown error, so a helper built
 * that way has no stderr at all on a zero-exit run. Every `stderr` assertion against
 * a passing command would then be checking the empty string: `not.toMatch(...)`
 * VACUOUSLY true, `toMatch(...)` always false. The first draft of this file had
 * exactly that, and its defect-3 CONTROL was passing for the wrong reason — §C82
 * L55's shape in the very file whose header warns about it. `spawnSync` captures
 * both streams in both outcomes and never throws.
 */
const runAudit = (args) => {
  const r = spawnSync('node', [path.join('tools', 'audit-render-output.js'), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  return { stdout: r.stdout || '', stderr: r.stderr || '', code: r.status };
};

/**
 * 🔴 DEFECT 1 — A REAL ID DROP IS PUSHED AS `severity: 'warning'` (:367-373) AND THE
 * EXIT KEYS ON `totalErrors` ONLY (:543), SO IT PRINTS `PASS with warnings` AND
 * EXITS 0.
 *
 * Reader-visible content going missing is the one thing this tool exists to catch.
 * The fixture is the spec's own `[M†]` claim, and it reproduced character for
 * character: `0 error(s), 1 warning(s)` / `1 ID(s) missing from output`, exit 0.
 */
describe('R4 defect 1 — a missing ID must FAIL the run', () => {
  it('m68663 reports a missing ID and the run FAILS', () => {
    const r = runAudit([
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '1',
      '--module',
      'm68663',
      '--track',
      'mt-preview',
    ]);
    // POSITIVE CONTROL, and it is load-bearing: it asserts the fixture still
    // exhibits the condition. Without it a corpus change that removed the missing
    // ID would make the exit-code assertion pass VACUOUSLY, pinning nothing.
    expect(r.stdout).toMatch(/ID\(s\) missing from output/);
    // RED BEFORE THE FIX: code was 0.
    expect(r.code).toBe(1);
    expect(r.stdout).not.toMatch(/Result: PASS/);
  });
});

/**
 * 🔴 DEFECT 2 — `--chapter 0` IS REJECTED (:476 `if (!args.chapter)`), THE FALSY-ZERO
 * TRUTHINESS BUG. Chemistry's ch00 is a real chapter holding `m68662`, and its
 * rendered page `0-1-formali.html` exists, so the chapter is fully auditable and the
 * tool simply refuses to look.
 *
 * ⚠️ ASSERTING "IT NO LONGER ERRORS" WOULD BE INSUFFICIENT, and dangerously so: a
 * tool that accepts `--chapter 0` and then audits NOTHING satisfies that assertion
 * while exhibiting defect 3. The test therefore asserts the module was actually
 * REACHED.
 */
describe('R4 defect 2 — chapter 0 is a real chapter', () => {
  it('--chapter 0 audits m68662 rather than being rejected as absent', () => {
    // The fixture, asserted rather than assumed.
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'books/efnafraedi-2e/01-source/ch00/m68662.cnxml'))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          'books/efnafraedi-2e/05-publication/mt-preview/chapters/00/0-1-formali.html'
        )
      )
    ).toBe(true);

    const r = runAudit(['--book', 'efnafraedi-2e', '--chapter', '0', '--track', 'mt-preview']);
    // RED BEFORE THE FIX: stderr was `Error: --chapter is required`, exit 1.
    expect(r.stderr).not.toMatch(/--chapter is required/);
    // It actually reached the module — "did not reject" is not enough.
    expect(r.stdout).toMatch(/m68662/);
    expect(r.stdout).toMatch(/Audit complete: 1 module/);
  });
});

/**
 * 🔴 DEFECT 3 — A MODULE THE TOOL COULD NOT AUDIT IS `continue`d PAST (:490-493)
 * WITHOUT TOUCHING `totalErrors` OR ANY SUCCESS COUNTER, SO IT REPORTS `Result: PASS`
 * AND EXITS 0 HAVING AUDITED NOTHING. THIS IS §C60's SIGNATURE — the exact shape the
 * whole battery exists to prevent — LIVE IN THE TOOL TIER 3 WRAPS.
 *
 * 🔴 IT IS WHOLE-CHAPTER, NOT THE SINGLE-MODULE EDGE CASE THE PLAN DESCRIBES.
 * Measured 2026-08-26 by sweeping every chapter of both kept books, per track:
 *
 *   book                track        chapters printing PASS over ZERO audited
 *   efnafraedi-2e       mt-preview    0 of 23      <- control
 *   efnafraedi-2e       faithful     19 of 23
 *   lifraen-efnafraedi  mt-preview   30 of 31      (329 modules)
 *   lifraen-efnafraedi  faithful     n/a — no rendered html exists at all
 *
 * ▶ So it fires wherever a track's render is incomplete, which is the NORMAL state
 * for three of the four book x track combinations. ⚠️ STATE THE TRACK WITH THE
 * NUMBER: an earlier form of this note said "chemistry 0 of 23" as a BOOK figure,
 * which is a measurement generalised one step past its coverage — the faithful track
 * is 19 of 23.
 */
describe('R4 defect 3 — a module that could not be audited is never a PASS', () => {
  it('a --module matching nothing does not report PASS', () => {
    const r = runAudit([
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '1',
      '--module',
      'm99999',
      '--track',
      'mt-preview',
    ]);
    // The tool DID notice — it says so on stderr. The defect is that stdout and the
    // exit code disagree with stderr.
    expect(r.stderr).toMatch(/not found/);
    // RED BEFORE THE FIX: stdout carried `Audit complete: 1 module(s), 0 issue(s)`
    // and `Result: PASS`, code 0.
    expect(r.stdout).not.toMatch(/Result: PASS/);
    expect(r.code).toBe(1);
  });

  it('a chapter whose every module failed does not report PASS — the §C60 shape at scale', () => {
    const r = runAudit(['--book', 'lifraen-efnafraedi', '--chapter', '1', '--track', 'mt-preview']);
    // Control: this chapter really is in the all-failed state, so the assertion
    // below cannot pass because the fixture quietly changed.
    expect(r.stderr).toMatch(/Rendered HTML not found/);
    // RED BEFORE THE FIX: `Audit complete: 13 module(s), 0 issue(s)` / `Result: PASS`, code 0.
    expect(r.stdout).not.toMatch(/Result: PASS/);
    expect(r.code).toBe(1);
  });

  it('CONTROL — a chapter that genuinely audits is still AUDITED, not swept into the failure count', () => {
    // 🔴 THIS IS WHAT SEPARATES A FIX FROM "MAKE EVERYTHING FAIL". organic ch03 is
    // the one organic chapter with rendered output: 8 modules, 0 `not found`.
    // Without this control, a repair that failed every chapter would read as a pass.
    const r = runAudit(['--book', 'lifraen-efnafraedi', '--chapter', '3', '--track', 'mt-preview']);
    expect(r.stderr).not.toMatch(/Rendered HTML not found/);
    // The defect-3 counter must stay at zero here — that is the property under test.
    expect(r.stdout).toMatch(/Audit complete: 8 module\(s\) attempted, 8 audited/);
    expect(r.stdout).toMatch(/0 unauditable/);
    expect(r.stdout).not.toMatch(/could not be audited/);

    // ⚠️ THIS CONTROL WAS WRITTEN ASSERTING `code === 0` AND IT WENT RED — CORRECTLY,
    // AND THE RED IS A DISCOVERY RATHER THAN A BROKEN TEST. `m00038` really does drop
    // 3 IDs; before defect 1's promotion that printed `PASS with warnings` and exited
    // 0. So the honest control asserts that the chapter was fully AUDITED (above) and
    // that its failure is attributable to the newly-visible ID drop (below) — not
    // that the chapter passes. Asserting exit 0 here would have required un-fixing
    // defect 1, i.e. letting the test dictate the behaviour instead of measuring it.
    expect(r.stdout).toMatch(/m00038: 1 error\(s\)/);
    expect(r.stdout).toMatch(/ERROR: 3 ID\(s\) missing from output/);
    expect(r.code).toBe(1);
  });
});

/**
 * 🔴 DEFECT 4 — `--book` DEFAULTS TO `efnafraedi-2e` (:34-40), SO OMITTING IT AUDITS
 * CHEMISTRY WHICHEVER BOOK YOU MEANT. `requireBook()` from `tools/lib/parseArgs.js`
 * is the repo's own fix for this and is already used by the sibling tool
 * `cnxml-fidelity-check.js`.
 *
 * ⚠️ SAFE TO CHANGE: swept `package.json`, `scripts/`, `.github/workflows/`,
 * `server/` and `docs/` — NOTHING executable invokes this tool. The only code
 * references are a test importing `checkPlaceholderLeaks` and `source-write-guard`'s
 * ALLOW set.
 */
describe('R4 defect 4 — --book is required, never defaulted', () => {
  it('omitting --book errors instead of silently auditing chemistry', () => {
    const r = runAudit(['--chapter', '1', '--track', 'mt-preview']);
    // RED BEFORE THE FIX: it audited chemistry — stdout began `m68663: 0 error(s) …`.
    expect(`${r.stdout}${r.stderr}`).toMatch(/--book is required/);
    expect(r.stdout).not.toMatch(/m68663/);
  });
});

/**
 * 🔴 NOT A DEFECT — A GUARD ON THE FIX ITSELF.
 *
 * Defects 2 and 4 are repaired by migrating this tool from its own module-local
 * `parseArgs` (:37) to the shared `tools/lib/parseArgs.js`. That parser SILENTLY
 * DROPS UNKNOWN FLAGS (§C83), and it declares only `--book`, `--chapter`, `--module`
 * plus the builtins `--help`/`--verbose` — **`--track` and `--json` are not among
 * them**. So the migration can turn `--track faithful` into a silent no-op that
 * falls back to `mt-preview`, and every other test here would still pass.
 *
 * The fixture is decisive because the two tracks give OPPOSITE verdicts on the same
 * chapter: chemistry ch01 is `Result: FAIL` / exit 1 on mt-preview (2 errors) and
 * `Result: PASS with warnings` / exit 0 on faithful. A dropped `--track` therefore
 * shows up as the wrong verdict, not merely as a missing flag.
 */
describe('the --track flag actually arrives', () => {
  it('--track faithful is not silently dropped to mt-preview', () => {
    const mt = runAudit(['--book', 'efnafraedi-2e', '--chapter', '1', '--track', 'mt-preview']);
    const fa = runAudit(['--book', 'efnafraedi-2e', '--chapter', '1', '--track', 'faithful']);
    // The two tracks are genuinely different artefacts — asserted, so a corpus
    // change that made them identical fails here rather than making the test vacuous.
    expect(mt.stdout).not.toBe(fa.stdout);
    expect(mt.stdout).toMatch(/error\(s\)/);
    // faithful's ch01 has 5 of 7 modules unrendered — defect 3 again, in CHEMISTRY.
    expect(fa.stderr).toMatch(/not found/);
  });
});

/**
 * 🔴 FIX-ROUND BINDINGS — each closes a mutation an adversarial review showed SURVIVING
 * the original suite, or a real defect it found in the tool.
 */
describe('fix round — gaps an adversarial review found', () => {
  it('a genuinely clean run exits 0 — the branch the suite never pinned', () => {
    // 🔴 `process.exitCode = 1` UNCONDITIONAL survived the whole original suite: all four
    // `.code` assertions were `toBe(1)`, so nothing bound the success branch. The direction
    // is safe (fail-loud), so the cost is a spuriously halted run rather than a silent pass
    // — but a gate that can only say "no" is not a gate.
    const r = runAudit(['--book', 'efnafraedi-2e', '--chapter', '0', '--track', 'mt-preview']);
    expect(r.stdout).toMatch(/Result: PASS/);
    expect(r.code).toBe(0);
    // Non-vacuity: it really audited something.
    expect(r.stdout).toMatch(/1 module\(s\) attempted, 1 audited/);
  });

  it('--chapter appendices audits the appendices, not a directory called chappendices', () => {
    // Three sites built `ch${padStart(2,'0')}`, which for 'appendices' yields the
    // non-existent `chappendices`. RED BEFORE THE FIX:
    // `Error: Source directory not found: books/efnafraedi-2e/01-source/chappendices`.
    // ⚠️ NOT a regression from the parseArgs migration — the old parser did
    // `parseInt('appendices')` -> NaN and refused too. Both refused; only the reason moved.
    const r = runAudit([
      '--book',
      'efnafraedi-2e',
      '--chapter',
      'appendices',
      '--track',
      'mt-preview',
    ]);
    expect(r.stderr).not.toMatch(/chappendices/);
    expect(r.stdout).toMatch(/13 module\(s\) attempted, 13 audited/);
    expect(r.stdout).toMatch(/0 unauditable/);
  });

  it('--json emits parseable JSON whose entries R4 can consume', () => {
    // The seam between this tool and the Tier-3 gate was unbound: no test passed --json at
    // all, so nothing checked that what the tool emits is what `R4.run` expects. Shapes
    // agreeing today is not the same claim as a test saying so.
    const r = runAudit([
      '--book',
      'lifraen-efnafraedi',
      '--chapter',
      '3',
      '--track',
      'mt-preview',
      '--json',
    ]);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(8); // the COUNT beside the type test — §C82 L33/L37
    for (const entry of parsed) expect(entry).toHaveProperty('moduleId');
    // The keys R4 actually reads, asserted here rather than assumed there.
    expect(parsed.some((e) => Array.isArray(e.issues))).toBe(true);
  });
});
