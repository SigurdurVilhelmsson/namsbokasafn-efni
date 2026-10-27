/**
 * The work list (tools/ai-review/worklist.js; spec
 * docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md, "Unit U1"): which segments
 * the term pass offers to the model, and with which rulings. Every refusing or negative case
 * has a passing control beside it.
 *
 * Rulings are in the shape Unit B compiles. Those marked REAL carry a target from the
 * committed 2026-10-26 ruling set; the synthetic ones exist because the committed set holds no
 * held ruling, no proposed width and no proposed sense, so those conditions cannot be reached on
 * it. Segment text marked REAL is copied from the committed chemistry corpus.
 *
 * The m68727 numbers and the whole-chemistry totals were measured independently, with
 * different scripts (the seg-markers parser, not mt-layers), before this module existed.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SKIP_REASONS,
  pairUnit,
  isEligible,
  matchesOccurrence,
  isCandidate,
  offeredRulings,
  buildWorkList,
} from '../ai-review/worklist.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';
import { parseLayerFile, readBase, listChapterUnits, CHAPTER_DIR_RE } from '../lib/mt-layers.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK = path.join(REPO, 'books', 'efnafraedi-2e');
const SET = loadRulingSet(
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json'
);

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────

/** A layer file from `[segmentId, body]` pairs, parsed. */
const layer = (pairs) =>
  parseLayerFile(pairs.map(([id, body]) => `<!-- SEG:${id} -->\n${body}\n\n`).join(''));

const ruling = (o) => ({
  competitors: [],
  scope: { kind: 'book' },
  scopeStatus: 'default',
  sense: null,
  kinds: ['entry'],
  sources: ['test'],
  matchable: true,
  ...o,
});

const SENSE = (status) => ({
  id: 'electrochemical-cell',
  gloss: 'an electrochemical cell',
  otherSenses: [{ id: 'living-cell', gloss: 'a cell of a living organism' }],
  status,
});

// REAL targets and competitors (2026-10-26 set), rebuilt here so the synthetic variants below
// can change one field at a time.
const ATOM = ruling({
  id: 'atom',
  enNorm: 'atom',
  en: ['atom'],
  is: 'atóm',
  competitors: ['frumeind'],
});
const CELL = ruling({ id: 'cell', enNorm: 'cell', en: ['cell'], is: 'ker', sense: SENSE('ruled') });
const FUEL_CELL = ruling({
  id: 'fuel-cell',
  enNorm: 'fuel cell',
  en: ['fuel cell'],
  is: 'efnarafall',
  competitors: ['Efnarafhlaða'],
});

/** REAL: m68825:caption:CNX_Chem_17_05_FuelCell-caption. */
const FUEL_EN =
  'In this hydrogen fuel cell, oxygen from the air reacts with hydrogen, producing water and electricity.';
const FUEL_IS =
  'Í þessum vetnisefnarafala hvarfast súrefni úr loftinu við vetni og myndar vatn og rafmagn.';

const item = (en, is, segmentId = 'm1:caption:c1') => ({
  segmentId,
  occurrences: [{ occurrence: 0, key: segmentId, en, is }],
});

/** One unit of the committed corpus, as the runner will read it. */
function readUnit(chapterDir, stem) {
  const enFile = path.join(BOOK, '02-for-mt', chapterDir, `${stem}-segments.en.md`);
  return {
    stem,
    en: parseLayerFile(fs.readFileSync(enFile, 'utf8')),
    is: readBase({ bookDir: BOOK, chapterDir, stem }).parsed,
  };
}

const findItem = (list, segmentId) =>
  list.units.flatMap((u) => u.items).find((it) => it.segmentId === segmentId);

// ── SKIP_REASONS ─────────────────────────────────────────────────────────────────────────

describe('SKIP_REASONS', () => {
  it('is the closed, sorted set the spec names', () => {
    expect(SKIP_REASONS).toEqual(['identical-to-en', 'no-en', 'no-is']);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SKIP_REASONS)).toBe(true);
  });
});

