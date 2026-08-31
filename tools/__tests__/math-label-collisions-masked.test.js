/**
 * A CONTESTED headword must never resolve through the glossary in a math label
 * (register §C71).
 *
 * WHY THE CLASS AND NOT ONE WORD. This file first shipped asserting only that
 * `in` is not substituted, because `in → tomma` was what the collision report
 * happened to surface. That fixed the instance and missed the class: chemistry
 * carries `at → astat | marsnákaætt`, the row-order winner is **marsnákaætt**
 * (a snake family), and it lands on **21** leaf math labels. Same defect, one
 * headword over, invisible to a test named after the first one.
 *
 * THE MECHANISM. `buildGlossaryMap` keys a Map on lowercased English with
 * LAST-WRITE-WINS (§C18) and applies no omission, so a contested headword
 * silently resolves to whichever row came last. The MT path is protected —
 * `formatGlossary` omits contested headwords outright — but the RENDER path is
 * not. The two guards are independent; neither is evidence for the other.
 *
 * THE FIX is `books/<slug>/math-label-map.json`'s self-map idiom (`"at": "at"`),
 * which `resolveLabel` returns as `overlay-self`, so `substituteMathLabels`
 * sees value === key and leaves the bytes alone.
 *
 * ⚠️ REAL-TREE on purpose. Every occurrence of this defect so far arrived
 * through committed DATA an exporter wrote, with no code change — a fixture
 * test would have passed throughout and would miss the next one identically.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadMathLabelResolver } from '../lib/math-label-substitute.js';
import { findGlossaryCollisions } from '../lib/glossary-collisions.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS_DIR = path.join(REPO_ROOT, 'books');

const books = fs
  .readdirSync(BOOKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('__'))
  .map((d) => d.name)
  .filter((slug) => fs.existsSync(path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json')));

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

/** Headwords the committed glossary cannot decide — competitions and comma-lists. */
function contested(slug) {
  const g = JSON.parse(
    fs.readFileSync(path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json'), 'utf8')
  );
  const c = findGlossaryCollisions(g.terms || [], { approvedOnly: true });
  return new Set([...c.competitions, ...c.commaLists].map((x) => String(x.english).toLowerCase()));
}

describe('contested headwords are masked in math labels', () => {
  it('found books to assert against', () => {
    expect(books.length).toBeGreaterThan(0); // control: no books ⇒ every case vacuous
  });

  it.each(books)('%s: no contested headword resolves through the glossary', (slug) => {
    const { resolve } = loadMathLabelResolver(path.join(BOOKS_DIR, slug));
    const bad = [];
    for (const [label, n] of mathLabels(slug)) {
      if (!contested(slug).has(label.toLowerCase())) continue;
      const r = resolve(label);
      if (r.source === 'glossary') bad.push(`${label}(x${n}) → ${r.value}`);
    }
    // Listing the offenders makes a failure self-explaining: what, how often,
    // and what it would have become.
    expect(`${slug}: ${bad.join(', ')}`).toBe(`${slug}: `);
  });

  it('📌 THE EXPOSURE IS BACK SINCE 2026-08-31 — so the guard above is NON-VACUOUS again', () => {
    // 🔴 THIS ASSERTION WAS INVERTED, NOT DELETED. It used to read
    // `expect(exposed.length).toBeGreaterThan(0)` — a non-vacuity guard on the test above,
    // because "no contested headword reaches a math label" passes trivially if no contested
    // headword exists at all. Its subject was chemistry's `at → astat | marsnákaætt`, which
    // §C71/§C72 measured reaching 21 leaf math labels.
    //
    // The 2026-08-30 glossary cleanup (§C82 L151) removed the cross-domain fall-through that
    // CREATED those competitions, so across every book the exposure is now zero and the old
    // form failed — correctly. Deleting it would hide that; asserting the opposite records it.
    //
    // ⚠️ TWO CONSEQUENCES, both worth knowing:
    //   1. The test above is now vacuous. It is kept because the exposure can return the
    //      moment a competing translation is re-approved, and it costs nothing.
    //   2. `books/<slug>/math-label-map.json`'s self-map masks (`"at": "at"`) are therefore
    //      INERT for the two kept books. They are harmless and are NOT removed here —
    //      retiring them is a separate decision, since a returning competition would need
    //      them again.
    // ▶ If this goes red, a contested headword is reaching math labels again: read the list
    // it prints, then check G1's verdict on that book before touching the masks.
    const exposed = books.flatMap((slug) => {
      const c = contested(slug);
      return [...mathLabels(slug).keys()]
        .filter((l) => c.has(l.toLowerCase()))
        .map((l) => `${slug}:${l}`);
    });
    // Control: the scan really did look at something — a zero from an empty book list would
    // otherwise be indistinguishable from a zero from a clean corpus.
    expect(books.length, 'no books scanned — the zero below would be manufactured').toBeGreaterThan(
      0
    );
    expect(
      books.some((s) => mathLabels(s).size > 0),
      'no math labels found in any book'
    ).toBe(true);
    // 🔴 RE-INVERTED 2026-08-31 — BACK TO THE ORIGINAL NON-VACUITY FORM, because the
    // population it guards is NON-EMPTY AGAIN. §C116 replaced the 2026-08-30 domain-scoping
    // (which emptied it by deleting 1,632 of 2,021 terms) with a matching fix plus targeted
    // removals, so the cross-domain terms — and with them one competition — are back:
    // `si` = `alþjóðlega einingakerfið` (SI) vs `kísill` (silicon), on 21 `Si` math labels.
    // ▶ THE GUARD ABOVE IS THEREFORE MEANINGFUL AGAIN, which is the whole reason to assert
    // this direction: it proves "no contested headword resolves through the glossary" is
    // being tested against something.
    // ⚠️ AND THE EXPOSURE IS NOT A DEFECT TODAY — measured: all 21 occurrences are `Si`,
    // which resolves to `english` (unchanged), because `resolveLabel` never case-folds a
    // label under 3 chars while `buildGlossaryMap` lowercases its keys, so a 2-char
    // mixed-case label can never hit the map. Lowercase `si` WOULD resolve to `kísill` and
    // occurs 0 times. `math-label-map.json` now carries `"si": "si"` so that structural
    // accident is stated rather than relied upon.
    expect(
      exposed.length,
      'the exposure population is empty — the guard above is vacuous'
    ).toBeGreaterThan(0);
  });
});
