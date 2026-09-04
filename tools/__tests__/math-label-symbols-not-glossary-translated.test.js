/**
 * A math label that is a SYMBOL must never be translated by the GLOSSARY
 * (register §C82 action ③ pass 1; sibling of §C71's contested-headword guard).
 *
 * WHAT WENT WRONG. The first free extract→inject pass of action ③ wrote nine
 * math-operator corruptions into committed chemistry CNXML, e.g.
 *   <m:mtext>ln</m:mtext>  →  <m:mtext>náttúrlegur logri</m:mtext>
 * so Boltzmann's `S = k ln W` rendered as `S = k náttúrlegur logri W`. Corpus
 * exposure at the time: 213 occurrences in `efnafraedi-2e` (ln 91, atm 39,
 * log 34, kg 17, nm 10, lb 7, ft 4, sin 4, oz 3, cos 3, ne 1) and 290 in
 * `edlisfraedi-2e` (kg 275, log 9, lb 6).
 *
 * WHY NEITHER EXISTING GUARD SAW IT — two independent blind spots, and this
 * file exists because closing either one alone would leave the other open.
 *
 *   1. THE CURATION never offered these tokens to a human. `bucketToken`
 *      routes a token to Bucket 1 ('label') iff it is all-lowercase ASCII,
 *      ≥3 chars, and NOT on `DEFAULT_STOPLIST`; only Bucket 1 reaches
 *      `mergeSkeleton`, which is what fills `books/<slug>/math-label-map.json`.
 *      So the 2-char symbols (ln kg nm lb ft oz ne) and the stoplisted math
 *      functions/units (log sin cos atm torr ppb exp tan) are *structurally*
 *      excluded from the curated overlay — they can never acquire a self-map
 *      mask the way `at`/`si`/`ppm` did. `DEFAULT_STOPLIST`'s own docstring
 *      calls them "Units and math functions confirmed to STAY unchanged in
 *      Icelandic", yet they were exactly the ones that changed: the stoplist
 *      that declares the invariant was never consulted where it is enforced.
 *
 *   2. THE COLLISION GUARD (`math-label-collisions-masked.test.js`) filters to
 *      CONTESTED headwords — those with competing or comma-list translations.
 *      Every one of these eleven is UNCONTESTED: a single approved row, e.g.
 *      `ln → náttúrlegur logri`, which is even correct Icelandic for the *word*.
 *      Same reader-visible damage, invisible to a guard keyed on contest.
 *
 * THE INVARIANT, stated so it does not depend on an enumeration: the glossary
 * is a map of WORDS, so it may not translate a token that is a SYMBOL —
 * ≤2 characters (unit and element symbols, variables) or a known math
 * function/unit on `DEFAULT_STOPLIST`. The curated overlay is deliberately
 * unaffected and still wins, which is what keeps `mol → mól` (3 chars, a
 * Bucket-1 fill slot the stoplist docstring calls out by name) working.
 *
 * WHY NOT JUST MASK THE ELEVEN. Measured across all four books carrying a
 * glossary, the rule blocks 503 symbol occurrences and leaves all 347 word
 * occurrences untouched — including `percent yield`, `molar mass`, `Reduction`,
 * `energy` and short real words like `ice → ís`, which remain the curated
 * overlay's business. Eleven masks would have fixed chemistry only, left
 * physics' 290 in place, and gone silent again on the next glossary row.
 *
 * ⚠️ REAL-TREE on purpose, like its sibling: every occurrence of this class so
 * far arrived through committed DATA an exporter wrote, with no code change. A
 * fixture-only test would have passed throughout and would miss the next one.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadMathLabelResolver, resolveLabel } from '../lib/math-label-substitute.js';
import { DEFAULT_STOPLIST } from '../lib/math-label-inventory.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS_DIR = path.join(REPO_ROOT, 'books');

const books = fs
  .readdirSync(BOOKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('__'))
  .map((d) => d.name)
  .filter((slug) => fs.existsSync(path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json')));

/** The predicate under test, stated once. Mirrors resolveLabel's own guard. */
const isSymbol = (label) => [...label].length <= 2 || DEFAULT_STOPLIST.has(label.toLowerCase());

/** Every leaf `<m:mtext>`/`<m:mi>` label in a book's source, with its count. */
function mathLabels(slug) {
  const counts = new Map();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) {
        const t = fs.readFileSync(p, 'utf8');
        for (const m of t.matchAll(/>\s*([^<>\s][^<>]{0,24}?)\s*<\/m:m(?:text|i)>/g)) {
          const k = m[1].trim();
          if (k) counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
    }
  };
  walk(path.join(BOOKS_DIR, slug, '01-source'));
  return counts;
}

