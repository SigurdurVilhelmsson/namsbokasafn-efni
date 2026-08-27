/**
 * chapter-zero-cli-guards.test.js — the two remaining §C82 L65 sites.
 *
 * 🔴 THE CLASS: "is a chapter argument treated as absent when it is 0?"
 *
 * `--chapter 0` parses to the NUMBER 0, which is falsy, so the idiomatic
 * `if (!args.chapter)` reads a real chapter as "no chapter given". `ch00` is the
 * **Preface**, and it is a real content chapter in 5 of 5 books holding any CNXML
 * (chemistry m68662 · organic m00001 · physics m42955 · biology m66425 ·
 * micro m63247 — §C82 L65, [LEAD] 2026-08-26). `stjornufraedi` is not a
 * counter-example: it holds 0 `.cnxml` files, and a book without content cannot
 * witness a rule about content chapters.
 *
 * ⚠️ A PLAIN `if (!args.chapter)` SWEEP FINDS NEITHER OF THESE TWO SITES. Both
 * spell it inside a larger disjunction — `args.help || !args.chapter` and
 * `!args.docx || !args.chapter` — which is why the register's prescription is to
 * sweep for the QUESTION, not for one syntax. Four sibling tools were fixed in
 * Plan A (`validate-chapter`, `cnxml-fidelity-check`, `cnxml-linguistic-check`,
 * and `audit-render-output` at Task 11); these two were logged deliberately
 * unfixed pending a per-tool judgement, which the [LEAD] ruling then answered.
 *
 * ▶ WHY THE FIX IS NARROW, AND WHY THAT IS THE WHOLE POINT.
 * `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` warns that a BLANKET
 * truthiness flip "turns a clean rejection into a proceed-into-broken-path". That
 * warning is LIVE here and is measured, not hypothetical: both tools build their
 * chapter directory with `` `ch${String(chapter).padStart(2, '0')}` ``, so
 *
 *     chapter 0            -> 'ch00'   ✅ a real directory (chemistry holds m68662)
 *     chapter 'appendices' -> 'chappendices'   ❌ a directory that never exists
 *
 * — the §C82 L77 bug, in a tool that does not have it today only because its
 * hand-rolled parser runs a bare `parseInt`, so `--chapter appendices` is `NaN`
 * and gets rejected. `chapterProvided()` preserves exactly that: it accepts 0,
 * and rejects `null`/`undefined`/`NaN`. **The appendices controls below are not
 * decoration — they are what stops this fix from becoming the broken path the
 * roadmap warns about.**
 *
 * 🔴 THE TWO TOOLS GET OPPOSITE TREATMENTS, AND THAT IS THE FINDING — a blanket
 * flip would have been wrong on one of them.
 *
 *   auto-insert-placeholders  ACCEPT 0. `ch00` exists (chemistry m68662), the
 *                             hand-rolled `ch${padStart(2,'0')}` builds it
 *                             correctly, and the run is a clean no-op.
 *   docx-import               STILL REFUSE 0 — but on its real reason. Every book
 *                             JSON numbers chapters from 1 and carries the preface
 *                             as a separate `preface` key, so the tool has no
 *                             chapter 0 to import INTO. Measured: flipping its
 *                             guard alone parses 57 docx blocks of real work and
 *                             THEN dies "Chapter 0 not found in
 *                             server/data/chemistry-2e.json" — the roadmap's
 *                             proceed-into-broken-path, reproduced.
 *
 * ▶ So the shared class ("0 is not absent") is fixed in both, while the per-tool
 * question the [LEAD] ruling reserved is answered separately in each. What changes
 * for `docx-import` is that its refusal stops naming the wrong argument.
 *
 * ▶ EVERY TEST HERE IS WRITE-FREE BY CONSTRUCTION, and all but one are also
 * FIXTURE-FREE (§C82 L79: a test whose green depends on an artifact CI lacks is a
 * test measuring the dev box). `auto-insert-placeholders` is pointed at a book slug
 * that does not exist and `docx-import` at a `.docx` path that does not exist, so
 * both stop before any write on a message that DIFFERS from the usage banner — and
 * that difference is the discriminator.
 * ⚠️ THE ONE EXCEPTION IS STATED RATHER THAN HIDDEN: the "refuses before parsing"
 * test needs a docx that really exists, or "it never reached Stage 1" would be
 * satisfied by the file simply being absent. It uses
 * `books/efnafraedi-2e/01-source/docx/ch00/preface.docx`, verified TRACKED
 * (`git ls-files --error-unmatch`) so CI reads the same bytes, and passes
 * `--dry-run`, which is honest in this tool — every write site sits behind it.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Run a tool CLI and capture both streams and the exit code.
 *
 * `spawnSync` rather than `execFileSync` on purpose: every case below exits
 * non-zero or emits on stderr, and `execFileSync` throws on a non-zero exit, which
 * turns "the assertion I care about" into "the exception I have to unwrap".
 *
 * `cwd` is pinned to the repo root because BOTH tools resolve their books
 * directory against `process.cwd()` (`books/${args.book}`) rather than against
 * `import.meta.url` — CLAUDE.md's durable path rule, violated in both files.
 * Logged as an out-of-scope finding rather than fixed here; pinning cwd means
 * these tests do not silently depend on which directory vitest was started from.
 */
