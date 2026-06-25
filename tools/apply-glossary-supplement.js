#!/usr/bin/env node

/**
 * apply-glossary-supplement.js
 *
 * Applies a durable curation layer on top of generate-glossary.js output.
 *
 * WHY THIS EXISTS
 * ---------------
 * generate-glossary.js extracts glossary entries from the translated CNXML
 * `<glossary>` blocks. Two classes of term are therefore invisible to it and
 * must be supplied out-of-band, or they silently vanish on every regeneration:
 *
 *   1. Terms whose inline `<dfn class="term">` appears in the body but whose
 *      definition was never in (or was dropped from) the CNXML `<glossary>`
 *      during re-translation — e.g. `vermi (e. enthalpy)`, `varmi (e. heat)`.
 *      Without these the reader's hover tooltip has nothing to match.
 *   2. Hand-authored synonyms (`alternateEnglish`) needed because the inline
 *      English annotation `(e. ...)` uses a synonym of the glossary headword's
 *      primary English — e.g. inline "significant digits" vs glossary
 *      "significant figures".
 *
 * Previously this curation lived only as ad-hoc hand-edits to glossary.json
 * (commit 4d8ba9df), so the next `generate-glossary.js` run destroyed it. This
 * tool makes the curation a committed, idempotent artifact instead.
 *
 * The supplement file shape (books/<book>/glossary-supplement.json):
 *   {
 *     "add": [ { term, definition, chapter, english?, alternateEnglish? }, ... ],
 *     "graftAlternateEnglish": [ { english, alternateEnglish: [...] }, ... ],
 *     "correctHeadword": [ { english, term }, ... ]
 *   }
 *
 * Merge policy (matches the vefur tooltip matcher in glossaryTerms.ts):
 *   - correctHeadword: rename a generated entry's Icelandic headword in place,
 *     keyed by English (parenthetical-insensitive). For documented terminology
 *     corrections where MT deviated from the approved Íðorðabanki term — e.g. ch5
 *     MT produced `entalpía` for enthalpy where Íðorðabanki (and the body text)
 *     use `vermi`. Interim until the source translation is fixed via Pass-1
 *     review; renames in place (no duplicate) so the glossary realigns with the
 *     body and the tooltip resolves. No-op if the generated entry is absent.
 *   - graft: for each graft entry, find the generated term whose primary
 *     `english` matches (case-insensitive) and union in the alternateEnglish
 *     synonyms. No-op if the generated entry is absent.
 *   - add: append an entry ONLY if neither its Icelandic headword nor its
 *     English (incl. "head (parenthetical)" composite parts) is already covered
 *     by the generated output. This keeps the current CNXML definition
 *     authoritative and rescues only what is genuinely missing — so re-running
 *     after the CNXML regains a term does not create a stale duplicate.
 *   - dedup by lowercased Icelandic headword (generated/current wins), then
 *     re-sort by Icelandic collation.
 *
 * Order: correctHeadword and graft run first (they mutate generated entries),
 * then add (which tests coverage against the corrected set).
 *
 * Usage:
 *   node tools/apply-glossary-supplement.js --book efnafraedi-2e
 *   node tools/apply-glossary-supplement.js --in <glossary.json> --supplement <s.json> --out <glossary.json>
 */

import fs from 'fs';
import path from 'path';

const BOOKS_DIR = 'books';

function parseArgs(args) {
  const r = {
    book: null,
    in: null,
    supplement: null,
    out: null,
    track: 'mt-preview',
    verbose: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') r.help = true;
    else if (a === '--verbose') r.verbose = true;
    else if (a === '--book' && args[i + 1]) r.book = args[++i];
    else if (a === '--in' && args[i + 1]) r.in = args[++i];
    else if (a === '--supplement' && args[i + 1]) r.supplement = args[++i];
    else if (a === '--out' && args[i + 1]) r.out = args[++i];
    else if (a === '--track' && args[i + 1]) r.track = args[++i];
  }
  return r;
}

const lc = (s) => (s || '').toLowerCase().trim();

/** Split "head (parenthetical)" into ["head", "parenthetical"], else []. */
function splitCompositeParts(text) {
  const m = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  return m ? [m[1].trim(), m[2].trim()] : [];
}

