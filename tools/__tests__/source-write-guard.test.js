import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const TOOLS = path.resolve(import.meta.dirname, '..');

describe('01-source overwrite path removed (PROV-1)', () => {
  // (1) Precise RED->GREEN driver: the upstream-CNXML write must be gone.
  it('check-source-updates.js no longer writes upstream CNXML into 01-source', () => {
    const src = readFileSync(path.join(TOOLS, 'check-source-updates.js'), 'utf8');
    expect(/function\s+cmdUpdate|cmdUpdate\s*=/.test(src)).toBe(false); // the update handler is gone
    expect(src).not.toMatch(/writeFileSync\s*\(\s*localPath/); // the 01-source overwrite (was :647) — the only such call site
    expect(src).not.toMatch(/\bupdate <moduleId>/); // usage line gone
  });

  // (2) Durable tripwire: which tools reference 01-source at all. A new one trips
  // this test, forcing a reviewer to classify it read-only vs writer.
  // SCOPE: top-level tools/*.js only — 01-source touchers under tools/lib/,
  // tools/archived/, scripts/, or server/ are NOT seen by this net (e.g.
  // server/services/bookRegistration.js scaffolds an empty 01-source/ + README).
  it('only known tools reference 01-source (new touchers must be reviewed)', () => {
    const ALLOW = new Set([
      'analyze-order-causes.js', // read-only: reads 01-source/<chNN> CNXML to analyze structural reorder causes
      'audit-render-output.js', // read-only: reads source CNXML + source media as an audit baseline vs rendered output
      'check-source-updates.js', // read-only: check/diff compare against upstream (update verb removed, PROV-1)
      'cnxml-extract.js', // read-only: reads source CNXML + collection-order.json; writes land in 02-for-mt/
      'cnxml-fidelity-check.js', // read-only: reads source CNXML to compare against 03-translated output
      'cnxml-inject.js', // read-only: reads original CNXML as an injection reference; writes land in 03-translated/
      'cnxml-linguistic-check.js', // read-only: reads source CNXML for linguistic QA
      'cnxml-render-fidelity-check.js', // read-only: reads source CNXML; writes a baseline JSON at the book root
      'cnxml-render.js', // read-only: copies FROM 01-source/media INTO 05-publication/ (never writes 01-source)
      'download-source.js', // writes: the ONLY guarded CNXML writer (organizeSourceFiles, refuse-overwrite guarded)
      'exercise-extract.js', // read-only: reads the exercises cache; writes only 02-for-mt/02-structure (item 9 D3)
      'generate-image-mapping.js', // read-only: scans source CNXML for image basenames; writes book-level media/image-mapping.json
      'generate-source-manifest.js', // writes: the .source-manifest.json provenance file (not CNXML)
      'inventory-math-labels.js', // read-only: scans source math text; docstring states "Never writes under 01-source/"
      'preintake-probe.js', // read-only: probes source dir at intake, no writes
      'remt-sweep.js', // read-only: walks 01-source to build the §C82 battery's measurement populations; VERIFIED — its only fs calls are existsSync/readFileSync/readdirSync, and a full --with-spawns run leaves books/ byte-clean. It spawns audit-render-output.js and the schema validator, both read-only and both already classified here / under experiments/.
      'remt-ctx.js', // read-only: reads 01-source/<chNN> CNXML to build §C82 check battery's Tier-0/1 ctx; only fs calls are existsSync/readFileSync/readdirSync/statSync; imports mt-lock.cjs but binds only isMtLocked (never writeMtLock); both child processes (check-glossary-payload.js + git log) read-only; 220-unit load leaves books/ byte-clean.
      'render-oracle-check.js', // read-only: §C118 T0/T3 — reads 01-source CNXML and the committed openstax-id-manifest.json, renders in memory and compares; VERIFIED its ONLY fs calls are existsSync/readFileSync (no writeFileSync/mkdir/rename/unlink anywhere in the file), and it writes no file at all, not even a report.
      'repair-emphasis.js', // read-only: reads source CNXML only as a fidelity-guard baseline; writes land in 03-translated/
      'resolve-embeds.js', // read-only: scans source CNXML for iframe embeds; writes a book-root embed-mapping.json
      'resolve-os-embed.js', // writes: downloads exercise JSON + images into 01-source/exercises,media (not CNXML)
      'source-roundtrip-check.js', // read-only: §C118 T2 — reads 01-source CNXML, runs the extract->inject(EN) round-trip in memory and diffs it against that same source; VERIFIED its ONLY fs calls are existsSync/readFileSync (a grep for write verbs matches once, on `norm(own)` — the substring `rm(` — and nothing else), and it writes no file at all.
      'translate-chapter-titles.js', // read-only: reads collection-order.json; writes server/data/<book>.json
      'validate-chapter.js', // read-only: existence/consistency checks only
      'verify-extraction-coverage.js', // read-only: reads source CNXML to check list-item coverage vs 02-for-mt seg-ids (campaign 6b); writes nothing
      'verify-source-manifest.js', // read-only: recomputes hashes and diffs against the committed manifest
    ]);
    const touchers = readdirSync(TOOLS)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => /01-source/.test(readFileSync(path.join(TOOLS, f), 'utf8')));
    const unexpected = touchers.filter((f) => !ALLOW.has(f));
    expect(unexpected).toEqual([]); // a new 01-source toucher => review + add to ALLOW (read) or guard it (write)
  });

  // (3) Regression guard, added AFTER the deletion (pre-deletion this would hit the
  // live network via cmdUpdate). Confirms the verb falls through to the unknown-command
  // path — no network access — rather than silently succeeding.
  it('check-source-updates.js no longer accepts the update verb', () => {
    const script = path.join(TOOLS, 'check-source-updates.js');
    let code = 0;
    try {
      execFileSync('node', [script, 'update', 'm00001'], { encoding: 'utf8' });
    } catch (e) {
      code = e.status;
    }
    expect(code).not.toBe(0); // update is gone → non-zero exit
  });
});