// ── pairUnit ─────────────────────────────────────────────────────────────────────────────

describe('pairUnit', () => {
  it('pairs a duplicated id by occurrence key, not by id', () => {
    const en = layer([
      ['m1:para:a', 'one [[MATH:1]] kJ'],
      ['m1:para:a', 'two [[MATH:2]] kJ'],
    ]);
    const is = layer([
      ['m1:para:a', 'eitt [[MATH:1]] kJ'],
      ['m1:para:a', 'tvö [[MATH:2]] kJ'],
    ]);
    expect(pairUnit({ en, is }).items).toEqual([
      {
        segmentId: 'm1:para:a',
        occurrences: [
          { occurrence: 0, key: 'm1:para:a', en: 'one [[MATH:1]] kJ', is: 'eitt [[MATH:1]] kJ' },
          { occurrence: 1, key: 'm1:para:a#1', en: 'two [[MATH:2]] kJ', is: 'tvö [[MATH:2]] kJ' },
        ],
      },
    ]);
  });

  it('control: a clean pair keeps everything and skips nothing, every reason present at 0', () => {
    const en = layer([['m1:para:a', 'The atom']]);
    const is = layer([['m1:para:a', 'Atómið']]);
    const { items, skipped } = pairUnit({ en, is });
    expect([items.length, skipped]).toEqual([
      1,
      { 'identical-to-en': 0, 'no-en': 0, 'no-is': 0, skippedKeys: [] },
    ]);
  });

  it('skips an IS occurrence with no EN partner as no-en, with its key', () => {
    const en = layer([['m1:para:a', 'one']]);
    const is = layer([
      ['m1:para:a', 'eitt'],
      ['m1:para:a', 'tvö'],
      ['m1:para:b', 'þrjú'],
    ]);
    const { items, skipped } = pairUnit({ en, is });
    expect([items.map((i) => i.segmentId), skipped]).toEqual([
      ['m1:para:a'],
      {
        'identical-to-en': 0,
        'no-en': 2,
        'no-is': 0,
        skippedKeys: [
          { key: 'm1:para:a#1', reason: 'no-en' },
          { key: 'm1:para:b', reason: 'no-en' },
        ],
      },
    ]);
  });

  it('skips an EN occurrence with no IS partner as no-is, with its key', () => {
    const en = layer([
      ['m1:para:a', 'one'],
      ['m1:para:c', 'three'],
      ['m1:para:c', 'three again'],
    ]);
    const is = layer([
      ['m1:para:a', 'eitt'],
      ['m1:para:c', 'þrjú'],
    ]);
    const { items, skipped } = pairUnit({ en, is });
    expect([items.length, skipped]).toEqual([
      2,
      {
        'identical-to-en': 0,
        'no-en': 0,
        'no-is': 1,
        skippedKeys: [{ key: 'm1:para:c#1', reason: 'no-is' }],
      },
    ]);
  });

  it('skips an IS body equal to its EN body as identical-to-en (exact bytes)', () => {
    const en = layer([
      ['m1:para:a', '[[MATH:3]]'],
      ['m1:para:b', 'Δ[[i:H]] = −153 kJ'],
      ['m1:para:c', '6.25 kJ'],
    ]);
    const is = layer([
      ['m1:para:a', '[[MATH:3]]'],
      ['m1:para:b', 'Δ[[i:H]] = −153 kJ'],
      ['m1:para:c', '6,25 kJ'],
    ]);
    const { items, skipped } = pairUnit({ en, is });
    expect([items.map((i) => i.segmentId), skipped]).toEqual([
      ['m1:para:c'],
      {
        'identical-to-en': 2,
        'no-en': 0,
        'no-is': 0,
        skippedKeys: [
          { key: 'm1:para:a', reason: 'identical-to-en' },
          { key: 'm1:para:b', reason: 'identical-to-en' },
        ],
      },
    ]);
  });

  it('keeps the kept occurrences of an id whose other occurrence was skipped', () => {
    const en = layer([
      ['m1:para:a', '1407 kJ'],
      ['m1:para:a', 'the atom'],
    ]);
    const is = layer([
      ['m1:para:a', '1407 kJ'],
      ['m1:para:a', 'atómið'],
    ]);
    expect(pairUnit({ en, is }).items).toEqual([
      {
        segmentId: 'm1:para:a',
        occurrences: [{ occurrence: 1, key: 'm1:para:a#1', en: 'the atom', is: 'atómið' }],
      },
    ]);
  });

  it("orders items by the id's FIRST occurrence in the IS file, skipped or not", () => {
    // `x` first appears (identical) before `y`; its kept occurrence comes after `y`.
    const en = layer([
      ['m1:para:x', '42'],
      ['m1:para:y', 'the atom'],
      ['m1:para:x', 'the cell'],
    ]);
    const is = layer([
      ['m1:para:x', '42'],
      ['m1:para:y', 'atómið'],
      ['m1:para:x', 'kerið'],
    ]);
    expect(pairUnit({ en, is }).items.map((i) => i.segmentId)).toEqual(['m1:para:x', 'm1:para:y']);
  });

  it('control: items follow the IS file order, not the EN file order', () => {
    const en = layer([
      ['m1:para:b', 'bee'],
      ['m1:para:a', 'ay'],
    ]);
    const is = layer([
      ['m1:para:a', 'a-is'],
      ['m1:para:b', 'b-is'],
    ]);
    expect(pairUnit({ en, is }).items.map((i) => i.segmentId)).toEqual(['m1:para:a', 'm1:para:b']);
  });

  it('refuses something that is not a parse', () => {
    expect(() => pairUnit({ en: 'text', is: layer([['m1:para:a', 'x']]) })).toThrow(/ParsedLayer/);
  });

  describe('REAL: m68727 (ch05), whose IS file has 366 SEG markers and 358 distinct ids', () => {
    const unit = readUnit('ch05', 'm68727');
    const { items, skipped } = pairUnit({ en: unit.en, is: unit.is });
    const dupId = 'm68727:para:fs-idp49734384';

    it('the input is what the measurement saw: 366 occurrences, 358 ids', () => {
      expect([
        unit.is.records.length,
        new Set(unit.is.records.map((r) => r.segmentId)).size,
      ]).toEqual([366, 358]);
    });

    it('skips exactly 49 identical-to-en, no no-en, no no-is', () => {
      expect([skipped['identical-to-en'], skipped['no-en'], skipped['no-is']]).toEqual([49, 0, 0]);
    });

    it('keeps 317 occurrences in 313 items, 4 of them with two occurrences', () => {
      expect([
        items.reduce((n, i) => n + i.occurrences.length, 0),
        items.length,
        items.filter((i) => i.occurrences.length === 2).length,
      ]).toEqual([317, 313, 4]);
    });

    it('every occurrence is accounted for: kept + skipped = 366, kept ids + wholly skipped = 358', () => {
      const keptIds = new Set(items.map((i) => i.segmentId));
      const skippedOnlyIds = new Set(
        skipped.skippedKeys.map((s) => s.key.split('#')[0]).filter((id) => !keptIds.has(id))
      );
      expect([
        items.reduce((n, i) => n + i.occurrences.length, 0) + skipped.skippedKeys.length,
        keptIds.size + skippedOnlyIds.size,
      ]).toEqual([366, 358]);
    });

    it('a duplicated id pairs its second occurrence with the EN second occurrence', () => {
      const dup = items.find((i) => i.segmentId === dupId);
      expect(
        dup.occurrences.map((o) => [o.occurrence, o.key, o.en.includes('[[MATH:21]]'), o.is])
      ).toEqual([
        [0, dupId, false, '6,25 [[MATH:20]] 10[[sup:3]] kJ'],
        [1, `${dupId}#1`, true, '6,25 [[MATH:21]] 10[[sup:3]] kJ'],
      ]);
    });
  });
});

