#!/usr/bin/env node
/**
 * Bounded exhaustive check of the glossary export's write gates.
 *
 * Drives the REAL `runGlossaryExport` (server/scripts/export-terminology.js) over every combination
 * of a fixed, finite input space — committed file × exported payload × book-layer ids × flags —
 * and checks, from the bytes on disk before and after each run, the rules in RULES below.
 * Nothing is modelled: every case is one real call into the exporter against a temp books/ tree.
 *
 * Why exhaustive enumeration and not random inputs: the input space is small and categorical, and
 * the defects this code has had (a committed `null`, an empty `--book`) were single points in it.
 * A random sampler can miss a single point; an enumeration cannot.
 *
 * The oracle never calls the code's own gate functions (detectProducer, *Verdict, sameTerms).
 * Each committed file carries its ground truth from the generator that built it. Only the two
 * ratio constants are imported, because their owner is glossaryExportDecision.js and copying the
 * digits here would let them drift.
 *
 * Usage (from the repo root):  node server/verification/glossary-export/check.js
 * Exit 0: every rule held, or failed only as a pinned known finding, and every rule was exercised.
 */
'use strict';

process.exitCode = 1; // a failure default: overwritten only when a verdict is reached

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runGlossaryExport } = require('../../scripts/export-terminology');
const {
  SHRINK_RATIO,
  GROWTH_RATIO,
  GROWTH_MIN_DELTA,
} = require('../../lib/glossaryExportDecision');
const { termsSha256 } = require('../../../tools/lib/glossary-terms-hash.cjs');

const SLUG = 'prufubok';
const RESOLVED = 'export-terminology-resolved';

// ── Rules ────────────────────────────────────────────────────────────────────────────────────────
// Each rule is a necessary condition for the committed glossary-unified.json to change.
const RULES = {
  NoCreate: 'A run never creates glossary-unified.json unless --adopt is given.',
  NoOverwriteUnreadable:
    'A run never replaces a committed file that is not a readable glossary object unless --adopt is given.',
  NoProducerSwap:
    'A run never replaces a file written by another producer (or none it can name) unless --adopt is given.',
  LayerSettled:
    'Changed terms are written only when the book layer did not move during the build and the committed stamp matches it (or --release-layer names the exact export).',
  NoHalving:
    'Changed terms never halve the approved or total count of a readable baseline unless --force is given.',
  NoExplosion:
    'Changed terms never explode the approved or total count of a readable baseline unless --force is given.',
  NoUnreviewedFirstPopulation:
    'An unattended run never writes terms onto a committed file that holds none (a first population is a decision).',
  RestampOnlyStamp:
    'When the terms do not change, only the bookLayer stamp may change, and only to the current layer id.',
  WritesWhatWasExported: 'When the terms change, the file holds exactly the exported terms.',
};

// Known findings, pinned NARROWLY: a rule may fail only on the committed-file variants listed
// for it. A failure on any other variant is BROKEN, so a pin cannot hide a new regression of the
// same rule. The check also fails if a pinned variant stops failing, so a fix removes its pin.
// Empty: the one finding (register §C249, a stamped baseline holding no terms) was fixed in the
// exporter, and its pins on NoOverwriteUnreadable and NoUnreviewedFirstPopulation were removed.
const KNOWN_FINDINGS = {};

// ── Generators (each output carries its ground truth) ────────────────────────────────────────────
/** mode: true = all approved, false = none, 'half' = every second one (approved and total then move apart). */
const isApproved = (i, mode) => (mode === 'half' ? i % 2 === 0 : mode);
const term = (i, mode, shape) => {
  const t = {
    english: `t${i}`,
    icelandic: `i${i}`,
    status: isApproved(i, mode) ? 'approved' : 'needs_review',
  };
  if (shape === 'resolved') t.domain = 'chemistry';
  if (shape === 'merge') Object.assign(t, { category: 'c', chapter: 1 });
  if (shape === 'old') t.subjects = ['chemistry'];
  if (shape === 'hybrid') Object.assign(t, { subjects: [], category: 'c' });
  return t;
};
const terms = (n, approvedAll, shape) =>
  Array.from({ length: n }, (_, i) => term(i, approvedAll, shape));