function runTool(relPath, args) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, relPath), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    code: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    all: (r.stdout || '') + (r.stderr || ''),
  };
}

// The usage banner each tool prints when it decides no chapter was supplied. These
// are the strings that must NOT appear for `--chapter 0`, and that MUST appear for
// every genuinely-absent or unparseable chapter.
const PLACEHOLDERS_USAGE = 'Auto-insert placeholders into translated segments';
const DOCX_REQUIRED = '--docx and --chapter are required';

describe('auto-insert-placeholders.js — chapter 0 is a chapter, not a missing argument', () => {
  const TOOL = 'tools/auto-insert-placeholders.js';
  // A book slug that cannot exist, so the run stops at the missing-directory check
  // having written nothing. `--dry-run` is belt-and-braces: every write in this tool
  // sits behind `!dryRun`.
  const SAFE = ['--book', '__no-such-book__', '--dry-run'];

  it('accepts --chapter 0 and reaches the chapter it was given', () => {
    const r = runTool(TOOL, [...SAFE, '--chapter', '0']);
    expect(r.stdout).not.toContain(PLACEHOLDERS_USAGE);
  });

  it('builds ch00 for chapter 0 — not ch0, and not the whole book', () => {
    // 🔴 THIS IS THE ASSERTION THAT BINDS WHAT DISTINGUISHES. "Did not print the
    // usage banner" is satisfied by any number of wrong behaviours — a crash, a
    // silent widening to all 149 chemistry modules, a `ch0` path. Naming the
    // zero-padded directory in the tool's own error message is what separates
    // "accepted chapter 0" from "accepted something".
    const r = runTool(TOOL, [...SAFE, '--chapter', '0']);
    expect(r.stderr).toContain('ch00');
    expect(r.stderr).not.toContain('ch0/');
  });

  it('a missing chapter directory still exits non-zero — the flip must not buy a false green', () => {
    // 🔴 THE REGRESSION GUARD, AND IT IS THE REASON THIS FIX TOUCHES TWO LINES.
    // The missing-directory branch reported to stderr and `return`ed, so the process
    // exited 0. That was unreachable for chapter 0 while the guard rejected it; the
    // fix ROUTES chapter 0 into it, and organic genuinely has no `02-for-mt/ch00`.
    // So without the `process.exitCode = 1` in that branch, this exact invocation
    // goes from a correct exit 1 (argument refused) to a silent exit 0.
    // ⚠️ THIS ASSERTION IS GREEN BOTH BEFORE AND AFTER THE FIX, AND RED FOR THE
    // HALF-FIX — which is the whole point, and is measured, not asserted. Mutation
    // run: reverting the guard alone (`!chapterProvided` → `!args.chapter`) kills the
    // two chapter-0 tests and leaves THIS one green, because the guard then supplies
    // the exit 1. Deleting `process.exitCode = 1` alone — the state a fix that
    // stopped at the guard would ship — kills THIS one and nothing else. Neither
    // mutant is visible to the other's assertions, which is why both exist.
    const r = runTool(TOOL, [...SAFE, '--chapter', '0']);
    expect(r.code).toBe(1);
  });

  it('still refuses a genuinely absent --chapter', () => {
    const r = runTool(TOOL, SAFE);
    expect(r.stdout).toContain(PLACEHOLDERS_USAGE);
    expect(r.code).toBe(1);
  });

  it('still refuses an unparseable --chapter', () => {
    const r = runTool(TOOL, [...SAFE, '--chapter', 'abc']);
    expect(r.stdout).toContain(PLACEHOLDERS_USAGE);
    expect(r.code).toBe(1);
  });

  it('still refuses --chapter appendices, which would build chappendices', () => {
    // §C82 L77. The refusal is the CORRECT behaviour for this tool as written: its
    // only chapter-directory builder is `ch${padStart(2,'0')}`, so accepting
    // 'appendices' would proceed into `chappendices`, which exists nowhere. Making
    // appendices work here is a different change with its own measurement.
    const r = runTool(TOOL, [...SAFE, '--chapter', 'appendices']);
    expect(r.stdout).toContain(PLACEHOLDERS_USAGE);
    expect(r.all).not.toContain('chappendices');
    expect(r.code).toBe(1);
  });
});