// ── Eligibility ──────────────────────────────────────────────────────────────────────────

describe('isEligible: one test per condition, each with a passing control', () => {
  const cases = [
    ['matchable is false', { matchable: false, unmatchableReason: 'test' }, { matchable: true }],
    ['kinds has held', { kinds: ['entry', 'held'] }, { kinds: ['entry'] }],
    [
      'an exclude scope excludes the chapter',
      { scope: { kind: 'exclude', chapters: ['ch05'] }, scopeStatus: 'ruled' },
      { scope: { kind: 'exclude', chapters: ['ch17'] }, scopeStatus: 'ruled' },
    ],
    [
      'a chapters scope does not list the chapter',
      { scope: { kind: 'chapters', chapters: ['ch17'] }, scopeStatus: 'ruled' },
      { scope: { kind: 'chapters', chapters: ['ch05'] }, scopeStatus: 'ruled' },
    ],
    [
      'scopeStatus is proposed',
      { scope: { kind: 'chapters', chapters: ['ch05'] }, scopeStatus: 'proposed' },
      { scope: { kind: 'chapters', chapters: ['ch05'] }, scopeStatus: 'ruled' },
    ],
    ['the sense status is proposed', { sense: SENSE('proposed') }, { sense: SENSE('ruled') }],
  ];

  for (const [what, refused, control] of cases) {
    it(`refuses when ${what}`, () => {
      expect(isEligible({ ...CELL, ...refused }, 'ch05')).toBe(false);
    });
    it(`control for "${what}": eligible`, () => {
      expect(isEligible({ ...CELL, ...control }, 'ch05')).toBe(true);
    });
  }

  it('the refusal reaches the output: an ineligible ruling is neither candidate nor context', () => {
    const it0 = item('The cell potential', 'Kerspennan');
    const held = { ...CELL, kinds: ['entry', 'held'] };
    expect([
      offeredRulings({ item: it0, rulings: [held], chapterDir: 'ch05' }),
      offeredRulings({ item: it0, rulings: [CELL], chapterDir: 'ch05' }),
    ]).toEqual([
      { candidateIds: [], rulingIds: [] },
      { candidateIds: ['cell'], rulingIds: ['cell'] },
    ]);
  });

  it('a sense-less ruling is eligible (control for the sense condition)', () => {
    expect(isEligible(ATOM, 'appendices')).toBe(true);
  });
});

