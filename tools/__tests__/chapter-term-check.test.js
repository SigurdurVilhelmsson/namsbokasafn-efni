/**
 * chapter-term-check — the two per-chapter checks [USER] ruled on 2026-09-19
 * (docs/decisions/2026-09-19-glossary-subset-standard-per-chapter.md):
 *   (a) glossary subset candidates — approved terms the chapter's MT renders inconsistently;
 *   (b) short math labels the book's map translates but the short-label default keeps English.
 *
 * Each check carries a POSITIVE control on the defect that motivated it: `enthalpy` on the
 * kept glossary-off probe, and `rxn` against the allowlist as it was before 2026-09-19.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  stemOf,
  containsStem,
  usesHeadword,
  glossaryCoverage,
  findSuppressedShortLabels,
  chapterMathTokens,
} from '../lib/chapter-term-check.js';
import { parseSegmentsMap } from '../lib/seg-markers.cjs';
import { loadGlossary } from '../api-translate.js';
import { bookToDomain } from '../lib/book-rendering-config.js';
import {
  LOCALIZABLE_SHORT_LABELS,
  RULED_ENGLISH_SHORT_LABELS,
} from '../lib/math-label-inventory.js';
import { loadMathLabelResolver, resolveLabel } from '../lib/math-label-substitute.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHEM = path.join(ROOT, 'books/efnafraedi-2e');
const read = (p) => fs.readFileSync(p, 'utf8');

describe('stemOf', () => {
  it('drops one letter from a short word', () => {
    expect(stemOf('vermi')).toBe('verm');
  });
  it('drops two letters from a longer word', () => {
    expect(stemOf('vermibreyting')).toBe('vermibreyti');
  });
  it('uses the longest word of a multi-word target', () => {
    expect(stemOf('staðlað myndunarvermi')).toBe('myndunarver');
  });
  it('returns null for a target too short to stem safely', () => {
    expect(stemOf('pH')).toBe(null);
  });
});

describe('usesHeadword — what the English prose says, not what the wire selects', () => {
  it('matches the word and its plural', () => {
    expect([usesHeadword('pound', 'one pound'), usesHeadword('pound', 'two pounds')]).toEqual([
      true,
      true,
    ]);
  });
  it('does not fire inside a longer word (pound in compound)', () => {
    expect(usesHeadword('pound', 'a compound of')).toBe(false);
  });
  it('does not fire on a longer word built on it (acid in acidic)', () => {
    expect(usesHeadword('acid', 'an acidic solution')).toBe(false);
  });
  it('keeps a short headword case-sensitive (As is arsenic, as is not)', () => {
    expect([usesHeadword('As', 'As and Sb'), usesHeadword('As', 'as we saw')]).toEqual([
      true,
      false,
    ]);
  });
});

describe('containsStem', () => {
  it('finds a 3-letter stem before a vowel, including in a compound', () => {
    expect([containsStem('orku', 'ork'), containsStem('varmaorka', 'ork')]).toEqual([true, true]);
  });
  it('does not find a 3-letter stem before a consonant', () => {
    expect(containsStem('korktappi', 'ork')).toBe(false);
  });
  it('finds a 4-letter stem anywhere', () => {
    expect(containsStem('myndunarvermi', 'verm')).toBe(true);
  });
  it('gives a vowel-final 4-letter word a 3-letter stem, and a consonant-final one 4', () => {
    expect([stemOf('orka'), stemOf('pund')]).toEqual(['ork', 'pund']);
  });
  it('folds u-umlaut in the Icelandic text, so the term jafna is covered by jöfnu', () => {
    const [row] = glossaryCoverage({
      en: new Map([['m:p:1', 'Balance the equation.']]),
      is: new Map([['m:p:1', 'Stillið jöfnuna.']]),
      terms: [{ sourceWord: 'equation', targetWord: 'jafna' }],
      minSegments: 1,
    });
    expect(row.covered).toBe(1);
  });
});

describe('(a) glossaryCoverage — synthetic', () => {
  const terms = [{ sourceWord: 'enthalpy', targetWord: 'vermi' }];
  const en = new Map();
  const isLow = new Map();
  const isHigh = new Map();
  for (let i = 0; i < 10; i++) {
    en.set(`m1:para:p${i}`, `The enthalpy of step ${i}.`);
    isLow.set(`m1:para:p${i}`, i < 2 ? `Vermi skrefs ${i}.` : `Varmi skrefs ${i}.`);
    isHigh.set(`m1:para:p${i}`, `Vermi skrefs ${i}.`);
  }
  // Background a real chapter has: without it every segment carries varmi, and a word
  // present everywhere cannot be told apart from the one that replaced the term.
  for (let i = 0; i < 30; i++) {
    for (const m of [en, isLow, isHigh])
      m.set(`m1:para:bg${i}`, m === en ? 'Water boils.' : 'Vatn sýður.');
  }

  it('flags a term the MT renders inconsistently', () => {
    const [row] = glossaryCoverage({ en, is: isLow, terms, minSegments: 5, threshold: 0.8 });
    expect([row.total, row.covered, row.kept, row.candidate]).toEqual([10, 2, 0, true]);
  });

  it('does not flag a term the MT renders consistently', () => {
    const [row] = glossaryCoverage({ en, is: isHigh, terms, minSegments: 5, threshold: 0.8 });
    expect([row.covered, row.candidate]).toEqual([10, false]);
  });

  it('does not flag a term whose coverage EQUALS the threshold', () => {
    const [row] = glossaryCoverage({ en, is: isLow, terms, minSegments: 5, threshold: 0.2 });
    expect([row.coverage, row.candidate]).toEqual([0.2, false]);
  });

  it('does not flag a term seen in fewer segments than the minimum', () => {
    const [row] = glossaryCoverage({ en, is: isLow, terms, minSegments: 11, threshold: 0.8 });
    expect(row.candidate).toBe(false);
  });

  it('counts a headword the MT kept verbatim (a symbol) as kept, not as a miss', () => {
    const kg = new Map([['m1:para:k', 'Mass in kg.']]);
    const kgIs = new Map([['m1:para:k', 'Massi í kg.']]);
    const [row] = glossaryCoverage({
      en: kg,
      is: kgIs,
      terms: [{ sourceWord: 'kg', targetWord: 'kílógramm' }],
      minSegments: 1,
    });
    expect([row.covered, row.kept, row.candidate]).toEqual([0, 1, false]);
  });

  it('names the OTHER glossary term an uncovered segment used — the collapse', () => {
    const withHeat = [...terms, { sourceWord: 'heat', targetWord: 'varmi' }];
    const rows = glossaryCoverage({
      en,
      is: isLow,
      terms: withHeat,
      minSegments: 5,
      threshold: 0.8,
    });
    const row = rows.find((r) => r.sourceWord === 'enthalpy');
    expect(row.collisions[0]).toEqual({ sourceWord: 'heat', targetWord: 'varmi', count: 8 });
  });
});

describe('(a) collisions ignore a word common to the whole chapter', () => {
  it('does not report efni, present in every segment, as what replaced the term', () => {
    const en = new Map();
    const is = new Map();
    for (let i = 0; i < 10; i++) {
      en.set(`m:p:${i}`, 'The enthalpy.');
      is.set(`m:p:${i}`, 'Varmi efnis.');
    }
    for (let i = 0; i < 30; i++) {
      en.set(`m:b:${i}`, 'Water.');
      is.set(`m:b:${i}`, 'Vatn er efni.');
    }
    const terms = [
      { sourceWord: 'enthalpy', targetWord: 'vermi' },
      { sourceWord: 'heat', targetWord: 'varmi' },
      { sourceWord: 'substance', targetWord: 'efni' },
    ];
    const row = glossaryCoverage({ en, is, terms }).find((r) => r.sourceWord === 'enthalpy');
    expect(row.collisions.map((c) => c.targetWord)).toEqual(['varmi']);
  });
});

describe('(a) glossaryCoverage — the ch05 enthalpy control, on the real corpus', () => {
  const en = parseSegmentsMap(read(path.join(CHEM, '02-for-mt/ch05/m68727-segments.en.md')));
  const terms = loadGlossary(path.join(CHEM, 'glossary'), bookToDomain('efnafraedi-2e')).terms;
  const enthalpy = (isPath) =>
    glossaryCoverage({
      en,
      is: parseSegmentsMap(read(isPath)),
      terms,
      minSegments: 5,
      threshold: 0.8,
    }).find((r) => r.sourceWord === 'enthalpy');

  it('🔴 POSITIVE CONTROL — flags enthalpy on the kept glossary-off probe', () => {
    const probe = path.join(
      ROOT,
      'test-results/c-ch05-glossary-arm-probe-2026-09-19/m68727-segments.is.no-glossary.md'
    );
    expect(enthalpy(probe).candidate).toBe(true);
  });

  // ⚠️ A PREMISE PIN on the committed MT: it goes red if ch05 is ever re-bought without the
  // subset. That is the corpus moving, not the tool breaking — re-check, do not delete.
  it('does not flag enthalpy on the committed --glossary-only MT', () => {
    const committed = path.join(CHEM, '02-mt-output/ch05/m68727-segments.is.md');
    expect(enthalpy(committed).candidate).toBe(false);
  });
});

describe('(b) findSuppressedShortLabels', () => {
  const { overlay, glossaryMap } = loadMathLabelResolver(CHEM);
  const ch05 = chapterMathTokens(path.join(CHEM, '01-source/ch05'));

  it('🔴 POSITIVE CONTROL — flags rxn against the allowlist as it stood before 2026-09-19', () => {
    const before = new Set([...LOCALIZABLE_SHORT_LABELS].filter((t) => t !== 'rxn'));
    const rows = findSuppressedShortLabels(ch05, { overlay, glossaryMap, allowlist: before });
    expect(rows.find((r) => r.label === 'rxn')).toMatchObject({ via: 'overlay', value: 'hvarf' });
  });

  it('does not flag rxn under the current allowlist', () => {
    const rows = findSuppressedShortLabels(ch05, { overlay, glossaryMap });
    expect(rows.map((r) => r.label)).not.toContain('rxn');
  });

  it('marks a label the 2026-09-04 ruling named as already ruled, not as a new question', () => {
    const ch17 = chapterMathTokens(path.join(CHEM, '01-source/ch17'));
    const cell = findSuppressedShortLabels(ch17, { overlay, glossaryMap }).find(
      (r) => r.label === 'cell'
    );
    expect(cell.ruled).toBe(true);
  });

  it('never flags an allow-listed label (mol)', () => {
    const rows = findSuppressedShortLabels(ch05, { overlay, glossaryMap });
    expect(rows.map((r) => r.label)).not.toContain('mol');
  });

  it('RULED_ENGLISH_SHORT_LABELS and the allowlist are disjoint', () => {
    expect([...RULED_ENGLISH_SHORT_LABELS].filter((t) => LOCALIZABLE_SHORT_LABELS.has(t))).toEqual(
      []
    );
  });

  // Two implementations of one rule must agree ON THE CORPUS (CLAUDE.md): the overlay tier
  // spells out resolveLabel's short-label predicate so the allowlist can be injected.
  it('agrees with resolveLabel on every token of four chemistry chapters', () => {
    let seen = 0;
    for (const ch of ['ch05', 'ch10', 'ch16', 'ch17']) {
      const tokens = chapterMathTokens(path.join(CHEM, '01-source', ch));
      const flagged = new Set(
        findSuppressedShortLabels(tokens, { overlay, glossaryMap })
          .filter((r) => r.via === 'overlay')
          .map((r) => r.label)
      );
      const truth = new Set(
        tokens
          .map((t) => t.text)
          .filter(
            (t) => resolveLabel(t, { overlay, glossaryMap }).source === 'english-short-default'
          )
      );
      expect([...flagged].sort(), ch).toEqual([...truth].sort());
      seen += truth.size;
    }
    // Non-vacuity: agreeing on an empty set would prove nothing (ch10/ch16/ch17 carry the
    // ruled vap/fus/sys/surr/rev/cell, so this is non-zero on today's corpus).
    expect(seen).toBeGreaterThan(0);
  });
});

describe('the CLI', () => {
  const tool = path.join(ROOT, 'tools/chapter-term-check.js');
  const run = (...a) => spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' });

  it('produces both sections and exits 0 on a real chapter', () => {
    const r = run('--book', 'efnafraedi-2e', '--chapter', '5');
    expect([
      r.status,
      /\(a\) glossary subset/.test(r.stdout),
      /\(b\) short math labels/.test(r.stdout),
    ]).toEqual([0, true, true]);
  });

  it('exits 2 without --chapter', () => {
    expect(run('--book', 'efnafraedi-2e').status).toBe(2);
  });
});
