// SD3 baseline, public copy (0 ISK, no network).
//
// INPUT: the full snapshot written by `server/scripts/snapshot-ruling-stores.js` on production,
// 2026-10-31 (kept privately; its sha256 is recorded below and in the register). [USER] ruled the
// same day that the public repo carries it WITHOUT the Íðorðabankinn concept-term rows: their
// re-release has not been checked.
//
// WHAT IT CHANGES, and nothing else:
//   - stores.conceptModel.terms keeps only rows whose `source` is not `idordabankinn`;
//   - stores.conceptModel.omitted records the dropped rows' count and sha256, hashed the way the
//     snapshot tool hashes (sha256 of JSON.stringify, rows in their original order);
//   - publicCopy records the full file's sha256 and this script's path;
//   - sd3 adds the rulings dated before S that the tool cannot read: the snapshot counts the
//     2026-10-11 compiled set, and the 2026-10-29 / 2026-10-30 rulings live in the 2026-10-30 set,
//     whose shape (`rulings`) the tool's `stage1` / `before` reading would count as empty.
// stores.conceptModel.sha256 is the tool's own hash over ALL concepts and terms; it can be checked
// only against the full file. Every other hash in the file can be recomputed from this copy.
//
// Run from the repository root:
//   node experiments/terminology-consistency/results/2026-10-31/sd3-baseline-public.mjs <full.json> \
//     > experiments/terminology-consistency/results/2026-10-31/sd3-ruling-snapshot-efnafraedi-2e-2026-10-31.json
import fs from 'node:fs';
import crypto from 'node:crypto';

const LATER_SET = 'experiments/terminology-consistency/results/2026-10-30/ruling-set-2026-10-30.json';
const OMIT_SOURCE = 'idordabankinn';
const SELF = 'experiments/terminology-consistency/results/2026-10-31/sd3-baseline-public.mjs';

process.exitCode = 1; // a run that reaches no verdict must not read as success
const fullPath = process.argv[2];
if (!fullPath || process.argv.length !== 3) {
  console.error('usage: sd3-baseline-public.mjs <full snapshot json>');
  process.exitCode = 2;
} else {
  const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
  const hash = (value) => sha(JSON.stringify(value)); // the snapshot tool's hash
  const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' '); // the tool's norm

  const fullBytes = fs.readFileSync(fullPath);
  const snap = JSON.parse(fullBytes.toString('utf8'));
  const cm = snap.stores.conceptModel;

  const kept = cm.terms.filter((t) => t.source !== OMIT_SOURCE);
  const omitted = cm.terms.filter((t) => t.source === OMIT_SOURCE);
  if (kept.length + omitted.length !== cm.termCount) throw new Error('row count does not add up');
  if (omitted.length === 0) throw new Error(`no ${OMIT_SOURCE} rows found: wrong input?`);

  const laterBytes = fs.readFileSync(LATER_SET);
  const later = JSON.parse(laterBytes.toString('utf8'));
  const have = new Set(snap.derived.rulingHeadwords.headwords);
  const laterHeadwords = [...new Set(later.rulings.map((r) => norm(r.enNorm)))];
  if (laterHeadwords.length === 0) throw new Error('the later set has no rulings: wrong shape?');
  const added = laterHeadwords.filter((h) => !have.has(h)).sort();
  const union = new Set([...have, ...laterHeadwords]);

  const out = {
    ...snap,
    publicCopy: {
      note:
        'Reduced copy of the SD3 baseline snapshot: the Íðorðabankinn concept-term rows are ' +
        'replaced by their count and sha256 ([USER] 2026-10-31; their re-release is unchecked). ' +
        'The full file is kept privately, in three verified copies.',
      fullFileSha256: sha(fullBytes),
      reducedBy: SELF,
    },
    stores: {
      ...snap.stores,
      conceptModel: {
        ...cm,
        terms: kept,
        omitted: {
          source: OMIT_SOURCE,
          count: omitted.length,
          sha256: hash(omitted),
          note: 'sha256 of JSON.stringify(rows), in the full file\'s order, as the snapshot tool hashes',
        },
      },
    },
    sd3: {
      rule:
        'Skerfur plan SD3: a ruling dated before S counts in the baseline whether or not it has ' +
        'been applied yet.',
      toolHeadwords: have.size,
      laterRulingSet: { path: LATER_SET, sha256: sha(laterBytes), rulings: later.rulings.length },
      addedHeadwords: { count: added.length, headwords: added },
      headwordsWithARulingBeforeS: union.size,
      committeeConfirmed: snap.derived.committeeConfirmed,
    },
  };
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
  console.error(
    `public copy: kept ${kept.length} concept-term rows, omitted ${omitted.length} ` +
      `(${OMIT_SOURCE}); headwords ${have.size} + ${added.length} later = ${union.size}`
  );
  process.exitCode = 0;
}