// ── Matching and the candidate predicate ─────────────────────────────────────────────────

describe('matchesOccurrence', () => {
  it('matches a form used as a word in the English visible prose', () => {
    expect(matchesOccurrence(ATOM, { en: 'The titanium atoms are gray', is: 'x' })).toBe(true);
  });

  it('does not match a form hidden in a subscript (E[[sub:cell]])', () => {
    expect(matchesOccurrence(CELL, { en: 'E[[sub:cell]] is positive', is: 'x' })).toBe(false);
  });

  it('control: the same word outside the subscript matches', () => {
    expect(matchesOccurrence(CELL, { en: 'The cell is positive', is: 'x' })).toBe(true);
  });

  it('does not match a form inside a longer word (atomic)', () => {
    expect(matchesOccurrence(ATOM, { en: 'the atomic mass', is: 'x' })).toBe(false);
  });
});

describe('isCandidate', () => {
  const EN = 'The titanium atoms are gray';

  it('target carried and no competitor: not a candidate', () => {
    expect(isCandidate(ATOM, { en: EN, is: 'Títanatómin eru grá' }, 'ch02')).toBe(false);
  });

  it('competitor present (beside the carried target): a candidate', () => {
    const is = 'Títanatómin eru grá og súrefnisfrumeindirnar rauðar';
    expect(isCandidate(ATOM, { en: EN, is }, 'ch02')).toBe(true);
  });

  it('target absent: a candidate', () => {
    expect(isCandidate(ATOM, { en: EN, is: 'Títanið er grátt' }, 'ch02')).toBe(true);
  });

  it('a sensed ruling: a candidate even when the target is carried', () => {
    expect(isCandidate(CELL, { en: 'The cell', is: 'Kerið' }, 'ch17')).toBe(true);
  });

  it('control: the same sensed ruling without its sense is not a candidate when carried', () => {
    expect(isCandidate({ ...CELL, sense: null }, { en: 'The cell', is: 'Kerið' }, 'ch17')).toBe(
      false
    );
  });

  it('a ruling the English does not use is never a candidate, even with the target absent', () => {
    expect(isCandidate(ATOM, { en: 'The gray crystal', is: 'Grái kristallinn' }, 'ch02')).toBe(
      false
    );
  });

  it('an ineligible ruling is never a candidate', () => {
    const is = 'Títanið er grátt';
    expect([
      isCandidate({ ...ATOM, matchable: false, unmatchableReason: 't' }, { en: EN, is }, 'ch02'),
      isCandidate(ATOM, { en: EN, is }, 'ch02'),
    ]).toEqual([false, true]);
  });
});

