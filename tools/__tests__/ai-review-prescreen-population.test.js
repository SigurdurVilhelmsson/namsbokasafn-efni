import { describe, it, expect } from 'vitest';
import {
  CONTROLS,
  classifyRow,
  reduceCensus,
  buildPopulation,
  buildControls,
  sampleSentences,
  extractSentence,
  assembleItems,
  findOccurrences,
  pickEvenly,
} from '../ai-review/prescreen-population.js';

const rulingSet = { rulings: [{ en: ['Ruled Word', 'ruled'] }] };
const row = (english, over = {}) => ({
  english,
  icelandic: `${english}-is`,
  domain: 'chemistry',
  conceptId: 1,
  isFallback: false,
  isTied: false,
  reason: 'head-form',
  alternatives: ['x'],
  ifRemoved: { text: 'y', domain: 'chemistry' },
  chapters: [1],
  matchCount: 1,
  issueCount: 0,
  matches: [{ chapter: 1, moduleId: 'm1', segmentId: `m1:para:${english}` }],
  ...over,
});
const unit = (chapter, moduleId, segs) => ({
  chapter,
  moduleId,
  segments: Object.entries(segs).map(([segmentId, en]) => ({ segmentId, en })),
});

const census = {
  schema: 'c19-census/1',
  rows: [
    row('ruled'),
    row('fb', { isFallback: true }),
    row('tie', { isTied: true }),
    row('dec', { reason: 'house-style' }),
    row('phys', { domain: 'physics' }),
    row('outside'),
    row('keepa', { matchCount: 3 }),
    row('keepb', { matchCount: 2 }),
  ],
};
const exportTerms = ['phys', 'keepa', 'keepb', 'dec', 'tie', 'fb', 'ruled'].map((e) => ({
  english: e,
  icelandic: `${e}-is`,
}));
const units = [
  unit(1, 'm1', {
    'm1:para:keepa': 'We study keepa here.',
    'm1:para:keepb': 'Another keepb sentence.',
    'm1:para:phys': 'A phys one.',
  }),
];

describe('classifyRow', () => {
  const ctx = {
    rulingSet,
    exportPairs: new Set(exportTerms.map((t) => `${t.english}\0${t.icelandic}`)),
  };
  it('treats a null icelandic as a tie', () => {
    expect(classifyRow(row('keepa', { icelandic: null }), ctx)).toBe('tie');
  });
  it('lowercases against the ruling set', () => {
    expect(classifyRow(row('RULED'), ctx)).toBe('ruled');
  });
});

describe('buildPopulation', () => {
  const args = { rulingSet, exportTerms, units, seed: 's' };
  it('counts one row per class and keeps the keepers', () => {
    const p = buildPopulation({ census, ...args });
    expect(p.excluded).toEqual({
      ruled: 1,
      fallback: 1,
      tie: 1,
      decided: 1,
      physicsBiology: 1,
      notInExport: 1,
      noSentence: 0,
    });
    expect(p.rows.map((r) => r.english).sort()).toEqual(['keepa', 'keepb']);
    expect(p.physicsBiology.map((r) => r.english)).toEqual(['phys']);
  });
  it('shapes a row', () => {
    const p = buildPopulation({ census, ...args });
    expect(p.rows.find((r) => r.english === 'keepa')).toEqual({
      english: 'keepa',
      icelandic: 'keepa-is',
      matchCount: 3,
      sentences: ['We study keepa here.'],
    });
  });
  it('skips a match whose segment is absent and counts noSentence', () => {
    const c = {
      ...census,
      rows: [
        row('keepa', { matches: [{ chapter: 1, moduleId: 'm1', segmentId: 'm1:para:gone' }] }),
      ],
    };
    expect(buildPopulation({ census: c, ...args }).excluded.noSentence).toBe(1);
  });
  it('gives the same counts over the reduced census', () => {
    const reduced = reduceCensus(
      census,
      exportTerms.filter((t) => t.english !== 'outside'),
      rulingSet
    );
    expect(buildPopulation({ census: reduced, ...args }).excluded).toEqual(
      buildPopulation({ census, ...args }).excluded
    );
  });
});

describe('reduceCensus', () => {
  const partial = exportTerms.filter((t) => !['fb', 'tie', 'ruled'].includes(t.english));
  const reduced = reduceCensus(census, partial, rulingSet);
  it('drops and counts rows whose pair is not exported', () => {
    expect(reduced.rows.map((r) => r.english)).not.toContain('fb');
    expect(reduced.rows.map((r) => r.english)).not.toContain('tie');
  });
  it('counts the withheld by class', () => {
    expect(reduced.withheld).toEqual({
      ruled: 1,
      fallback: 1,
      tie: 1,
      decided: 0,
      physicsBiology: 0,
      notInExport: 1,
    });
  });
  it('strips alternatives and ifRemoved and keeps the rest', () => {
    const rest = { ...census.rows.find((r) => r.english === 'keepa') };
    delete rest.alternatives;
    delete rest.ifRemoved;
    expect(reduced.rows.find((r) => r.english === 'keepa')).toEqual(rest);
  });
  it('is marked reduced', () => {
    expect(reduced.reduced).toBe(true);
  });
});

