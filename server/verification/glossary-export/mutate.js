#!/usr/bin/env node
/**
 * Proves check.js can fail: applies each mutant below to the real code, runs the check, and
 * records which rules it reported BROKEN. Every mutant must make the check exit non-zero.
 *
 * Restores follow CLAUDE.md's mutation-test rule: a golden copy of each target is taken BEFORE
 * the first mutation (in the system temp dir, never the repo), every round restores from it and
 * compares the bytes, and a final restore runs even if a round dies. Never restore with
 * `git checkout --` or `git stash`: both can discard uncommitted work.
 *
 * Usage (any cwd; takes about 3 minutes per mutant, so run it in the background):
 *   node server/verification/glossary-export/mutate.js            # every mutant
 *   node server/verification/glossary-export/mutate.js '§C249'    # labels containing the text
 * Exit 0 only if every mutant was caught and every target was restored byte for byte.
 */
'use strict';

process.exitCode = 1;

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Resolved against this file, never the cwd (CLAUDE.md § resolve resource paths against something
// intrinsic): run from server/ instead of the repo root, a relative path would miss its targets.
const SERVER = path.resolve(__dirname, '..', '..');
const CHECK = path.join(__dirname, 'check.js');
const EXPORTER = path.join(SERVER, 'scripts', 'export-terminology.js');
const DECISION = path.join(SERVER, 'lib', 'glossaryExportDecision.js');
const PRODUCER = path.join(SERVER, 'lib', 'glossaryProducer.js');

// [label, file, exact text (must occur once), replacement, rule(s) expected BROKEN]
const MUTANTS = [
  [
    'readExisting lets a committed null through',
    EXPORTER,
    "if (parsed === null || typeof parsed !== 'object') return { kind: 'corrupt' };",
    "if (typeof parsed !== 'object') return { kind: 'corrupt' };",
    'NoOverwriteUnreadable',
  ],
  [
    '--force crosses the absent-baseline gate',
    EXPORTER,
    "if (existing.kind === 'absent' && !adopt) {",
    "if (existing.kind === 'absent' && !adopt && !force) {",
    'NoCreate',
  ],
  [
    '--adopt crosses the shrink gate',
    EXPORTER,
    'if (verdict.refuse && !force) {',
    'if (verdict.refuse && !(force || adopt)) {',
    'NoHalving',
  ],
  [
    '--force crosses the producer gate',
    EXPORTER,
    'if (pv.refuse && !adopt) {',
    'if (pv.refuse && !adopt && !force) {',
    'NoProducerSwap',
  ],
  [
    'a change during the build no longer holds',
    EXPORTER,
    'changedDuringBuild || restampable || (layerId === null && stamp !== undefined);',
    'restampable || (layerId === null && stamp !== undefined);',
    'LayerSettled',
  ],
  [
    'growth gate removed',
    EXPORTER,
    'if (growth.refuse && !force) {',
    'if (false) {',
    'NoExplosion',
  ],
  [
    'restamp writes the wrong id',
    EXPORTER,
    'const restamped = { ...prev, [STAMP_KEY]: { lastChangeId: layerId } };',
    'const restamped = { ...prev, [STAMP_KEY]: { lastChangeId: layerId + 1 } };',
    'RestampOnlyStamp',
  ],
  [
    '--force crosses the unreadable-file gate',
    EXPORTER,
    "if (existing.kind === 'corrupt' && !adopt) {",
    "if (existing.kind === 'corrupt' && !adopt && !force) {",
    'NoOverwriteUnreadable',
  ],
  [
    'the write drops a term',
    EXPORTER,
    "fs.writeFileSync(outPath, persisted, 'utf-8');",
    "fs.writeFileSync(outPath, serializePayload({ ...next, terms: next.terms.slice(1) }, layerId), 'utf-8');",
    'WritesWhatWasExported',
  ],
  [
    'any --release-layer value releases a hold',
    EXPORTER,
    'layerMoved && !changedDuringBuild && releaseLayer !== null && releaseLayer === hash;',
    'layerMoved && !changedDuringBuild && releaseLayer !== null;',
    'LayerSettled',
  ],
  [
    'shrink measured on approved terms only',
    DECISION,
    '(prevTotal > 0 && nextTotal < prevTotal * SHRINK_RATIO);',
    'false;',
    'NoHalving',
  ],
  [
    'an unidentifiable file is taken for the resolved producer',
    PRODUCER,
    '  return PRODUCER_UNKNOWN;\n}',
    '  return PRODUCER_RESOLVED;\n}',
    'NoProducerSwap',
  ],
  [
    '§C249: a baseline holding no terms is not treated as absent',
    EXPORTER,
    'if (emptyBaseline && !adopt) {',
    'if (false) {',
    'NoUnreviewedFirstPopulation',
  ],
  [
    '§C249: a stamped file with no terms array is replaced by an empty export',
    EXPORTER,
    '(!prevHasTermsArray || countTerms(next) > 0);',
    'countTerms(next) > 0;',
    'NoOverwriteUnreadable',
  ],
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-mutate-'));
const goldens = {};
for (const f of new Set(MUTANTS.map((m) => m[1]))) {
  goldens[f] = path.join(tmp, path.basename(f));
  fs.copyFileSync(f, goldens[f]);
}
const restoreAll = () =>
  Object.entries(goldens).every(([f, g]) => {
    fs.copyFileSync(g, f);
    return fs.readFileSync(f).equals(fs.readFileSync(g));
  });

let allCaught = true;
let restored = true;
try {
  // Optional filter: only mutants whose label contains this text (e.g. `§C249`).
  const only = process.argv[2];
  const chosen = only ? MUTANTS.filter((m) => m[0].includes(only)) : MUTANTS;
  if (chosen.length === 0) {
    console.log(`no mutant label contains "${only}"`);
    allCaught = false;
  }
  for (const [label, file, from, to, expected] of chosen) {
    const src = fs.readFileSync(goldens[file], 'utf8');
    const n = src.split(from).length - 1;
    if (n !== 1) {
      console.log(`${label}: anchor found ${n} times in ${file} — update the mutant`);
      allCaught = false;
      continue;
    }
    fs.writeFileSync(file, src.replace(from, to));
    const r = spawnSync(process.execPath, [CHECK], {
      encoding: 'utf8',
      timeout: 900_000,
    });
    restored = restoreAll() && restored;
    const broken = (r.stdout || '')
      .split('\n')
      .filter((l) => /: BROKEN$/.test(l))
      .map((l) => l.split(':')[0]);
    const caught = r.status !== 0 && broken.includes(expected);
    if (!caught) allCaught = false;
    console.log(
      `${caught ? 'caught' : 'MISSED'}  ${label} (${path.basename(file)}): exit ${r.status}, ` +
        `BROKEN [${broken.join(', ')}], expected ${expected}`
    );
  }
} finally {
  restored = restoreAll() && restored;
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`targets restored byte for byte: ${restored ? 'yes' : 'NO — check git status now'}`);
process.exitCode = allCaught && restored ? 0 : 1;
