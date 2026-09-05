/**
 * Pins the glossary-refusal readout embedded in scripts/deploy.sh (register
 * C14, Task 7).
 *
 * ⚠️ WHY THIS FILE EXISTS AT ALL. This task's entire premise is that a
 * refusal is otherwise invisible — nothing polls /api/health, so this
 * printout is the only routine surface a human ever sees it on. Before this
 * file, NOTHING asserted that the readout actually prints a refusal;
 * shell-syntax.test.mjs only checks `bash -n` (parses) and that curl output
 * isn't discarded to /dev/null. A future edit could delete the whole
 * per-book loop and the suite would stay green — the exact defect class
 * (register C11(b): a detector reporting into a channel nobody reads) this
 * task exists to close, applied to the deliverable itself.
 *
 * ⚠️ The block is extracted by READING scripts/deploy.sh AT TEST TIME, never
 * pasted as a copy here. A pasted copy drifts from the real script the
 * moment either one is edited and then pins nothing real — this is the same
 * lesson as the repo's `<!-- SEG:m001:... -->` marker: a fixture that isn't
 * derived from the real source starts passing for a shape that no longer
 * exists. If the extraction regex ever fails to match, that is this file
 * correctly refusing to pass vacuously — fix the regex, don't loosen it.
 *
 * ⚠️ Executed via `bash -c`, not `node -e` directly. The whole block is a
 * bash DOUBLE-QUOTED string handed to `node -e`; a mutation that introduces
 * an unescaped `$`, backtick, or `"` would break under bash's quoting rules
 * specifically, and a test that skipped the bash layer (feeding the
 * extracted JS straight to `node -e`) would not catch that class of bug —
 * this was caught in review during Task 7 itself (a first verification pass
 * used an extracted copy in a file; re-run against the literal in-file bash
 * block, per advisor review, before it shipped).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const DEPLOY_SH = path.join(REPO, 'scripts', 'deploy.sh');

/**
 * ⚠️ THE REAL PARSER, not a copy of its rules.
 *
 * The readout previously printed `run --adopt <slug> to resolve`, which is
 * NOT SYNTAX THIS SCRIPT ACCEPTS — `--adopt` takes no value, so parseArgs
 * exits 1 with "unrecognised argument '<slug>'". The pin that was supposed to
 * guard this readout asserted that broken string VERBATIM, so the test
 * defended the bug (whole-branch adversarial review, 2026-08-05).
 *
 * A verbatim pin can only ever say "the string is what it was"; it cannot say
 * "the string is a command that works". So every command this readout prints
 * is now fed through `parseArgs` itself. The two can no longer drift apart:
 * changing the flag grammar without changing the advice fails here.
 *
 * Requiring the script is side-effect free (no DB is opened at module load,
 * measured at ~12 ms) — `runGlossaryExport` resolves its DB-backed defaults
 * lazily through `terminologyService`, which this never calls.
 */
const { parseArgs } = createRequire(import.meta.url)(
  path.join(REPO, 'server', 'scripts', 'export-terminology.js')
);

/**
 * Every `run: node server/scripts/export-terminology.js …` command the
 * readout printed, as an argv array ready for `parseArgs`.
 *
 * ⚠️ Callers MUST assert the expected count. If the advice ever stops
 * printing a command at all this returns `[]`, and a bare `for`-loop of
 * round-trip assertions over an empty array passes vacuously — the exact
 * defect class this file's header is about.
 */
function printedCommands(out) {
  return [...out.matchAll(/run: node server\/scripts\/export-terminology\.js (.+)$/gm)].map((m) =>
    m[1].trim().split(/\s+/)
  );
}

/**
 * Extract `echo "$HEALTH_BODY" | node -e "..." || true` verbatim from the
 * live file. Non-greedy match on the node -e body so an edit inside the
 * block (adding/removing lines) is picked up automatically; the surrounding
 * anchors (`echo "$HEALTH_BODY" | node -e "` … `" || true`) are the only
 * thing this depends on staying put.
 */