describe('CONTROLS', () => {
  it('names the positives', () => {
    expect(CONTROLS.positives.map((p) => p.english)).toEqual([
      'balanced',
      'reduce',
      'depression',
      'vessel',
      'phases',
      'terms',
      'rays',
      'moles',
    ]);
  });
  it('names the negatives', () => {
    expect(CONTROLS.negatives.map((n) => n.english)).toEqual([
      'atom',
      'anode',
      'calorimeter',
      'bond length',
      'carbonate',
      'crystalline',
    ]);
  });
  it('is frozen', () => {
    expect(Object.isFrozen(CONTROLS.homograph[0].segmentIds)).toBe(true);
  });
});

describe('buildControls', () => {
  const segs = {};
  for (const h of CONTROLS.homograph)
    for (const id of h.segmentIds) segs[id] = 'We saw addition today.';
  let k = 0;
  for (const c of [...CONTROLS.positives, ...CONTROLS.negatives])
    segs[`mx:para:c${(k += 1)}`] = `A ${c.english} sentence.`;
  const full = [unit(1, 'mx', segs)];
  it('builds every control with sentences', () => {
    const c = buildControls({ units: full, seed: 's' });
    expect(c).toHaveLength(16);
    expect(c.every((x) => x.sentences.length > 0)).toBe(true);
  });
  it('refuses when a homograph segment is missing', () => {
    const rest = { ...segs };
    delete rest[CONTROLS.homograph[0].segmentIds[0]];
    expect(() => buildControls({ units: [unit(1, 'mx', rest)], seed: 's' })).toThrow(/missing/);
  });
});

describe('sentences', () => {
  it('covers all chapters with n = 5 over 3 chapters', () => {
    const occ = [1, 2, 3].flatMap((c) =>
      [0, 1, 2].map((i) => ({ chapter: c, segmentId: `m:p:c${c}${i}`, sentence: `ch${c} s${i}` }))
    );
    const chapters = new Set(sampleSentences(occ, { n: 5, seed: 's' }).map((s) => s.slice(0, 3)));
    expect(chapters).toEqual(new Set(['ch1', 'ch2', 'ch3']));
  });
  it('extracts the sentence holding the term, markers resolved', () => {
    expect(extractSentence('A [[b:bold]] word. The [[term:atom|t1]] is small.', 'atom')).toBe(
      'The atom is small.'
    );
  });
  it('matches whole words only', () => {
    expect(
      findOccurrences('atom', [unit(1, 'm', { 'm:p:a': 'atoms are small', 'm:p:b': 'an Atom!' })])
    ).toHaveLength(1);
  });
  it('picks evenly by matchCount', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ english: `e${i}`, matchCount: i }));
    expect(pickEvenly(rows, 5).map((r) => r.matchCount)).toEqual([0, 2, 4, 6, 8]);
  });
});

describe('assembleItems', () => {
  const population = {
    rows: Array.from({ length: 30 }, (_, i) => ({
      english: `w${i}`,
      icelandic: `i${i}`,
      matchCount: 1,
      sentences: ['s'],
    })),
    physicsBiology: [],
  };
  const controls = [
    {
      english: 'addition',
      icelandic: 'álagning',
      name: 'addition-adding',
      expected: 'flag',
      sentences: ['a'],
    },
    {
      english: 'addition',
      icelandic: 'álagning',
      name: 'addition-reaction',
      expected: 'fine',
      sentences: ['b'],
    },
    { english: 'atom', icelandic: 'atóm', name: 'atom', expected: 'fine', sentences: ['c'] },
  ];
  const out = assembleItems({ population, controls, seed: 's' });
  it('has unique ids', () => {
    expect(new Set(out.items.map((i) => i.id)).size).toBe(out.items.length);
  });
  it('gives every item the same keys', () => {
    expect(
      out.items.every((i) => Object.keys(i).sort().join() === 'english,icelandic,id,sentences')
    ).toBe(true);
  });
  it('is deterministic', () => {
    expect(assembleItems({ population, controls, seed: 's' })).toEqual(out);
  });
  it('keeps the homograph halves at least 8 apart', () => {
    const pos = out.items.map((i, n) => (i.english === 'addition' ? n : -1)).filter((n) => n >= 0);
    expect(pos[1] - pos[0]).toBeGreaterThanOrEqual(8);
  });
  it('moves a half that is too close, for a wide gap', () => {
    const o = assembleItems({ population, controls, seed: 's', minGap: 15 });
    const pos = o.items.map((i, n) => (i.english === 'addition' ? n : -1)).filter((n) => n >= 0);
    expect(pos[1] - pos[0]).toBeGreaterThanOrEqual(15);
  });
  it('throws when the gap cannot be met', () => {
    expect(() => assembleItems({ population, controls, seed: 's', minGap: 40 })).toThrow(/minGap/);
  });
  it('keys controls with name and expected', () => {
    const id = out.items.find((i) => i.sentences[0] === 'b').id;
    expect(out.key[id]).toEqual({ kind: 'control', name: 'addition-reaction', expected: 'fine' });
  });
});