/** Committed-file variants. truth.readable = a JSON object (not array) with an array `terms`. */
function baselines() {
  const out = [];
  const nothing = (name, bytes, truth) => out.push({ name, bytes, truth });
  const unreadable = { readable: false, producer: null, total: 0, approved: 0 };
  // Every representation of "nothing" we could think of — the class this code broke on before.
  nothing('absent', null, { ...unreadable, absent: true });
  nothing('zero-bytes', '', unreadable);
  nothing('json-null', 'null', unreadable);
  nothing('json-array', '[]', unreadable);
  nothing('json-zero', '0', unreadable);
  nothing('json-string', '"x"', unreadable);
  nothing('not-json', '{', unreadable);
  nothing('empty-object', '{}', unreadable);
  nothing('terms-null', '{"terms":null}', unreadable);
  nothing('terms-empty-unstamped', '{"terms":[]}', {
    readable: true,
    producer: null,
    total: 0,
    approved: 0,
  });
  for (const stamp of [undefined, 5]) {
    const sfx = stamp === undefined ? '' : '+stamp5';
    const layer = stamp === undefined ? {} : { bookLayer: { lastChangeId: stamp } };
    nothing(
      `resolved-terms-empty${sfx}`,
      JSON.stringify({ producer: RESOLVED, ...layer, terms: [] }),
      { readable: true, producer: 'resolved', total: 0, approved: 0, stamp }
    );
    nothing(`resolved-no-terms${sfx}`, JSON.stringify({ producer: RESOLVED, ...layer }), {
      ...unreadable,
      stampedResolved: true,
      stamp,
    });
  }
  // Non-empty baselines, by producer shape.
  for (const n of [1, 200, 1000]) {
    for (const approvedAll of [true, false]) {
      const a = approvedAll ? n : 0;
      for (const stamp of [undefined, 3, 5]) {
        const layer = stamp === undefined ? {} : { bookLayer: { lastChangeId: stamp } };
        out.push({
          name: `resolved-${n}-${approvedAll ? 'appr' : 'rev'}-stamp${stamp}`,
          bytes: JSON.stringify({
            producer: RESOLVED,
            ...layer,
            terms: terms(n, approvedAll, 'resolved'),
          }),
          truth: { readable: true, producer: 'resolved', total: n, approved: a, stamp },
        });
      }
      const other = (name, obj, producer) =>
        out.push({
          name: `${name}-${n}-${approvedAll ? 'appr' : 'rev'}`,
          bytes: JSON.stringify(obj),
          truth: { readable: true, producer, total: n, approved: a },
        });
      other('merge', { terms: terms(n, approvedAll, 'merge') }, 'merge');
      other('old-unstamped', { terms: terms(n, approvedAll, 'old') }, 'old');
      other(
        'old-stamped',
        { producer: 'export-terminology', terms: terms(n, approvedAll, 'old') },
        'old'
      );
      other('hybrid', { terms: terms(n, approvedAll, 'hybrid') }, null);
      other('resolved-shape-unstamped', { terms: terms(n, approvedAll, 'resolved') }, null);
    }
  }
  return out;
}

/** Exported payloads: always the real producer's shape (resolvedGlossary.js stamps every one). */
function nexts() {
  const out = [];
  // Counts straddle each threshold for the baseline sizes 1, 200 and 1000 (halving at 0.5×,
  // explosion at 1.5× AND +GROWTH_MIN_DELTA), plus a same-size export (identical terms).
  for (const n of [0, 1, 99, 100, 101, 200, 201, 300, 301, 499, 500, 501, 1000, 1100, 1500, 1501]) {
    for (const approvedAll of [true, false, 'half']) {
      out.push({
        n,
        approved: Array.from({ length: n }, (_, i) => isApproved(i, approvedAll)).filter(Boolean)
          .length,
        payload: {
          producer: RESOLVED,
          generated: '2026-11-23T00:00:00.000Z',
          book: SLUG,
          stats: {},
          integrity: {},
          terms: terms(n, approvedAll, 'resolved'),
        },
      });
    }
  }
  return out;
}