export function applySupplement(generated, supplement, { verbose = false, log = () => {} } = {}) {
  const terms = generated.terms.map((t) => ({ ...t }));

  // Index generated output by Icelandic headword and by English (incl. composite parts).
  const termKeys = new Set();
  const enKeys = new Set();
  const byEn = new Map();
  for (const t of terms) {
    termKeys.add(lc(t.term));
    for (const p of splitCompositeParts(t.term)) termKeys.add(lc(p));
    if (t.english) {
      enKeys.add(lc(t.english));
      if (!byEn.has(lc(t.english))) byEn.set(lc(t.english), t);
      for (const p of splitCompositeParts(t.english)) enKeys.add(lc(p));
    }
  }

  // English lookup that tolerates a differing parenthetical symbol
  // (e.g. supplement "enthalpy" vs generated "enthalpy (h)").
  const enBase = (s) =>
    lc(s)
      .replace(/\(.*?\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const byEnBase = new Map();
  for (const t of terms)
    if (t.english && !byEnBase.has(enBase(t.english))) byEnBase.set(enBase(t.english), t);

  let corrected = 0;
  for (const c of supplement.correctHeadword || []) {
    const target = byEn.get(lc(c.english)) || byEnBase.get(enBase(c.english));
    if (!target || !c.term || target.term === c.term) continue;
    target.term = c.term;
    corrected++;
  }

  let grafted = 0;
  for (const g of supplement.graftAlternateEnglish || []) {
    const target = byEn.get(lc(g.english));
    if (!target) continue;
    const cur = new Set(target.alternateEnglish || []);
    let added = false;
    for (const a of g.alternateEnglish || [])
      if (!cur.has(a)) {
        cur.add(a);
        added = true;
      }
    if (added) {
      target.alternateEnglish = [...cur];
      grafted++;
    }
  }

  let added = 0;
  for (const e of supplement.add || []) {
    const coveredByTerm = termKeys.has(lc(e.term));
    const coveredByEn = e.english && enKeys.has(lc(e.english));
    if (coveredByTerm || coveredByEn) {
      if (verbose) log(`  skip (already covered): ${e.term}`);
      continue;
    }
    terms.push({ ...e });
    added++;
    if (verbose) log(`  add: ${e.term}${e.english ? ` (e. ${e.english})` : ''}`);
  }

  // Dedup by Icelandic headword (first wins = generated/current authoritative), then sort.
  const seen = new Set();
  const deduped = [];
  for (const t of terms) {
    const k = lc(t.term);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(t);
  }
  const collator = new Intl.Collator('is');
  deduped.sort((a, b) => collator.compare(a.term, b.term));

  return { result: { terms: deduped }, added, grafted, corrected };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/apply-glossary-supplement.js --book <id> [--track mt-preview]');
    console.log(
      '   or: node tools/apply-glossary-supplement.js --in <g.json> --supplement <s.json> --out <g.json>'
    );
    process.exit(0);
  }

  let inPath = args.in;
  let supPath = args.supplement;
  let outPath = args.out;
  if (args.book) {
    inPath =
      inPath || path.join(BOOKS_DIR, args.book, '05-publication', args.track, 'glossary.json');
    supPath = supPath || path.join(BOOKS_DIR, args.book, 'glossary-supplement.json');
    outPath = outPath || inPath;
  }
  if (!inPath || !supPath || !outPath) {
    console.error('Error: provide --book, or all of --in/--supplement/--out');
    process.exit(1);
  }
  if (!fs.existsSync(supPath)) {
    console.error(
      `No supplement file at ${supPath} — nothing to apply (this is fine for books without curation).`
    );
    process.exit(0);
  }

  const generated = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const supplement = JSON.parse(fs.readFileSync(supPath, 'utf8'));
  const { result, added, grafted, corrected } = applySupplement(generated, supplement, {
    verbose: args.verbose,
    log: (m) => console.log(m),
  });

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  console.log(
    `Applied supplement: +${added} added, alternateEnglish grafted onto ${grafted}, ${corrected} headword(s) corrected.`
  );
  console.log(`  in:  ${inPath} (${generated.terms.length} terms)`);
  console.log(`  out: ${outPath} (${result.terms.length} terms)`);
}

// Run only as CLI (not when imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
