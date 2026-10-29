// Offer diff, 2026-10-26 ruling set vs 2026-10-29 ruling set (0 ISK, no network).
//
// WHAT IT COUNTS: for each ruling, the number of segments (work-list items) in which the AI term
// pass would offer it as a CANDIDATE, over every chapter of efnafraedi-2e, built with the runner's
// own buildWorkList and readChapterInputs. A candidate is a ruling whose English form occurs in the
// segment's prose (phrase precedence applied) and whose target is not already in the Icelandic.
// Then, for `heat` under the new set, a census of the English words around each "heat"/"heats"
// in those segments (read from 02-for-mt), to separate the noun from the verb and from compounds.
//
// BLIND SPOTS: it counts offers, not what the model would do with them; the heat census is a
// regex window (the word before, two after), grouped by hand in the register, not a parse.
// Reads layer 1 as committed in the working tree.
//
//   node experiments/terminology-consistency/results/2026-10-29/offer-diff-2026-10-29.mjs <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const out = process.argv[2];
if (!out) {
  process.stderr.write('usage: offer-diff-2026-10-29.mjs <out.json>\n');
  process.exitCode = 1;
} else {
  const { readChapterInputs } = await import(path.join(REPO, 'tools/ai-review/term-pass-apply.js'));
  const { buildWorkList } = await import(path.join(REPO, 'tools/ai-review/worklist.js'));
  const { loadRulingSet } = await import(path.join(REPO, 'tools/ai-review/ruling-set.js'));
  const D = 'experiments/terminology-consistency/results';
  const SETS = {
    old: `${D}/2026-10-26/ruling-set-2026-10-26.json`,
    new: `${D}/2026-10-29/ruling-set-2026-10-29.json`,
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
  const heatSegments = [];
  for (const ch of chapters) {
    const inputs = readChapterInputs({ bookDir, chapterDir: ch });
    const units = inputs.map((u) => ({ stem: u.stem, en: u.en, is: u.base.parsed }));
    for (const k of ['old', 'new']) {
      const wl = buildWorkList({ chapterDir: ch, units, rulings: [...sets[k].rulings] });
      totals[k].items += wl.counts.items;
      totals[k].pairs += wl.counts.pairs;
      for (const u of wl.units)
        for (const it of u.items)
          for (const id of it.candidateIds) {
            counts[k][id] = (counts[k][id] || 0) + 1;
            if (k === 'new' && id === 'heat')
              heatSegments.push({ ch, stem: u.stem, seg: it.segmentId });
          }
    }
  }
  const ids = [...new Set([...Object.keys(counts.old), ...Object.keys(counts.new)])];
  const changed = ids
    .map((id) => ({ id, old: counts.old[id] || 0, new: counts.new[id] || 0 }))
    .filter((r) => r.old !== r.new)
    .sort((a, b) => Math.abs(b.new - b.old) - Math.abs(a.new - a.old) || (a.id < b.id ? -1 : 1));

  const STOP = /^(the|of|a|and|in|is|to|as|by|that|this|or|be|its|with|from|no|more|for)\s+/;
  const heatPhrases = {};
  for (const { ch, stem, seg } of heatSegments) {
    const text = fs.readFileSync(
      path.join(bookDir, '02-for-mt', ch, `${stem}-segments.en.md`),
      'utf8'
    );
    const at = text.indexOf(`<!-- SEG:${seg} -->`);
    if (at < 0) continue;
    const next = text.indexOf('<!-- SEG:', at + 5);
    const body = text.slice(at, next > 0 ? next : undefined);
    for (const m of body.match(/\b(\w+\s+)?heats?\b(\s+\w+){0,2}/gi) || []) {
      const key = m.toLowerCase().replace(STOP, '').split(/\s+/).slice(0, 3).join(' ');
      heatPhrases[key] = (heatPhrases[key] || 0) + 1;
    }
  }
  const result = {
    sets: SETS,
    chapters: chapters.length,
    totals,
    changedOffers: changed,
    heat: {
      segments: heatSegments.length,
      phrases: Object.entries(heatPhrases)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([phrase, n]) => ({ phrase, n })),
    },
  };
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `wrote ${out}: ${changed.length} rulings changed offers; heat in ${heatSegments.length} segments\n`
  );
}