/**
 * openstax-fetch.cjs -- a SECOND, UNGATED path to the operation CLAUDE.md's
 * heaviest rule governs, currently disarmed by a host-allowlist mismatch.
 * --> see CLAUDE.md "Never overwrite local OpenStax CNXML from upstream without
 *     double written consent" for the rule itself; nothing is restated here.
 *
 * WHAT IS TRUE, ALL MEASURED (2026-09-04, register §C118 (7)):
 *  - 0 callers anywhere in the repo.
 *  - Every fetch refuses: it builds raw.githubusercontent.com URLs while
 *    ALLOWED_FETCH_HOSTS admits only openstax.org / cnx.org. Exit 1, loud.
 *  - It does NOT consult tools/lib/source-refresh-policy.cjs -- the four
 *    fail-closed licence gates that download-source.js, the sanctioned CNXML
 *    writer, does consult.
 *  - Its --collection + --output-dir path writes the chNN/<id>.cnxml shape into
 *    a CALLER-CHOSEN directory (outputDir defaults to null and the bulk branch
 *    is gated on it), so it is a deliberate-act path, not an accident path.
 *  - The tripwire above cannot see it, for TWO independent reasons: the glob is
 *    endsWith('.js') and this file is .cjs, AND the needle is the literal
 *    "01-source", which the file never contains. Either alone suffices, so
 *    widening the glob would NOT catch it. (The .cjs gap is latent today:
 *    neither top-level .cjs tool references 01-source.)
 *
 * WHY A TEST RATHER THAN A DELETION. Deleting it is the cleaner outcome and is
 * the user's call, not this test's. What the test buys meanwhile is that the
 * register used to describe this tool as "appears INERT ... no covering test",
 * which invites the repair that RE-ARMS it: widen the allowlist, and a bulk
 * OpenStax CNXML fetcher that bypasses the licence gates is live again. curl is
 * equally ungated -- the difference is that nobody mistakes curl for a
 * sanctioned pipeline tool, and a file sitting in tools/ they might.
 *
 * SO: if you are here because this test failed, you have re-armed that path.
 * That needs the three-step written consent in CLAUDE.md, or the licence gates
 * wired in, or the tool deleted. It does not need this assertion relaxed.
 */
describe('openstax-fetch.cjs fetch path stays refused (PROV-2)', () => {
  const script = path.join(TOOLS, 'openstax-fetch.cjs');

  /** Run the tool, returning {code, stderr} whether it exits 0 or not. */
  function run(args) {
    try {
      const stdout = execFileSync('node', [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
      return { code: 0, stderr: '', stdout };
    } catch (e) {
      return { code: e.status, stderr: e.stderr || '', stdout: e.stdout || '' };
    }
  }

  // POSITIVE CONTROL, and it is load-bearing: without it a non-zero exit is
  // indistinguishable from "the tool is broken / node could not start it", and
  // the refusal assertion below would pass for the wrong reason.
  it('CONTROL: a non-fetching verb still runs and exits 0', () => {
    expect(run(['--list-books']).code).toBe(0);
  });

  // The probe's --output goes to a THROWAWAY dir, never into the repo: if this
  // assertion is ever failing, the tool is fetching for real, and a repo-relative
  // target would leave upstream CNXML behind. (Measured: re-arming the allowlist
  // fetched 43,015 bytes of real chemistry CNXML on the first try -- the tool is
  // entirely functional, and one host regex is the whole of the disarmament.)
  let out;
  beforeEach(() => {
    out = path.join(mkdtempSync(path.join(os.tmpdir(), 'osfetch-probe-')), 'fetched.cnxml');
  });
  afterEach(() => {
    rmSync(path.dirname(out), { recursive: true, force: true });
  });

  it('refuses a single-module fetch rather than reaching the network', () => {
    expect(run(['m68690', '--output', out]).stderr).toMatch(/Refusing to fetch disallowed URL/);
  });

  it('exits non-zero on that refusal, so a caller cannot read it as success', () => {
    expect(run(['m68690', '--output', out]).code).not.toBe(0);
  });

  it('writes nothing when it refuses', () => {
    run(['m68690', '--output', out]);
    expect(existsSync(out)).toBe(false);
  });
});