const LAYERS = []; // [idBefore, idAfter]
for (const before of [null, 3, 5]) for (const after of [null, 3, 5]) LAYERS.push([before, after]);

const FLAGS = [
  { name: 'cron', force: false, adopt: false, release: null },
  { name: 'force', force: true, adopt: false, release: null },
  { name: 'adopt', force: false, adopt: true, release: null },
  { name: 'force+adopt', force: true, adopt: true, release: null },
  { name: 'release-right', force: false, adopt: false, release: 'right' },
  { name: 'release-wrong', force: false, adopt: false, release: 'wrong' },
];

// ── Oracle ───────────────────────────────────────────────────────────────────────────────────────
const halves = (prev, next) =>
  (prev.approved > 0 && next.approved < prev.approved * SHRINK_RATIO) ||
  (prev.total > 0 && next.total < prev.total * SHRINK_RATIO);
const explodes = (prev, next) => {
  const one = (p, x) => p > 0 && x > p * GROWTH_RATIO && x - p >= GROWTH_MIN_DELTA;
  return one(prev.approved, next.approved) || one(prev.total, next.total);
};
const norm = (v) => (v === undefined ? null : v);

/** Returns the names of the rules this one run broke. */
function judge({ truth, beforeBytes, afterBytes, next, idBefore, idAfter, flags, releaseHash }) {
  if (afterBytes === beforeBytes) return { broken: [], applied: [] };
  const broken = [];
  const applied = []; // rules whose precondition held on this byte-changing run
  const after = JSON.parse(afterBytes); // a write by the exporter is always valid JSON
  const beforeTerms = truth.readable ? JSON.stringify(JSON.parse(beforeBytes).terms) : null;
  const termsChanged = JSON.stringify(after.terms) !== beforeTerms;

  const rule = (name, applies, ok) => {
    if (!applies) return;
    applied.push(name);
    if (!ok) broken.push(name);
  };
  // Each of these only constrains runs without --adopt; their precondition is "no --adopt".
  rule('NoCreate', !flags.adopt, !truth.absent);
  rule('NoOverwriteUnreadable', !flags.adopt, truth.absent || truth.readable);
  rule('NoProducerSwap', !flags.adopt, !truth.readable || truth.producer === 'resolved');

  if (termsChanged) {
    const settled = idBefore === idAfter && norm(truth.stamp) === idBefore;
    const released =
      idBefore === idAfter && releaseHash !== null && releaseHash === termsSha256(next.payload);
    rule('LayerSettled', true, settled || released);
    // Counted from the bytes that landed, not from the generator's record of the export: an
    // earlier version read a field the record did not have, so the total-count half of both
    // rules never fired, and only a mutant on the total clause exposed it.
    const written = {
      total: after.terms.length,
      approved: after.terms.filter((t) => t && t.status === 'approved').length,
    };
    rule('NoHalving', truth.readable && !flags.force, !halves(truth, written));
    rule('NoExplosion', truth.readable && !flags.force, !explodes(truth, written));
    const unattended = !flags.force && !flags.adopt && flags.release === null;
    rule('NoUnreviewedFirstPopulation', unattended, truth.total > 0);
    rule(
      'WritesWhatWasExported',
      true,
      JSON.stringify(after.terms) === JSON.stringify(next.payload.terms)
    );
  } else {
    const before = JSON.parse(beforeBytes);
    const { bookLayer: a, ...afterRest } = after;
    const { bookLayer: b, ...beforeRest } = before;
    const ok =
      JSON.stringify(afterRest) === JSON.stringify(beforeRest) &&
      idBefore !== null &&
      a &&
      a.lastChangeId === idBefore &&
      JSON.stringify(a) !== JSON.stringify(b);
    rule('RestampOnlyStamp', true, ok);
  }
  return { broken, applied };
}

