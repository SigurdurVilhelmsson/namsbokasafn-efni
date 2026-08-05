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
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const DEPLOY_SH = path.join(REPO, 'scripts', 'deploy.sh');

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

  it('prints a STALE refusal with the ⚠ STALE tag and the --adopt remediation', () => {
    const body = JSON.stringify({
      status: 'degraded',
      checks: {
        glossary_export: {
          ok: false,
          ran: iso(1 * H),
          stale_refusals: ['efnafraedi-2e'],
          books: { 'efnafraedi-2e': { outcome: 'refused-producer', since: iso(8 * D) } },
        },
      },
    });
    const out = runReadout(body);
    expect(out).toMatch(/^Health: degraded — not ok: glossary_export$/m);
    expect(out).toMatch(/glossary export: not ok \(ran [\d.]+h ago\)/);
    expect(out).toMatch(
      /^ {2}⚠ STALE efnafraedi-2e: refused-producer \(8\.0d\) — unattended past the threshold; run --adopt efnafraedi-2e to resolve$/m
    );
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
