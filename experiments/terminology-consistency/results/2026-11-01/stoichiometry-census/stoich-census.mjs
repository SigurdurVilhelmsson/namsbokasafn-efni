// Read-only census: every English occurrence of stoichiometr* in efnafraedi-2e, on the same
// inputs (layer 1 + overlay, 02-for-mt EN) and with the same matching the term pass uses.
// Usage: node stoich-census.mjs <repoRoot> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repoRoot, outFile] = process.argv.slice(2);
process.exitCode = 1;
const imp = (p) => import(pathToFileURL(path.join(repoRoot, p)).href);
const { readChapterInputs } = await imp('tools/ai-review/term-pass-apply.js');
const { resolveChapters, BOOK } = await imp('tools/ai-review/term-pass.js');
const { matchesOccurrence, isCandidate, isEligible } = await imp('tools/ai-review/worklist.js');
const { loadRulingSet } = await imp('tools/ai-review/ruling-set.js');

// Pinned to the set the census ran against on 2026-11-01. It read the runner's default then, and the
// default has since moved to a set that carries the ruling this census motivated.
const RULING_SET = 'experiments/terminology-consistency/results/2026-11-01/ruling-set-2026-11-01.json';
const rs = loadRulingSet(path.join(repoRoot, RULING_SET));
const pool = rs.rulings;
const stoichRulings = pool.filter((r) => r.en.some((f) => /stoichiometr/i.test(f)));
const main = rs.byId.get('stoichiometry');
const bookDir = path.join(repoRoot, 'books', BOOK);
const chapters = resolveChapters({ bookDir, all: true });

const rows = [];
let enRecordHits = 0;
for (const chapterDir of chapters) {
  for (const u of readChapterInputs({ bookDir, chapterDir })) {
    // Every EN record mentioning the stem, whether or not it was paired (control for skips).
    const enHits = u.en.records.filter((r) => /stoichiometr/i.test(r.body));
    enRecordHits += enHits.length;
    const paired = new Map();
    for (const item of u.pair.items) for (const o of item.occurrences) paired.set(o.key, o);
    const skipped = new Map(u.pair.skipped.skippedKeys.map((s) => [s.key, s.reason]));
    for (const r of enHits) {
      const occ = paired.get(r.key);
      const words = [...r.body.matchAll(/\b[Ss]toichiometr\w*/g)].map((m) => m[0]);
      const row = {
        chapterDir,
        stem: u.stem,
        key: r.key,
        words,
        en: r.body,
        is: occ ? occ.is : null,
        skipped: occ ? null : (skipped.get(r.key) ?? 'unpaired'),
        matching: occ ? stoichRulings.filter((x) => matchesOccurrence(x, occ, pool)).map((x) => x.id) : [],
        stoichEligible: isEligible(main, chapterDir),
        stoichCandidate: occ ? isCandidate(main, occ, chapterDir, pool) : false,
      };
      rows.push(row);
    }
  }
}
fs.writeFileSync(
  outFile,
  JSON.stringify({ rulingSet: RULING_SET, sha256: rs.sha256, stoichRulings, enRecordHits, rows }, null, 1)
);
console.log(`EN records with stoichiometr*: ${enRecordHits}; rows written: ${rows.length}`);
console.log(`rulings with a stoichiometr* form: ${stoichRulings.map((r) => `${r.id} → ${r.is}`).join('; ')}`);
process.exitCode = 0;