// ── Driver ───────────────────────────────────────────────────────────────────────────────────────
function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-verify-'));
  const books = path.join(root, 'books');
  const dir = path.join(books, SLUG, 'glossary');
  const file = path.join(dir, 'glossary-unified.json');
  fs.mkdirSync(dir, { recursive: true });

  const failures = {}; // rule → first counterexample outside its pin
  const pinnedSeen = {}; // rule → Set of pinned variants that did fail
  const failCounts = {};
  const exercised = {}; // rule → number of byte-changing runs the rule constrained
  let runs = 0;
  let writes = 0;
  const silent = () => {};

  const B = baselines();
  const N = nexts();
  // Run 2 is the next unattended tick after the database moved on: a fresh, larger export.
  const LATER = N.find((x) => x.n === 1000 && x.approved === 1000);
  try {
    for (const [bi, base] of B.entries()) {
      // Progress on stderr: the run takes minutes and the verdict prints only at the end.
      process.stderr.write(`[${bi + 1}/${B.length}] committed file "${base.name}"\n`);
      for (const nx of N) {
        for (const [idBefore, idAfter] of LAYERS) {
          for (const flags of FLAGS) {
            // Run 1 from the generated baseline, then run 2 unattended on whatever run 1 left.
            let truth = base.truth;
            let beforeBytes = base.bytes;
            let baseName = base.name; // run 2 starts from the exporter's own output
            for (let step = 1; step <= 2; step++) {
              const f = step === 1 ? flags : FLAGS[0];
              const ex = step === 1 ? nx : LATER;
              if (beforeBytes === null) fs.rmSync(file, { force: true });
              else fs.writeFileSync(file, beforeBytes);
              const releaseHash =
                f.release === 'right'
                  ? termsSha256(ex.payload)
                  : f.release === 'wrong'
                    ? 'f'.repeat(64)
                    : null;
              let calls = 0;
              runGlossaryExport({
                booksDir: books,
                projectRoot: root,
                exportFn: () => structuredClone(ex.payload),
                recordFn: () => null,
                subjectFn: () => 'chemistry',
                layerChangeIdFn: () => (calls++ === 0 ? idBefore : idAfter),
                book: f.release === null ? null : SLUG, // the CLI requires --book with --release-layer
                force: f.force,
                adopt: f.adopt,
                releaseLayer: releaseHash,
                nowMs: 1_800_000_000_000,
                log: silent,
                logError: silent,
              });
              runs++;
              const afterBytes = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
              if (afterBytes !== beforeBytes) {
                writes++;
                const { broken, applied } = judge({
                  truth,
                  beforeBytes,
                  afterBytes,
                  next: ex,
                  idBefore,
                  idAfter,
                  flags: f,
                  releaseHash,
                });
                for (const r of applied) exercised[r] = (exercised[r] || 0) + 1;
                for (const r of broken) {
                  if ((KNOWN_FINDINGS[r] || []).includes(baseName)) {
                    (pinnedSeen[r] = pinnedSeen[r] || new Set()).add(baseName);
                    continue;
                  }
                  failCounts[r] = (failCounts[r] || 0) + 1;
                  if (!failures[r])
                    failures[r] = {
                      baseline: baseName,
                      step,
                      flags: f.name,
                      idBefore,
                      idAfter,
                      exportedTerms: ex.n,
                      exportedApproved: ex.approved,
                    };
                }
                const after = JSON.parse(afterBytes);
                baseName = `exporter-output-${after.terms.length === 0 ? '0' : 'N'}-terms`;
                truth = {
                  readable: true,
                  producer: 'resolved',
                  total: after.terms.length,
                  approved: after.terms.filter((t) => t.status === 'approved').length,
                  stamp: after.bookLayer ? after.bookLayer.lastChangeId : undefined,
                };
              }
              // Run 2 only matters when run 1 changed the file: otherwise its state is the
              // generated baseline again, which the cron flag set already covers as run 1.
              if (afterBytes === beforeBytes) break;
              beforeBytes = afterBytes;
            }
          }
        }
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  // Positive control: a healthy unattended refresh must WRITE, or a harness that refuses
  // everything would pass every rule.
  const ctlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-verify-ctl-'));
  let controlWrote = false;
  try {
    const cdir = path.join(ctlRoot, 'books', SLUG, 'glossary');
    fs.mkdirSync(cdir, { recursive: true });
    const cfile = path.join(cdir, 'glossary-unified.json');
    const before = JSON.stringify({ producer: RESOLVED, terms: terms(1000, true, 'resolved') });
    fs.writeFileSync(cfile, before);
    runGlossaryExport({
      booksDir: path.join(ctlRoot, 'books'),
      projectRoot: ctlRoot,
      exportFn: () => ({
        producer: RESOLVED,
        generated: 'g',
        book: SLUG,
        stats: {},
        integrity: {},
        terms: terms(1100, true, 'resolved'),
      }),
      recordFn: () => null,
      subjectFn: () => 'chemistry',
      layerChangeIdFn: () => null,
      nowMs: 1_800_000_000_000,
      log: silent,
      logError: silent,
    });
    controlWrote = fs.readFileSync(cfile, 'utf8') !== before;
  } finally {
    fs.rmSync(ctlRoot, { recursive: true, force: true });
  }

  console.log(
    `Ran ${runs} real exporter calls (${B.length} committed files × ${N.length} exports × ${LAYERS.length} layer pairs × ${FLAGS.length} flag sets, plus an unattended second run, on a fresh 1000-term export, after each write); ${writes} changed the committed file.`
  );
  console.log(
    `Positive control (healthy unattended refresh writes): ${controlWrote ? 'ok' : 'FAILED'}`
  );
  let bad = !controlWrote;
  for (const [r, text] of Object.entries(RULES)) {
    const pins = KNOWN_FINDINGS[r] || [];
    const seen = pinnedSeen[r] || new Set();
    const unfixed = pins.filter((b) => seen.has(b));
    const fixed = pins.filter((b) => !seen.has(b));
    const verdict = failures[r]
      ? 'BROKEN'
      : unfixed.length
        ? 'holds except the pinned known finding'
        : 'holds';
    if (failures[r]) bad = true;
    console.log(`\n${r}: ${verdict}\n  ${text}`);
    if (unfixed.length) console.log(`  known finding still present on: ${unfixed.join(', ')}`);
    if (fixed.length) {
      console.log(
        `  pinned but no longer failing on: ${fixed.join(', ')} — if fixed on purpose, remove the pin`
      );
      bad = true;
    }
    if (failures[r]) {
      const c = failures[r];
      console.log(
        `  ${failCounts[r]} run(s). First example: committed file "${c.baseline}", run ${c.step} with ${c.flags} flags, ` +
          `layer id ${c.idBefore} before the build and ${c.idAfter} after, export of ${c.exportedTerms} terms (${c.exportedApproved} approved).`
      );
    }
    console.log(`  constrained ${exercised[r] || 0} file-changing run(s)`);
    if (!exercised[r]) {
      console.log('  NOT EXERCISED — no file-changing run met its precondition');
      bad = true;
    }
  }
  if (bad) {
    console.log('\nFAIL');
    process.exitCode = 1;
  } else {
    const pinned = Object.keys(KNOWN_FINDINGS).length > 0;
    console.log(
      `\nOK: rules hold, ${pinned ? 'known findings pinned' : 'no known findings pinned'}, positive control writes`
    );
    process.exitCode = 0;
  }
}

main();