describe('symbol math labels are never glossary-translated', () => {
  it('found books to assert against', () => {
    expect(books.length).toBeGreaterThan(0); // control: no books ⇒ every case vacuous
  });

  it.each(books)('%s: no symbol label resolves through the glossary', (slug) => {
    const { resolve } = loadMathLabelResolver(path.join(BOOKS_DIR, slug));
    const bad = [];
    for (const [label, n] of mathLabels(slug)) {
      if (!isSymbol(label)) continue;
      const r = resolve(label);
      if (r.source === 'glossary') bad.push(`${label}(x${n}) → ${r.value}`);
    }
    // Listing the offenders makes a failure self-explaining: what, how often,
    // and what it would have become.
    expect(`${slug}: ${bad.join(', ')}`).toBe(`${slug}: `);
  });

  it('the guarded population is NON-EMPTY — the assertion above is not vacuous', () => {
    // 🔴 THE CONTROL THAT MAKES THE ZERO ABOVE MEAN SOMETHING. "No symbol resolves
    // through the glossary" passes trivially if the glossary holds no symbol at all.
    // It does hold them — the guard refuses to USE them, it does not delete them — so
    // this asserts that at least one corpus symbol still has a glossary entry standing
    // behind it, i.e. the guard is actively suppressing something on every run.
    // ▶ If this goes red, the exposure is gone for an unrelated reason (a glossary
    // cleanup, a corpus change) and the guard above has quietly stopped being tested.
    const standing = books.flatMap((slug) => {
      const { glossaryMap } = loadMathLabelResolver(path.join(BOOKS_DIR, slug));
      return [...mathLabels(slug).keys()]
        .filter((l) => isSymbol(l) && glossaryMap.has(l.toLowerCase()))
        .map((l) => `${slug}:${l}→${glossaryMap.get(l.toLowerCase())}`);
    });
    expect(
      books.some((s) => mathLabels(s).size > 0),
      'no math labels found in any book'
    ).toBe(true);
    expect(
      standing.length,
      'no corpus symbol has a glossary entry — the guard above is now vacuous'
    ).toBeGreaterThan(0);
  });

  it('a WORD is still translated by the glossary — the guard is not a blanket off-switch', () => {
    // The mirror control. Blocking everything would satisfy the assertions above
    // while destroying the feature, and would read identically in the output.
    const translated = books.flatMap((slug) => {
      const { resolve } = loadMathLabelResolver(path.join(BOOKS_DIR, slug));
      return [...mathLabels(slug).keys()]
        .filter((l) => !isSymbol(l))
        .map((l) => ({ l, r: resolve(l) }))
        .filter(({ r }) => r.source === 'glossary')
        .map(({ l, r }) => `${slug}:${l}→${r.value}`);
    });
    expect(
      translated.length,
      'no word resolves through the glossary any more — the guard is over-broad'
    ).toBeGreaterThan(0);
  });
});

describe('resolveLabel: the symbol guard, unit level', () => {
  const glossaryMap = new Map([
    ['ln', 'náttúrlegur logri'],
    ['log', 'logri'],
    ['kg', 'kílógramm'],
    ['mol', 'mól'],
    ['percent yield', 'prósentuheimtur'],
    ['ice', 'ís'],
  ]);

  it('a 2-char symbol is left in English even when the glossary has it', () => {
    expect(resolveLabel('ln', { glossaryMap })).toEqual({ value: 'ln', source: 'english' });
  });

  it('a stoplisted math function is left in English even when the glossary has it', () => {
    expect(resolveLabel('log', { glossaryMap })).toEqual({ value: 'log', source: 'english' });
  });

  it('🔴 SUPERSEDED 2026-09-04 — the overlay can NO LONGER translate a short symbol', () => {
    // This asserted the opposite until the [USER] short-label ruling: the curated
    // overlay outranked the symbol guard, so a book could localise a symbol
    // deliberately. That escape hatch is exactly what shipped `Eker°` for `E°cell`,
    // and it has MOVED — from per-book data to the repo-wide
    // LOCALIZABLE_SHORT_LABELS allowlist. A book can no longer do this alone.
    expect(resolveLabel('kg', { overlay: { kg: 'kg.' }, glossaryMap })).toEqual({
      value: 'kg',
      source: 'english-short-default',
    });
  });

  it('CONTROL — the overlay still translates a LONG label, so the change is scoped', () => {
    expect(resolveLabel('cathode', { overlay: { cathode: 'katóða' }, glossaryMap })).toEqual({
      value: 'katóða',
      source: 'overlay-translated',
    });
  });

  it('mol → mól still works: a 3-char non-stoplisted token is a word, not a symbol', () => {
    // DEFAULT_STOPLIST's docstring calls `mol` out by name as deliberately absent,
    // because it localises. The guard must not capture it.
    expect(resolveLabel('mol', { glossaryMap })).toEqual({ value: 'mól', source: 'glossary' });
  });

  it('a multi-word phrase is still translated', () => {
    expect(resolveLabel('percent yield', { glossaryMap })).toEqual({
      value: 'prósentuheimtur',
      source: 'glossary',
    });
  });

  it('a short real WORD is still translated — length alone is not the predicate', () => {
    expect(resolveLabel('ice', { glossaryMap })).toEqual({ value: 'ís', source: 'glossary' });
  });
});
