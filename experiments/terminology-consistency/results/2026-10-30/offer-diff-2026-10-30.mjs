// Offer diff, 2026-10-29 ruling set vs 2026-10-30 ruling set (0 ISK, no network).
//
// WHAT IT COUNTS: for each ruling, the number of segments (work-list items) in which the AI term
// pass would offer it as a CANDIDATE, over every chapter of efnafraedi-2e, built with the runner's
// own buildWorkList and readChapterInputs (the same instrument as offer-diff-2026-10-29.mjs). A
// candidate is a ruling whose English form occurs in the segment's prose (phrase precedence
// applied) and whose target is not already in the Icelandic, or whose competitor is.
// Then, for the two amended rulings, the segments newly offered, each with the English forms that
// matched and whether its Icelandic already holds the old stems (millikraft-, sveig-) or the
// target's (millisameindakraft-, beyg-).
//
// PREDICTED BEFORE RUNNING (2026-10-30, from the decision record and a census of 02-for-mt
// against 02-mt-output): intermolecular-force +23 (the record's abbreviation-only segments, none
// carrying the ruled form); diffract 0 → 14 (15 segments carry a verb form, 1 already has beyg-,
// none mixes beyg- with sveig-); no other ruling changes.
//
// BLIND SPOTS: it counts offers, not what the model would do with them. The stem columns are
// substring tests on the lower-cased Icelandic, not a parse. Reads layer 1 as committed in the
// working tree.
//
//   node experiments/terminology-consistency/results/2026-10-30/offer-diff-2026-10-30.mjs <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const out = process.argv[2];
if (!out) {
  process.stderr.write('usage: offer-diff-2026-10-30.mjs <out.json>\n');
  process.exitCode = 1;
} else {
  const { readChapterInputs } = await import(path.join(REPO, 'tools/ai-review/term-pass-apply.js'));
  const { buildWorkList } = await import(path.join(REPO, 'tools/ai-review/worklist.js'));
  const { loadRulingSet } = await import(path.join(REPO, 'tools/ai-review/ruling-set.js'));
  const { usesHeadword } = await import(path.join(REPO, 'tools/lib/chapter-term-check.js'));
  const { visibleProse, foldHyphens } = await import(path.join(REPO, 'tools/ai-review/tokens.js'));
  const D = 'experiments/terminology-consistency/results';
  const SETS = {
    old: `${D}/2026-10-29/ruling-set-2026-10-29.json`,
    new: `${D}/2026-10-30/ruling-set-2026-10-30.json`,
  };
  const WATCH = {
    'intermolecular-force': { old: 'millikraft', target: 'millisameindakraft' },
    diffract: { old: 'sveig', target: 'beyg' },
  };
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

  const byId = new Map(sets.new.rulings.map((r) => [r.id, r]));
  const watched = {};
  for (const [id, stems] of Object.entries(WATCH)) {
    const forms = byId.get(id).en;
    const rows = [...offered.new]
      .filter((key) => key.startsWith(`${id} `) && !offered.old.has(key))
      .map((key) => {
        const [, ch, seg] = key.split(' ');
        const occ = occOf.get(`${ch} ${seg}`);
        const prose = foldHyphens(visibleProse(occ.en));
        const is = occ.is.toLowerCase();
        return {
          ch,
          seg,
          matchedForms: forms.filter((f) => usesHeadword(foldHyphens(f), prose)),
          isHasOld: is.includes(stems.old),
          isHasTarget: is.includes(stems.target),
        };
      })
      .sort((a, b) => (a.ch + a.seg < b.ch + b.seg ? -1 : 1));
    const formTally = {};
    for (const r of rows) for (const f of r.matchedForms) formTally[f] = (formTally[f] || 0) + 1;
    watched[id] = {
      newlyOffered: rows.length,
      isHasOld: rows.filter((r) => r.isHasOld).length,
      isHasTarget: rows.filter((r) => r.isHasTarget).length,
      formTally,
      segments: rows,
    };
  }
  const result = { sets: SETS, chapters: chapters.length, totals, changedOffers: changed, watched };
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `wrote ${out}: ${changed.length} rulings changed offers; ` +
      Object.entries(watched)
        .map(([id, w]) => `${id} +${w.newlyOffered}`)
        .join(', ') +
      '\n'
  );
}
