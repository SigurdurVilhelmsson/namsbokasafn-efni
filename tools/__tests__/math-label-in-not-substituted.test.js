/**
 * `in` must never be substituted inside a math label (register §C71).
 *
 * §C62's adoption put `in → tomma` (inch) into the resolved glossaries, and
 * `buildGlossaryMap` lowercases its keys, so a leaf `<m:mtext>in</m:mtext>`
 * resolves through the glossary unless an overlay masks it. Measured across
 * `01-source`: 24 such labels in edlisfraedi-2e and 4 in efnafraedi-2e, and in
 * physics **at least 11 of the 24 are not inches at all** —
 *
 *   - a SUBSCRIPT meaning "input": `E_in` (Carnot efficiency), `P_in` (gauge
 *     pressure), `W_out/E_in`, `W_out = W_in − W_f` → would render `E_tomma`
 *   - the English PREPOSITION: "about a 1 in 10^30", "2 in s", "the dose in Sv"
 *     → would render "1 tomma 10^30"
 *
 * The remaining occurrences ARE the inch unit, but there the label is a unit
 * SYMBOL (`12 in.`, `lb/in²`) and replacing a symbol with a word inside math is
 * a rendering regression too. So the rule is blanket and simple: in a math
 * label, `in` stays English in every one of the three readings.
 *
 * ⚠️ This is a REAL-TREE test on purpose. The defect arrived through committed
 * data — a glossary the exporter wrote — not through code, so a fixture-based
 * test could not have caught it and would not catch the next one.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadMathLabelResolver } from '../lib/math-label-substitute.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS_DIR = path.join(REPO_ROOT, 'books');

const booksWithGlossaries = fs
  .readdirSync(BOOKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('__'))
  .map((d) => d.name)
  .filter((slug) => fs.existsSync(path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json')));

describe('`in` is never substituted in a math label', () => {
  it('found books to assert against', () => {
    // Control: an empty book list would make every case below vacuous.
    expect(booksWithGlossaries.length).toBeGreaterThan(0);
  });

  it.each(booksWithGlossaries)('%s: resolve("in") does not come from the glossary', (slug) => {
    const { resolve } = loadMathLabelResolver(path.join(BOOKS_DIR, slug));
    const r = resolve('in');
    // Naming the slug and the value makes a failure say what it substituted.
    expect(`${slug}: in → ${r.value} (${r.source})`).toBe(`${slug}: in → in (${r.source})`);
    expect(r.source).not.toBe('glossary');
  });

  it('the guard is not vacuous — a book DOES carry the offending glossary entry', () => {
    // Without this, every case above would also pass if the entry had simply
    // been deleted upstream, and the overlays would look unnecessary.
    const carriers = booksWithGlossaries.filter((slug) => {
      const g = JSON.parse(
        fs.readFileSync(path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json'), 'utf8')
      );
      return (g.terms || []).some(
        (t) => (t.english || '').toLowerCase() === 'in' && t.status === 'approved'
      );
    });
    expect(carriers.length).toBeGreaterThan(0);
  });
});