// ── offeredRulings ───────────────────────────────────────────────────────────────────────

describe('offeredRulings', () => {
  it('offers satisfied matching rulings as context once a candidate exists', () => {
    expect(
      offeredRulings({
        item: item(FUEL_EN, FUEL_IS),
        rulings: [FUEL_CELL, CELL],
        chapterDir: 'ch17',
      })
    ).toEqual({ candidateIds: ['cell'], rulingIds: ['cell', 'fuel-cell'] });
  });

  it('both lists are empty when no ruling is a candidate', () => {
    expect(
      offeredRulings({ item: item(FUEL_EN, FUEL_IS), rulings: [FUEL_CELL], chapterDir: 'ch17' })
    ).toEqual({ candidateIds: [], rulingIds: [] });
  });

  it('a headword hidden in a subscript offers nothing (matching reads visible prose)', () => {
    expect([
      offeredRulings({
        item: item('E[[sub:cell]] is positive', 'E[[sub:cell]] er jákvætt'),
        rulings: [CELL],
        chapterDir: 'ch17',
      }),
      offeredRulings({
        item: item('The cell is positive', 'Kerið er jákvætt'),
        rulings: [CELL],
        chapterDir: 'ch17',
      }),
    ]).toEqual([
      { candidateIds: [], rulingIds: [] },
      { candidateIds: ['cell'], rulingIds: ['cell'] },
    ]);
  });

  it('a candidate on a second occurrence counts for the item', () => {
    const it2 = {
      segmentId: 'm1:para:a',
      occurrences: [
        { occurrence: 0, key: 'm1:para:a', en: 'The atom', is: 'Atómið' },
        { occurrence: 1, key: 'm1:para:a#1', en: 'The atom', is: 'Frumeindin' },
      ],
    };
    expect(offeredRulings({ item: it2, rulings: [ATOM], chapterDir: 'ch02' })).toEqual({
      candidateIds: ['atom'],
      rulingIds: ['atom'],
    });
  });

  it('returns both lists sorted, whatever the ruling order', () => {
    const it0 = item('The atom in a cell', 'Frumeind í kerinu');
    const a = offeredRulings({ item: it0, rulings: [CELL, ATOM], chapterDir: 'ch02' });
    const b = offeredRulings({ item: it0, rulings: [ATOM, CELL], chapterDir: 'ch02' });
    expect([a, b]).toEqual([
      { candidateIds: ['atom', 'cell'], rulingIds: ['atom', 'cell'] },
      { candidateIds: ['atom', 'cell'], rulingIds: ['atom', 'cell'] },
    ]);
  });

  it('refuses a malformed chapter directory instead of offering nothing', () => {
    expect(() =>
      offeredRulings({ item: item(FUEL_EN, FUEL_IS), rulings: [CELL], chapterDir: 'ch5' })
    ).toThrow(/chapterDir/);
  });
});

// ── buildWorkList ────────────────────────────────────────────────────────────────────────

