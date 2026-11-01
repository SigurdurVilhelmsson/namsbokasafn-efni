// Offer diff, 2026-11-01 ruling set vs 2026-11-02 ruling set (0 ISK, no network).
//
// WHAT IT COUNTS: for each ruling, the number of segments (work-list items) in which the AI term
// pass would offer it as a CANDIDATE, over every chapter of efnafraedi-2e, built with the runner's
// own buildWorkList and readChapterInputs (the instrument of offer-diff-2026-10-30.mjs). A ruling
// with a sense is a candidate wherever it matches, because the model must judge the sense
// (worklist.js needsReview); an unsensed one only where the Icelandic lacks the target or holds a
// competitor. Then, for stoichiometry, the segments newly offered and whether their Icelandic
// already carries the target's stem (hlutfallaefnafr).
//
// PREDICTED BEFORE RUNNING (2026-11-01, from the stoichiometry census in
// ../2026-11-01/stoichiometry-census/, which used the same matching on the same inputs):
// stoichiometry 74 → 78, the four matching segments that already carry hlutfallaefnafræði (the ch04
// chapter title, the ch04 section title m68713, the ch09 section title m68752 and its list item in
// m68748) becoming candidates; no other ruling changes, because the 2026-11-02 set differs from the
// 2026-11-01 set only in stoichiometry's sense.
//
// BLIND SPOTS: it counts offers, not what the model would do with them (in the ratio sense it should
// make no edit). The stem column is a substring test on the lower-cased Icelandic, not a parse.
// Reads layer 1 as committed in the working tree.
//
//   node experiments/terminology-consistency/results/2026-11-02/offer-diff-2026-11-02.mjs <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const out = process.argv[2];
if (!out) {
  process.stderr.write('usage: offer-diff-2026-11-02.mjs <out.json>\n');
  process.exitCode = 1;
} else {
  const { readChapterInputs } = await import(path.join(REPO, 'tools/ai-review/term-pass-apply.js'));
  const { buildWorkList } = await import(path.join(REPO, 'tools/ai-review/worklist.js'));
  const { loadRulingSet } = await import(path.join(REPO, 'tools/ai-review/ruling-set.js'));
  const D = 'experiments/terminology-consistency/results';
  const SETS = {
    old: `${D}/2026-11-01/ruling-set-2026-11-01.json`,
    new: `${D}/2026-11-02/ruling-set-2026-11-02.json`,
  };
  const WATCH = { id: 'stoichiometry', stem: 'hlutfallaefnafr' };
  const sets = Object.fromEntries(
    Object.entries(SETS).map(([k, p]) => [k, loadRulingSet(path.join(REPO, p))])
  );
  const bookDir = path.join(REPO, 'books/efnafraedi-2e');
  const chapters = fs
    .readdirSync(path.join(bookDir, '02-mt-output'))
    .filter((d) => /^(ch\d\d|appendices)$/.test(d))
    .sort();
  const counts = { old: {}, new: {} };
  const totals = { old: { items: 0, pairs: 0 }, new: { items: 0, pairs: 0 } };
  const offered = { old: new Set(), new: new Set() }; // `${id} ${ch} ${segmentId}`
  const occOf = new Map(); // `${ch} ${segmentId}` → first occurrence {en, is}
  for (const ch of chapters) {
    const inputs = readChapterInputs({ bookDir, chapterDir: ch });
    const units = inputs.map((u) => ({ stem: u.stem, en: u.en, is: u.base.parsed }));
    for (const k of ['old', 'new']) {
      const wl = buildWorkList({ chapterDir: ch, units, rulings: [...sets[k].rulings] });
      totals[k].items += wl.counts.items;
      totals[k].pairs += wl.counts.pairs;
      for (const u of wl.units)
        for (const it of u.items) {
          occOf.set(`${ch} ${it.segmentId}`, it.occurrences[0]);
          for (const id of it.candidateIds) {
            counts[k][id] = (counts[k][id] || 0) + 1;
            offered[k].add(`${id} ${ch} ${it.segmentId}`);
          }
        }
    }
  }
  const ids = [...new Set([...Object.keys(counts.old), ...Object.keys(counts.new)])];
  const changed = ids
    .map((id) => ({ id, old: counts.old[id] || 0, new: counts.new[id] || 0 }))
    .filter((r) => r.old !== r.new)
    .sort((a, b) => Math.abs(b.new - b.old) - Math.abs(a.new - a.old) || (a.id < b.id ? -1 : 1));
  const delta = (k1, k2) =>
    [...offered[k1]]
      .filter((key) => key.startsWith(`${WATCH.id} `) && !offered[k2].has(key))
      .map((key) => {
        const [, ch, seg] = key.split(' ');
        const occ = occOf.get(`${ch} ${seg}`);
        return { ch, seg, isHasTarget: occ.is.toLowerCase().includes(WATCH.stem) };
      })
      .sort((a, b) => (a.ch + a.seg < b.ch + b.seg ? -1 : 1));
  const watched = {
    id: WATCH.id,
    old: counts.old[WATCH.id] || 0,
    new: counts.new[WATCH.id] || 0,
    newlyOffered: delta('new', 'old'),
    noLongerOffered: delta('old', 'new'),
  };
  const result = { sets: SETS, chapters: chapters.length, totals, changedOffers: changed, watched };
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `wrote ${out}: ${changed.length} rulings changed offers; ${WATCH.id} ${watched.old} → ${watched.new} ` +
      `(+${watched.newlyOffered.length}, −${watched.noLongerOffered.length})\n`
  );
}
