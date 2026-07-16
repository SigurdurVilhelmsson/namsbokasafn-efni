import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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
      'exercise-assemble.js', // no-op: docstring states "Never touches 01-source" but never reads/writes it — everything rides the 02-structure skeleton sidecar (item 9 D3)
      'exercise-extract.js', // read-only: reads the exercises cache; writes only 02-for-mt/02-structure (item 9 D3)
      'generate-image-mapping.js', // read-only: scans source CNXML for image basenames; writes book-level media/image-mapping.json
      'generate-source-manifest.js', // writes: the .source-manifest.json provenance file (not CNXML)
      'inventory-math-labels.js', // read-only: scans source math text; docstring states "Never writes under 01-source/"
      'preintake-probe.js', // read-only: probes source dir at intake, no writes
      'repair-emphasis.js', // read-only: reads source CNXML only as a fidelity-guard baseline; writes land in 03-translated/
      'resolve-embeds.js', // read-only: scans source CNXML for iframe embeds; writes a book-root embed-mapping.json
      'resolve-os-embed.js', // writes: downloads exercise JSON + images into 01-source/exercises,media (not CNXML)
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
