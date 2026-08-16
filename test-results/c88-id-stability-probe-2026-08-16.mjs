#!/usr/bin/env node
/**
 * §C88 id-stability probe — does inserting ONE segment renumber existing seg-ids?
 *
 * This is the measurement §C88's blocking ruling rests on. Run it from the repo root:
 *   node test-results/c88-id-stability-probe-2026-08-16.mjs
 *
 * ⚠️ IT COMPARES THE id -> TEXT MAPPING, NOT THE id SET, AND THAT DISTINCTION IS THE
 * WHOLE POINT. The first version of this probe compared sets and reported "2 ids
 * changed" — the true answer was 1,404. `auto-3 … auto-1484` exist in BOTH sets,
 * bolted onto different content: the set barely moves while the mapping shears by
 * one across the module. A set comparison here is the right property measured with
 * the wrong instrument, and it nearly relaxed a blocking constraint.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const MODULE = process.argv[2] || 'books/efnafraedi-2e/01-source/appendices/m68865.cnxml';
const PROBE = path.join(ROOT, 'tools', '.probe-c88-idshift.mjs');

// An out-of-tree copy of the extractor with ONE extra addSegment inserted, simulating
// a C88 emitter. Out-of-tree because this repo forbids mutating a tracked file.
execSync(`git show HEAD:tools/cnxml-extract.js > ${PROBE}`, { shell: '/bin/bash' });
const anchor = '  // Extract document title';
const src = fs.readFileSync(PROBE, 'utf8');
if (!src.includes(anchor)) throw new Error('anchor not found — extractor changed shape');
fs.writeFileSync(
  PROBE,
  src.replace(anchor, `  addSegment('alt', 'SIMULATED C88 ALT', 'c88-sim-alt');\n${anchor}`)
);

try {
  const base = await import(path.join(ROOT, 'tools', 'cnxml-extract.js'));
  const plus = await import(PROBE);
  const cnxml = fs.readFileSync(path.join(ROOT, MODULE), 'utf8');
  const A = new Map(base.extractSegments(cnxml).segments.map((s) => [s.id, s.text]));
  const B = new Map(plus.extractSegments(cnxml).segments.map((s) => [s.id, s.text]));

  let same = 0;
  let moved = 0;
  let gone = 0;
  for (const [id, text] of A) {
    if (!B.has(id)) gone++;
    else if (B.get(id) === text) same++;
    else moved++;
  }
  console.log(`module: ${path.basename(MODULE)}  (${A.size} segments)`);
  console.log(`  unchanged                      : ${same}`);
  console.log(`  POINTING AT DIFFERENT TEXT     : ${moved}   <-- the real damage`);
  console.log(`  gone entirely                  : ${gone}`);
  console.log(
    `\n  id-SET difference would report only ${gone} changed — which is why this probe compares the MAPPING.`
  );
} finally {
  fs.rmSync(PROBE, { force: true });
}