function extractHealthBlock() {
  const src = readFileSync(DEPLOY_SH, 'utf8');
  const m = src.match(/echo "\$HEALTH_BODY" \| node -e "[\s\S]*?\n\s*" \|\| true/);
  if (!m) {
    throw new Error(
      'Could not locate the `echo "$HEALTH_BODY" | node -e "..." || true` health-readout ' +
        'block in scripts/deploy.sh — has it moved or been reworded? ' +
        "Update extractHealthBlock()'s regex in this file to match."
    );
  }
  return m[0];
}

/** Run the readout exactly as deploy.sh runs it: bash -c, HEALTH_BODY env. */
function runReadout(healthBodyJson) {
  return execFileSync('bash', ['-c', extractHealthBlock()], {
    env: { ...process.env, HEALTH_BODY: healthBodyJson },
    encoding: 'utf8',
  });
}

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const H = 3600 * 1000;
const D = 24 * H;

describe('scripts/deploy.sh health readout — glossary refusals (register C14, Task 7)', () => {
  it('prints a FRESH refusal with a plain ⚠, no STALE tag, no --adopt text', () => {
    const body = JSON.stringify({
      status: 'ok',
      checks: {
        glossary_export: {
          ok: true,
          ran: iso(1.2 * H),
          stale_refusals: [],
          books: {
            'efnafraedi-2e': { outcome: 'refused-producer', since: iso(3 * H) },
            'liffraedi-2e': { outcome: 'wrote', since: iso(0) },
          },
        },
      },
    });
    const out = runReadout(body);
    expect(out).toMatch(/^Health: ok$/m);
    expect(out).toMatch(/glossary export: ok \(ran [\d.]+h ago\)/);
    expect(out).toMatch(/^ {2}⚠ efnafraedi-2e: refused-producer \(3\.0h\)$/m);
    expect(out).not.toMatch(/STALE/);
    expect(out).not.toMatch(/--adopt/);
    // wrote, not a refusal — must never appear
    expect(out).not.toMatch(/liffraedi-2e/);
  });

  /** A degraded body holding exactly one stale refusal of the given outcome. */
  const staleBody = (slug, outcome, ageMs = 8 * D) =>
    JSON.stringify({
      status: 'degraded',
      checks: {
        glossary_export: {
          ok: false,
          ran: iso(1 * H),
          stale_refusals: [slug],
          books: { [slug]: { outcome, since: iso(ageMs) } },
        },
      },
    });

  it('a STALE refused-producer gets the ⚠ STALE tag and a --adopt command parseArgs ACCEPTS', () => {
    const out = runReadout(staleBody('efnafraedi-2e', 'refused-producer'));
    expect(out).toMatch(/^Health: degraded — not ok: glossary_export$/m);
    expect(out).toMatch(/glossary export: not ok \(ran [\d.]+h ago\)/);
    expect(out).toMatch(/^ {2}⚠ STALE efnafraedi-2e: refused-producer \(8\.0d\) — unattended/m);

    // The shrink gate is a SEPARATE override, so adoption can still be
    // refused a second time; the advice must say so rather than leave the
    // operator to discover it on the next run.
    expect(out).toMatch(/--force may ALSO be needed/);

    const cmds = printedCommands(out);
    expect(cmds).toHaveLength(1); // guards against a vacuous round-trip below
    const parsed = parseArgs(cmds[0]);
    expect(parsed.error).toBeNull(); // ← the assertion the old verbatim pin could not make
    expect(parsed.book).toBe('efnafraedi-2e');
    expect(parsed.adopt).toBe(true);
    expect(parsed.force).toBe(false);
  });

  it('the OLD broken form — `run --adopt <slug>` — is gone; parseArgs exits 1 on it', () => {
    // Belt and braces, and it documents WHY: the string this readout used to
    // print is not merely imprecise, it is rejected by the parser outright.
    expect(parseArgs(['--adopt', 'efnafraedi-2e']).error).toMatch(/unrecognised argument/);
    const out = runReadout(staleBody('efnafraedi-2e', 'refused-producer'));
    expect(out).not.toMatch(/run --adopt/);
  });

  it('a STALE refused-growth gets its own remedy, not "unrecognised refusal"', () => {
    // §C119 added the outcome; without a branch here the remedy map falls
    // through to 'unrecognised refusal — read the status file on the box',
    // on the one routine surface an operator actually reads. Same shape as
    // the shrink case below: --force, never --adopt.
    const out = runReadout(staleBody('lifraen-efnafraedi', 'refused-growth', 9 * D));
    expect(out).toMatch(/^ {2}⚠ STALE lifraen-efnafraedi: refused-growth \(9\.0d\) — unattended/m);
    expect(out).not.toMatch(/unrecognised refusal/);
    expect(out).toMatch(/needs --force, NOT --adopt/);

    const cmds = printedCommands(out);
    expect(cmds).toHaveLength(1);
    const parsed = parseArgs(cmds[0]);
    expect(parsed.error).toBeNull();
    expect(parsed.book).toBe('lifraen-efnafraedi');
    expect(parsed.force).toBe(true);
  });

  it('a STALE refused-shrink is told to use --force, NOT --adopt', () => {
    // --adopt overrides the PRODUCER gate and does nothing for a shrink. The
    // old advice named --adopt for every refused-* outcome alike.
    const out = runReadout(staleBody('liffraedi-2e', 'refused-shrink', 9 * D));
    expect(out).toMatch(/^ {2}⚠ STALE liffraedi-2e: refused-shrink \(9\.0d\) — unattended/m);
    expect(out).toMatch(/needs --force, NOT --adopt/);

    const cmds = printedCommands(out);
    expect(cmds).toHaveLength(1);
    const parsed = parseArgs(cmds[0]);
    expect(parsed.error).toBeNull();
    expect(parsed.book).toBe('liffraedi-2e');
    expect(parsed.force).toBe(true);
    expect(parsed.adopt).toBe(false); // must NOT quietly hand over both overrides
  });

  it('a STALE refused-absent-baseline names --adopt and NOT --force', () => {
    // Register §C21. This book has a glossary/ dir and no committed file, so
    // BOTH gates are structurally inert and the first write is unreviewed by
    // construction. --adopt is the acknowledgement; --force answers a
    // different question (is the shrink intended) and must not be handed over
    // as well — the same two-risks-two-acknowledgements rule the shrink test
    // above pins from the other direction.
    const out = runReadout(staleBody('orverufraedi', 'refused-absent-baseline', 8 * D));
    expect(out).toMatch(
      /^ {2}⚠ STALE orverufraedi: refused-absent-baseline \(8\.0d\) — unattended/m
    );
    expect(out).toMatch(/no committed glossary/);

    const cmds = printedCommands(out);
    expect(cmds).toHaveLength(1);
    const parsed = parseArgs(cmds[0]);
    expect(parsed.error).toBeNull();
    expect(parsed.book).toBe('orverufraedi');
    expect(parsed.adopt).toBe(true);
    expect(parsed.force).toBe(false);
  });

  it('a STALE refused-no-mapping promises NO command — no flag can fix it', () => {
    // ⚠️ CORRECTED 2026-08-05. This said "THE LIVE INSTANCE. stjornufraedi
    // has a glossary/ dir and no book_subject_mapping row". It no longer
    // does — the empty directory was removed on prod that day, so the book
    // dropped out of the export loop entirely and reaches no outcome at all.
    // The scenario is still worth pinning (any book with a dir and no mapping
    // reaches it); only the claim that prod is sitting in it went stale.
    // The remedy is a DB row (migration 032), so printing any command here
    // would be a lie. ⚠️ Per §C21 the row alone is NOT sufficient either —
    // the book then lands on refused-absent-baseline, which is the point.
    const out = runReadout(staleBody('stjornufraedi', 'refused-no-mapping', 10 * D));
    expect(out).toMatch(/^ {2}⚠ STALE stjornufraedi: refused-no-mapping \(10\.0d\) — unattended/m);
    expect(out).toMatch(/NO flag fixes this/);
    expect(out).toMatch(/book_subject_mapping row for stjornufraedi/);
    expect(out).toMatch(/migration 032/);

    expect(printedCommands(out)).toHaveLength(0);
    expect(out).not.toMatch(/--adopt/);
    expect(out).not.toMatch(/--force/);
  });

  it('a mixed run round-trips EVERY printed command through the real parser', () => {
    // The whole-corpus shape a lead actually sees post-containment: three
    // books, three different refusals, three different remedies. Two of them
    // print a command; both must parse.
    const body = JSON.stringify({
      status: 'degraded',
      checks: {
        glossary_export: {
          ok: false,
          ran: iso(1 * H),
          stale_refusals: ['efnafraedi-2e', 'liffraedi-2e', 'stjornufraedi'],
          books: {
            'efnafraedi-2e': { outcome: 'refused-producer', since: iso(8 * D) },
            'liffraedi-2e': { outcome: 'refused-shrink', since: iso(9 * D) },
            stjornufraedi: { outcome: 'refused-no-mapping', since: iso(10 * D) },
          },
        },
      },
    });
    const out = runReadout(body);
    const cmds = printedCommands(out);
    expect(cmds).toHaveLength(2); // refused-no-mapping deliberately contributes none
    for (const argv of cmds) {
      const parsed = parseArgs(argv);
      expect(parsed.error).toBeNull();
      // Every command must be book-SCOPED. An unscoped `--adopt` is the
      // adopt-every-book form, and running it against prod's committed state
      // reproduces the 2026-08-03 incident's writes in one command.
      expect(parsed.book).not.toBeNull();
    }
  });

  it('an ERRORS-ONLY response (zero refusals) still prints `ran` and the failing slug (fix round 1, finding 1)', () => {
    // Before the fix, the entire per-book block — including the `ran`
    // header — lived inside `if (refusals.length)`. An errored book with NO
    // refusal anywhere printed literally nothing beyond the top `Health:`
    // line: worse than a refusal, and quieter, because it wasn't even named.
    const body = JSON.stringify({
      status: 'degraded',
      checks: {
        glossary_export: {
          ok: false,
          ran: iso(5 * 60 * 1000),
          errors: 1,
          stale_refusals: [],
          books: { 'efnafraedi-2e': { outcome: 'error', since: iso(5 * 60 * 1000) } },
        },
      },
    });
    const out = runReadout(body);
    expect(out).toMatch(/^Health: degraded — not ok: glossary_export$/m);
    // `ran` must be visible — the whole point of this scenario.
    expect(out).toMatch(/glossary export: not ok \(ran \d+m ago\)/);
    // the failing slug must be named.
    expect(out).toMatch(/efnafraedi-2e/);
    expect(out).toMatch(/error/);
    // an error is not resolved by --adopt, and must not claim it is.
    expect(out).not.toMatch(/run --adopt efnafraedi-2e to resolve/);
  });

  it('prints NO per-book lines and NO glossary header when every book is healthy', () => {
    const body = JSON.stringify({
      status: 'ok',
      checks: {
        glossary_export: {
          ok: true,
          ran: iso(0),
          stale_refusals: [],
          books: {
            'efnafraedi-2e': { outcome: 'unchanged', since: 'x' },
            'liffraedi-2e': { outcome: 'wrote', since: 'y' },
            'lifraen-efnafraedi': { outcome: 'adopted', since: 'z' },
          },
        },
      },
    });
    const out = runReadout(body);
    expect(out.trim()).toBe('Health: ok');
  });

  it('malformed JSON prints the unparseable message and does not throw', () => {
    const out = runReadout('not json at all {{{');
    expect(out.trim()).toBe('Health: (unparseable response)');
  });

  it('empty body prints the unparseable message and does not throw', () => {
    const out = runReadout('');
    expect(out.trim()).toBe('Health: (unparseable response)');
  });

  it('the block always exits 0 — a glossary problem must never fail the deploy', () => {
    // Exercise the block standalone (not just via runReadout, which already
    // relies on execFileSync not throwing): confirm bash's own exit code.
    const script = extractHealthBlock() + '; echo "EXIT:$?"';
    const out = execFileSync('bash', ['-c', script], {
      env: { ...process.env, HEALTH_BODY: 'not json {{{' },
      encoding: 'utf8',
    });
    expect(out.trim()).toMatch(/EXIT:0$/);
  });
});