describe('docx-import.js — chapter 0 is a chapter, not a missing argument', () => {
  const TOOL = 'tools/docx-import.js';
  // A path that cannot exist, so the run stops at the existsSync check before
  // parsing anything and before any write.
  const MISSING_DOCX = path.join(REPO_ROOT, '__no-such-file__.docx');

  it('stops blaming the wrong argument for --chapter 0, and refuses it on its real reason', () => {
    // 🔴 THE PER-TOOL JUDGEMENT, WHICH CAME OUT THE OPPOSITE WAY FROM ITS SIBLING'S.
    // The [LEAD] ruling settles the general question — ch00 is the Preface and a real
    // content chapter — and leaves per tool only "does THIS tool's operation make
    // sense on a preface?". For a docx import it measurably does not: every book JSON
    // numbers chapters from 1 and carries the preface as a top-level `preface` key,
    // so `loadModuleMetadata`'s `chapters.find(c => c.chapter === 0)` cannot match.
    //
    // So chapter 0 is still REFUSED here. What changes is that the refusal stops
    // being a lie: today the tool answers "--docx and --chapter are required" when
    // --docx was supplied and exists, blaming an argument that is fine.
    //
    // ⚠️ THE DISCRIMINATOR IS THE MESSAGE, NOT THE EXIT CODE. Before and after, this
    // exits 1 — which is exactly the reading that would let the defect ship
    // unnoticed, so the assertions name both halves: the old message must be gone
    // AND the true reason must be present.
    const r = runTool(TOOL, ['--docx', MISSING_DOCX, '--chapter', '0']);
    expect(r.stderr).not.toContain(DOCX_REQUIRED);
    expect(r.stderr).toContain('the Preface');
    expect(r.code).toBe(1);
  });

  it('refuses chapter 0 BEFORE parsing the docx — a clean rejection, not a broken path', () => {
    // The roadmap's warning, pinned. With only the presence guard flipped, this
    // invocation parses the whole document (57 blocks of real work) and then dies
    // with "Chapter 0 not found in server/data/chemistry-2e.json" — an argument
    // error degraded into a data-model error. A real, existing docx is used here so
    // that "it never got as far as Stage 1" is a claim about ordering rather than
    // about the file being missing. --dry-run is honest in this tool: every write
    // site is behind it.
    const realDocx = path.join(REPO_ROOT, 'books/efnafraedi-2e/01-source/docx/ch00/preface.docx');
    const r = runTool(TOOL, ['--docx', realDocx, '--chapter', '0', '--dry-run']);
    expect(r.stdout).not.toContain('Stage 1');
    expect(r.all).not.toContain('not found in server/data');
    expect(r.stderr).toContain('the Preface');
  });

  it('still refuses a genuinely absent --chapter', () => {
    const r = runTool(TOOL, ['--docx', MISSING_DOCX]);
    expect(r.stderr).toContain(DOCX_REQUIRED);
    expect(r.code).toBe(1);
  });

  it('still refuses an unparseable --chapter', () => {
    const r = runTool(TOOL, ['--docx', MISSING_DOCX, '--chapter', 'abc']);
    expect(r.stderr).toContain(DOCX_REQUIRED);
    expect(r.code).toBe(1);
  });

  it('still refuses --chapter appendices, which would build chappendices', () => {
    const r = runTool(TOOL, ['--docx', MISSING_DOCX, '--chapter', 'appendices']);
    expect(r.stderr).toContain(DOCX_REQUIRED);
    expect(r.all).not.toContain('chappendices');
    expect(r.code).toBe(1);
  });

  it('still refuses a missing --docx even when the chapter is valid', () => {
    // The other half of the disjunction. Without this, a fix that dropped the
    // `!args.docx` leg entirely would pass every test above.
    const r = runTool(TOOL, ['--chapter', '3']);
    expect(r.stderr).toContain(DOCX_REQUIRED);
    expect(r.code).toBe(1);
  });
});