describe('buildWorkList', () => {
  const unitA = {
    stem: 'm1',
    en: layer([
      ['m1:para:a', 'The atom'], // candidate: competitor
      ['m1:para:b', 'The atom again'], // satisfied: no candidate
      ['m1:para:c', '42'], // identical-to-en
      ['m1:para:d', 'The atom once more'], // candidate on #0 and #1
      ['m1:para:d', 'The atom once more'],
      ['m1:para:f', 'An orphan'], // no-is
    ]),
    is: layer([
      ['m1:para:a', 'Frumeindin'],
      ['m1:para:b', 'Atómið aftur'],
      ['m1:para:c', '42'],
      ['m1:para:d', 'Frumeindin enn'],
      ['m1:para:d', 'Frumeindin enn á ný'],
      ['m1:para:e', 'Ekkert enskt'], // no-en
    ]),
  };
  const unitB = {
    stem: 'm2',
    en: layer([['m2:para:a', 'Nothing to rule here']]),
    is: layer([['m2:para:a', 'Ekkert hér']]),
  };
  const list = buildWorkList({ chapterDir: 'ch02', units: [unitA, unitB], rulings: [ATOM] });

  it('keeps only items with a candidate, with their offered rulings', () => {
    expect(list.units.map((u) => [u.stem, u.items.map((i) => i.segmentId)])).toEqual([
      ['m1', ['m1:para:a', 'm1:para:d']],
      ['m2', []],
    ]);
  });

  it('an item carries all its kept occurrences and its two id lists', () => {
    expect(list.units[0].items[1]).toEqual({
      segmentId: 'm1:para:d',
      occurrences: [
        {
          occurrence: 0,
          key: 'm1:para:d',
          en: 'The atom once more',
          is: 'Frumeindin enn',
        },
        {
          occurrence: 1,
          key: 'm1:para:d#1',
          en: 'The atom once more',
          is: 'Frumeindin enn á ný',
        },
      ],
      candidateIds: ['atom'],
      rulingIds: ['atom'],
    });
  });

  it("each unit keeps pairUnit's skipped record", () => {
    expect(list.units[0].skipped).toEqual({
      'identical-to-en': 1,
      'no-en': 1,
      'no-is': 1,
      skippedKeys: [
        { key: 'm1:para:c', reason: 'identical-to-en' },
        { key: 'm1:para:e', reason: 'no-en' },
        { key: 'm1:para:f', reason: 'no-is' },
      ],
    });
  });

  it('counts: occurrences counts EVERY IS occurrence, skipped ones included', () => {
    expect(list.counts).toEqual({
      units: 2,
      occurrences: 7,
      items: 2,
      candidateOccurrences: 3,
      pairs: 2,
      skipped: { 'identical-to-en': 1, 'no-en': 1, 'no-is': 1 },
      noCandidate: 2,
    });
  });

  it('carries its chapterDir', () => {
    expect(list.chapterDir).toBe('ch02');
  });

  it('refuses a malformed chapter directory instead of returning an empty list', () => {
    expect(() => buildWorkList({ chapterDir: 'ch2', units: [unitA], rulings: [ATOM] })).toThrow(
      /chapterDir/
    );
  });

  it('control: the same call with a well-formed chapter directory builds', () => {
    expect(
      buildWorkList({ chapterDir: 'appendices', units: [unitA], rulings: [ATOM] }).counts.items
    ).toBe(2);
  });

  it('refuses a unit without a stem', () => {
    expect(() =>
      buildWorkList({ chapterDir: 'ch02', units: [{ en: unitA.en, is: unitA.is }], rulings: [] })
    ).toThrow(/stem/);
  });
});

// ── Real data, committed ruling set ──────────────────────────────────────────────────────

