import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
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
      // NEVER writes 01-source — it REFUSES to. The reference is the containment check added
      // 2026-09-05 after a provenance audit proved that a traversing `outputName` in the
      // committed image-mapping.json escaped media/ into 01-source/ AND still returned ok:true.
      // The published target's dirname must now BE <book>/media/, which also refuses an absolute
      // path. Its only write is copyFileSync to that verified target, plus the sidecar.
      // ⚠️ This entry exists because the guard greps SOURCE TEXT, so the comment explaining the
      // prohibition trips the pin that enforces it — the shape [[engineering-lessons]] records.
      // Classifying it here is the review the tripwire is asking for; do not strip comments
      // instead, or the next such comment goes unreviewed.
      'publish-figure-svg.js',
      'resolve-os-embed.js', // writes: downloads exercise JSON + images into 01-source/exercises,media (not CNXML)
      'source-roundtrip-check.js', // read-only: §C118 T2 — reads 01-source CNXML, runs the extract->inject(EN) round-trip in memory and diffs it against that same source; VERIFIED its ONLY fs calls are existsSync/readFileSync (a grep for write verbs matches once, on `norm(own)` — the substring `rm(` — and nothing else), and it writes no file at all.
      'translate-chapter-titles.js', // read-only: reads collection-order.json; writes server/data/<book>.json
      'validate-chapter.js', // read-only: existence/consistency checks only
      'verify-extraction-coverage.js', // read-only: reads source CNXML to check list-item coverage vs 02-for-mt seg-ids (campaign 6b); writes nothing
      'verify-source-manifest.js', // read-only: recomputes hashes and diffs against the committed manifest
    ]);
    const touchers = readdirSync(TOOLS)
      .filter((f) => /\.c?js$/.test(f)) // .cjs too: a .cjs tool is invisible to endsWith('.js')
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
 * PROV-2 -- openstax-fetch.cjs is DELETED, and no ungated GitHub-raw CNXML
 * fetcher may reappear under tools/.
 * --> see CLAUDE.md "Never overwrite local OpenStax CNXML from upstream without
 *     double written consent" for the rule itself; nothing is restated here.
 *
 * WHY IT WAS DELETED [USER, 2026-09-04]. It was the last survivor of the retired
 * Matecat pipeline: added 2026-01-17 (187bf27b) to feed a CNXML->MD->XLIFF runner
 * and a Matecat client, all of which are gone. It had 0 callers. Its
 * --collection + --output-dir path wrote the chNN/<id>.cnxml shape while
 * consulting NONE of the four fail-closed licence gates in
 * tools/lib/source-refresh-policy.cjs that download-source.js -- the sanctioned
 * CNXML writer -- goes through.
 *
 * WHAT MADE IT WORTH A GUARD RATHER THAN A QUIET rm. Every fetch it made was
 * refused, because d6f05801 (F16) hardened two fetchers in one commit and gave
 * this one openstax.org|cnx.org -- the wrong host set for its own
 * raw.githubusercontent.com base -- while the server's openstaxFetcher.js got
 * the right one. So it was disarmed BY ACCIDENT, and it read like a one-word bug
 * with F16's own commit message appearing to license the fix. Measured: adding
 * githubusercontent.com to that allowlist fetched 43,015 bytes of real chemistry
 * CNXML on the first try. The tool was entirely functional.
 *
 * SO: if you are here because this test failed, something under tools/ can fetch
 * CNXML from GitHub again. That needs the licence gates wired in, or the
 * three-step written consent in CLAUDE.md -- not this assertion relaxed.
 */
describe('no ungated GitHub-raw CNXML fetcher under tools/ (PROV-2)', () => {
  it('openstax-fetch.cjs is gone', () => {
    expect(existsSync(path.join(TOOLS, 'openstax-fetch.cjs'))).toBe(false);
  });

  // Deliberately keyed on the HOST, not the filename: a re-introduction under any
  // name trips this. check-source-updates.js is the one classified fetcher -- it
  // compares against upstream and its write verb was removed by PROV-1 above.
  it('only the classified read-only checker names raw.githubusercontent', () => {
    const ALLOW = new Set(['check-source-updates.js']);
    const fetchers = readdirSync(TOOLS)
      .filter((f) => /\.c?js$/.test(f))
      .filter((f) => /raw\.githubusercontent/.test(readFileSync(path.join(TOOLS, f), 'utf8')));
    expect(fetchers.filter((f) => !ALLOW.has(f))).toEqual([]);
  });

  // Non-vacuity: the sweep must actually be looking at something. Without this,
  // an empty tools/ or a broken glob passes the assertion above silently.
  it('CONTROL: the classified fetcher is present and was seen by that sweep', () => {
    const seen = readdirSync(TOOLS)
      .filter((f) => /\.c?js$/.test(f))
      .filter((f) => /raw\.githubusercontent/.test(readFileSync(path.join(TOOLS, f), 'utf8')));
    expect(seen).toEqual(['check-source-updates.js']);
  });
});
