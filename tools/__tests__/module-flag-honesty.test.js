/**
 * module-flag-honesty.test.js — §C82/§C83: parseArgs silently drops any flag a
 * tool does not declare, so `--module` on a tool that never declared it is a
 * no-op that runs the WHOLE BOOK at full strength and exits 0. Three tools in
 * the battery need three different answers: scan-residue HONOURS the flag;
 * cnxml-render-fidelity-check and validate-chapter REJECT it loudly, because
 * their checks reconcile across a chapter's modules and honouring --module
 * would produce silently WRONG answers, not merely a dropped one.
 *
 * ⚠️ FIXTURE CORRECTION (pre-report, 2026-08-16): the task brief's Step 2 draft
 * used `--chapter 20 --module m68823` for the scan-residue scoping tests.
 * Measured on this tree: m68823 does not exist in chapter 20 at all (it lives
 * in chapter 17), and chapter 20 is completely residue-clean (`modules: {}`).
 * Both facts make the brief's literal fixture unable to pass regardless of
 * implementation. The controller's own SHOULD-TRIP positive control (ruling
 * #1) used `--chapter 17 --module m68823` — this file follows that fixture
 * for every scan-residue case instead. The render-fidelity-check and
 * validate-chapter blocks are unaffected: both reject --module unconditionally,
 * before any per-module lookup, so chapter/module existence is irrelevant there.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function run(tool, args) {
  try {
    const stdout = execFileSync('node', [path.join('tools', tool), ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { out: stdout, code: 0 };
  } catch (err) {
    return { out: `${err.stdout || ''}${err.stderr || ''}`, code: err.status ?? 1 };
  }
}

describe('a tool that cannot honour --module says so (§C83)', () => {
  it('cnxml-render-fidelity-check REJECTS --module rather than ignoring it', () => {
    const r = run('cnxml-render-fidelity-check.js', [
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '20',
      '--module',
      'm68823',
    ]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/--module/);
    expect(r.out).toMatch(/chapter/i);
  });

  it('cnxml-render-fidelity-check still runs without --module', () => {
    const r = run('cnxml-render-fidelity-check.js', ['--book', 'efnafraedi-2e', '--chapter', '20']);
    expect(r.out).not.toMatch(/not supported/i);
  });
});

describe('a tool that CAN honour --module narrows its scope', () => {
  // Chapter 17 (not 20 — see the file-header fixture correction). Whole-chapter
  // ch17 has 9 residue-scannable module files (chapter-metadata + m68820..m68827)
  // and 3 of them (m68821, m68823, m68824) carry a ratio warning today.
  it('scan-residue --module examines fewer units than the whole chapter', () => {
    const whole = run('scan-residue.js', ['--book', 'efnafraedi-2e', '--chapter', '17', '--json']);
    const one = run('scan-residue.js', [
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '17',
      '--module',
      'm68823',
      '--json',
    ]);
    const wj = JSON.parse(whole.out);
    const oj = JSON.parse(one.out);
    // `modulesExamined` goes in `summary`, beside its existing siblings
    // (modulesWithResidue, exactResidues, ratioWarnings, toleratedResidues) —
    // NOT at the top level, where the emitted object holds only {book, summary, modules}.
    // The scoped run must read strictly fewer modules — an equal count means the
    // flag was dropped and the whole chapter ran, which is the failure this pins.
    expect(oj.summary.modulesExamined).toBeLessThan(wj.summary.modulesExamined);
    expect(oj.summary.modulesExamined).toBe(1);
    expect(Object.keys(oj.modules)).toEqual(['m68823']);
  });

  it('scan-residue rejects a --module that does not exist rather than scanning everything', () => {
    const r = run('scan-residue.js', [
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '17',
      '--module',
      'mZZZZZ',
      '--json',
    ]);
    expect(r.code).not.toBe(0);
  });

  // §C82 discriminator (added beyond the brief — the brief's own four cases all
  // pass under EITHER `modulesExamined = Object.keys(modules).length` (modules
  // with a residue-related finding) OR a true per-module "examined" counter,
  // because every fixture they use happens to have a finding. m68820 exists in
  // ch17 (see collectResidueFiles) and is genuinely clean — absent from the
  // whole-chapter `modules` dict. A `Object.keys(modules).length === 0` check
  // for "matched nothing" cannot tell "module not found" apart from "module
  // found and clean", and misreports every healthy scoped module as an error —
  // which would break Task 9's per-module loop on its most common case.
  it('does not misreport a matched-but-clean module as "matched no module"', () => {
    const r = run('scan-residue.js', [
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '17',
      '--module',
      'm68820',
      '--json',
    ]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.summary.modulesExamined).toBe(1);
    expect(Object.keys(j.modules)).toEqual([]);
  });

  // §C82 review round 1, finding ①: the filter must be STRICT EQUALITY, not a
  // substring/prefix match. Every ch17 module id (m68820..m68827) shares the
  // prefix "m6882" — under `f.moduleId.includes(args.module)` this value would
  // match all 8 of them (modulesExamined jumps to 8, nothing errors) instead of
  // matching nothing. Verified red against that variant, green against the
  // shipped `===` filter — see task-8-report.md "Fix round 1" for both runs.
  it("does NOT substring/prefix-match — a value that is a real id's shared prefix matches nothing", () => {
    const r = run('scan-residue.js', [
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '17',
      '--module',
      'm6882',
      '--json',
    ]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/matched no module/);
  });

  // §C82 review round 1, finding ②: a bare `--module` (no trailing value) is
  // silently undetected by parseArgs' generic string-option handling
  // (`if (nextArg === undefined) continue`) — args.module stays null exactly
  // as if the flag were never passed, producing a whole-chapter scan the
  // caller believes is scoped to one module. Fixed in scan-residue ONLY (the
  // one tool that HONOURS --module, so the only one where this does harm) —
  // validate-chapter and cnxml-render-fidelity-check reject --module outright
  // regardless of value, so a missing value there degrades to "runs the whole
  // chapter" either way, which is what they'd do anyway.
  it('rejects a bare --module with no trailing value', () => {
    const r = run('scan-residue.js', ['--book', 'efnafraedi-2e', '--chapter', '17', '--module']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/--module/);
  });
});

describe('validate-chapter also rejects --module (chapter-scoped checks)', () => {
  it('rejects --module rather than silently running the whole chapter', () => {
    // ⚠️ THE ORIGINAL ASSERTION HERE WAS VACUOUS and was replaced at pre-flight.
    // It read `expect(one.out).not.toMatch(/m68791/)` — but validate-chapter NEVER
    // prints a module id at all (measured: `grep -coE 'm6[0-9]{4}'` over a full
    // run returns 0), so it passed trivially before and after. A test that cannot
    // fail is not a test.
    const r = run('validate-chapter.js', ['efnafraedi-2e', '20', '--module', 'm68823']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/--module/);
    expect(r.out).toMatch(/chapter/i);
  });

  it('still validates a chapter normally without --module (control)', () => {
    const r = run('validate-chapter.js', ['efnafraedi-2e', '20', '--track', 'mt-preview']);
    expect(r.out).not.toMatch(/not supported/i);
    expect(r.out).toMatch(/figure-numbers|files-exist/);
  });
});