describe('REAL: the committed ruling set on three captions', () => {
  it('ch02 m68693 TiO2 caption: atom is a candidate (frumeind)', () => {
    const list = buildWorkList({
      chapterDir: 'ch02',
      units: [readUnit('ch02', 'm68693')],
      rulings: SET.rulings,
    });
    const it0 = findItem(list, 'm68693:caption:CNX_Chem_02_04_TiO2-caption');
    expect(it0.candidateIds).toContain('atom');
  });

  describe('ch17 m68825 FuelCell caption', () => {
    const list = buildWorkList({
      chapterDir: 'ch17',
      units: [readUnit('ch17', 'm68825')],
      rulings: SET.rulings,
    });
    const it0 = findItem(list, 'm68825:caption:CNX_Chem_17_05_FuelCell-caption');

    it('cell is a candidate (by its sense)', () => {
      expect(it0.candidateIds).toContain('cell');
    });

    it('fuel cell is satisfied (vetnisefnarafala carries efnarafall), so not a candidate', () => {
      expect(it0.candidateIds).not.toContain('fuel-cell');
    });

    it('fuel cell is still offered, as context, beside cell', () => {
      expect([it0.rulingIds.includes('cell'), it0.rulingIds.includes('fuel-cell')]).toEqual([
        true,
        true,
      ]);
    });
  });

  it('ch18 m68830 Hall–Héroult caption: cell and electrolytic cell are both offered', () => {
    const list = buildWorkList({
      chapterDir: 'ch18',
      units: [readUnit('ch18', 'm68830')],
      rulings: SET.rulings,
    });
    const it0 = findItem(list, 'm68830:caption:CNX_Chem_18_02_HallHerCell-caption');
    expect([it0.rulingIds.includes('cell'), it0.rulingIds.includes('electrolytic-cell')]).toEqual([
      true,
      true,
    ]);
  });
});

// ── Determinism ──────────────────────────────────────────────────────────────────────────

describe('determinism', () => {
  const build = (rulings) => {
    const units = listChapterUnits({ bookDir: BOOK, chapterDir: 'ch17' }).map((stem) =>
      readUnit('ch17', stem)
    );
    return JSON.stringify(buildWorkList({ chapterDir: 'ch17', units, rulings }));
  };

  it('two builds of the same chapter, from two separate reads, are JSON-identical', () => {
    expect(build(SET.rulings)).toBe(build(SET.rulings));
  });

  it('the order of the rulings does not leak into the output', () => {
    expect(build([...SET.rulings].reverse())).toBe(build(SET.rulings));
  });
});

// ── Whole-chemistry positive control ─────────────────────────────────────────────────────

describe('whole chemistry (every 02-structure chapter directory)', () => {
  it(
    'builds without throwing and sees 22,876 IS occurrences, 4,184 of them identical to EN',
    { timeout: 30_000 },
    () => {
      const chapters = fs
        .readdirSync(path.join(BOOK, '02-structure'))
        .filter((d) => CHAPTER_DIR_RE.test(d))
        .sort();
      const total = {
        chapters: 0,
        occurrences: 0,
        identical: 0,
        noEn: 0,
        noIs: 0,
        candidateOccurrences: 0,
        items: 0,
        pairs: 0,
        contextOk: true,
      };
      for (const chapterDir of chapters) {
        const units = listChapterUnits({ bookDir: BOOK, chapterDir }).map((stem) =>
          readUnit(chapterDir, stem)
        );
        const { counts, units: built } = buildWorkList({
          chapterDir,
          units,
          rulings: SET.rulings,
        });
        total.chapters += 1;
        total.occurrences += counts.occurrences;
        total.identical += counts.skipped['identical-to-en'];
        total.noEn += counts.skipped['no-en'];
        total.noIs += counts.skipped['no-is'];
        total.candidateOccurrences += counts.candidateOccurrences;
        total.items += counts.items;
        total.pairs += counts.pairs;
        for (const it0 of built.flatMap((u) => u.items)) {
          if (
            it0.candidateIds.length === 0 ||
            !it0.candidateIds.every((id) => it0.rulingIds.includes(id))
          ) {
            total.contextOk = false;
          }
        }
      }
      expect({
        chapters: total.chapters,
        occurrences: total.occurrences,
        identical: total.identical,
        noEn: total.noEn,
        noIs: total.noIs,
        contextOk: total.contextOk,
        someWork: total.items > 0 && total.candidateOccurrences >= total.items,
      }).toEqual({
        chapters: 23,
        occurrences: 22876,
        identical: 4184,
        noEn: 0,
        noIs: 0,
        contextOk: true,
        someWork: true,
      });
    }
  );
});
