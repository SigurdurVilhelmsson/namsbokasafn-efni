import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  loadUnits,
  formatCensus,
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
  it('counts a physics row whose pair is not exported as notInExport', () => {
    expect(classifyRow(row('physout', { domain: 'physics' }), ctx)).toBe('notInExport');
  });
  it('classifies an exported physics row as physicsBiology', () => {
    expect(classifyRow(row('phys', { domain: 'physics' }), ctx)).toBe('physicsBiology');
  });
  it('throws when the ruling set has no rulings array', () => {
    expect(() => classifyRow(row('a'), { rulingSet: {}, exportPairs: new Set() })).toThrow(
      /rulings/
    );
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
      physicsBiologyNoSentence: 0,
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
  it('gives the same counts and lists over the reduced census, withholding ruled, fallback and tie', () => {
    const partial = exportTerms.filter((t) => !['fb', 'tie', 'ruled'].includes(t.english));
    const reduced = reduceCensus(census, partial, rulingSet);
    expect(reduced.withheld.ruled + reduced.withheld.fallback + reduced.withheld.tie).toBe(3);
    const a = buildPopulation({ census: reduced, ...args, exportTerms: partial });
    const b = buildPopulation({ census, ...args, exportTerms: partial });
    expect(a).toEqual(b);
  });
  it('keeps a non-exported physics row out of physicsBiology, from a full census', () => {
    const c = { ...census, rows: [...census.rows, row('physout', { domain: 'physics' })] };
    const u = [
      unit(1, 'm1', {
        ...Object.fromEntries(units[0].segments.map((s) => [s.segmentId, s.en])),
        'm1:para:physout': 'A physout here.',
      }),
    ];
    const full = buildPopulation({ census: c, ...args, units: u });
    expect(full.physicsBiology.map((r) => r.english)).toEqual(['phys']);
    expect(full.excluded.notInExport).toBe(2);
    const reduced = reduceCensus(c, exportTerms, rulingSet);
    expect(buildPopulation({ census: reduced, ...args, units: u })).toEqual(full);
  });
  it('counts a keep row with no sentence in noSentence and a physics one apart', () => {
    const c = {
      ...census,
      rows: [
        row('keepa', { matches: [{ chapter: 1, moduleId: 'm1', segmentId: 'm1:para:gone' }] }),
        row('phys', {
          domain: 'physics',
          matches: [{ chapter: 1, moduleId: 'm1', segmentId: 'm1:para:gone' }],
        }),
      ],
    };
    const { excluded } = buildPopulation({ census: c, ...args });
    expect([
      excluded.noSentence,
      excluded.physicsBiologyNoSentence,
      excluded.physicsBiology,
    ]).toEqual([1, 1, 0]);
  });
  it('counts the census matches with no local segment and with no local sentence, by group', () => {
    const m = (id) => ({ chapter: 1, moduleId: 'm1', segmentId: id });
    const c = {
      ...census,
      rows: [
        row('keepa', { matches: [m('m1:para:keepa'), m('m1:para:gone'), m('m1:para:keepb')] }),
        row('phys', { domain: 'physics', matches: [m('m1:para:phys'), m('m1:para:gone2')] }),
        row('ruled', { matches: [m('m1:para:gone3')] }),
      ],
    };
    expect(buildPopulation({ census: c, ...args }).localMatches).toEqual({
      chemistry: { total: 3, noLocalSegment: 1, noLocalSentence: 1 },
      physicsBiology: { total: 2, noLocalSegment: 1, noLocalSentence: 0 },
    });
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
  it('never keeps a row with a null or empty icelandic', () => {
    const c = {
      schema: 'c19-census/1',
      rows: [row('x', { icelandic: null }), row('y', { icelandic: '' })],
    };
    const out = reduceCensus(
      c,
      [
        { english: 'x', icelandic: '' },
        { english: 'y', icelandic: '' },
      ],
      rulingSet
    );
    expect(out.rows).toEqual([]);
    expect(out.withheld.tie).toBe(2);
  });
  it('refuses a census of another schema', () => {
    expect(() => reduceCensus({ ...census, schema: 'x/1' }, exportTerms, rulingSet)).toThrow(
      /schema/
    );
  });
  it('refuses an already reduced census', () => {
    expect(() => reduceCensus(reduced, exportTerms, rulingSet)).toThrow(/reduced/);
  });
  it('does not carry dbPath', () => {
    const out = reduceCensus({ ...census, dbPath: '/prod/x.db' }, exportTerms, rulingSet);
    expect('dbPath' in out).toBe(false);
  });
  it('keeps only the allowed keys: a field the census gains later is not published', () => {
    const grown = {
      ...census,
      book: 'efnafraedi-2e',
      head: 'f'.repeat(40),
      readAt: '2026-11-18T00:00:00.000Z',
      hostname: 'prod-box',
      rows: census.rows.map((r) => ({
        ...r,
        secretNote: 'private',
        matches: r.matches.map((x) => ({ ...x, isText: 'Icelandic text' })),
      })),
    };
    const out = reduceCensus(grown, exportTerms, rulingSet);
    expect({
      top: Object.keys(out).sort(),
      row: [...new Set(out.rows.flatMap((r) => Object.keys(r)))].sort(),
      match: [...new Set(out.rows.flatMap((r) => r.matches.flatMap((x) => Object.keys(x))))].sort(),
    }).toEqual({
      top: ['book', 'head', 'readAt', 'reduced', 'rows', 'schema', 'withheld'],
      row: [
        'chapters',
        'conceptId',
        'domain',
        'english',
        'icelandic',
        'isFallback',
        'isTied',
        'issueCount',
        'matchCount',
        'matches',
        'reason',
      ],
      match: ['chapter', 'moduleId', 'segmentId'],
    });
  });
});

describe('formatCensus', () => {
  const doc = { ...reduceCensus(census, exportTerms, rulingSet), exportSource: { path: 'x' } };
  it('parses back to the same document', () => {
    expect(JSON.parse(formatCensus(doc))).toEqual(doc);
  });
  it('writes one row per line, each line a JSON row', () => {
    const lines = formatCensus(doc).split('\n');
    const rows = lines.slice(1, 1 + doc.rows.length).map((l) => JSON.parse(l.replace(/,$/, '')));
    expect([lines.length, rows]).toEqual([doc.rows.length + 3, doc.rows]);
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
  it('limits the adding half to wrong-sense and some-senses-only', () => {
    expect(CONTROLS.homograph[0].flagKinds).toEqual(['wrong-sense', 'some-senses-only']);
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
  it('drops a bare [[BR]] token, so the sentence reads across it', () => {
    expect(extractSentence('The atom[[BR]]is small.', 'atom')).toBe('The atom is small.');
  });
  it('collapses runs of bare [[SPACE]] tokens to one space', () => {
    expect(extractSentence('A[[SPACE]][[SPACE]]big atom here.', 'atom')).toBe('A big atom here.');
  });
  it('keeps the ellipsis for a MATH marker beside a bare [[BR]] token', () => {
    expect(extractSentence('Set[[BR]]x = [[MATH:3]] for the atom.', 'atom')).toBe(
      'Set x = … for the atom.'
    );
  });
  it.each([
    ['[[xref:fs-id123]]', 'See … for atom.'],
    ['[[docref:m123]]', 'See … for atom.'],
    ['[[xref:Figure 1|fs-id123]]', 'See Figure 1 for atom.'],
    ['[[link:the site|http://x.org]]', 'See the site for atom.'],
  ])('resolves %s to its visible text or an ellipsis', (marker, expected) => {
    expect(extractSentence(`See ${marker} for atom.`, 'atom')).toBe(expected);
  });
  it('decodes the HTML escapes in the sentence sent to the model', () => {
    expect(
      extractSentence('PG&amp;E said x &lt; y &gt; z, &quot;q&quot; it&#39;s the atom.', 'atom')
    ).toBe('PG&E said x < y > z, "q" it\'s the atom.');
  });
  it('decodes in one pass: an escaped escape stays one level escaped', () => {
    expect(extractSentence('Write &amp;lt; for the atom.', 'atom')).toBe(
      'Write &lt; for the atom.'
    );
  });
  it('does not match a headword inside an escape', () => {
    expect(findOccurrences('amp', [unit(1, 'm', { 'm:p:a': 'Used by PG&amp;E.' })])).toHaveLength(
      0
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
  it('moves a half that starts too close to (i + floor(len/2)) mod len', () => {
    const o = assembleItems({ population, controls, seed: 'seed9' });
    const pos = o.items.map((i, n) => (i.english === 'addition' ? n : -1)).filter((n) => n >= 0);
    expect(pos).toEqual([6, 25]);
  });
  it('throws when the gap cannot be met', () => {
    expect(() => assembleItems({ population, controls, seed: 's', minGap: 40 })).toThrow(/minGap/);
  });
  it('copies flagKinds into the key only where present', () => {
    const o = assembleItems({
      population,
      controls: [
        { ...controls[0], flagKinds: ['wrong-sense', 'some-senses-only'] },
        controls[1],
        controls[2],
      ],
      seed: 's',
    });
    const id = (c) => o.items.find((i) => i.sentences[0] === c).id;
    expect(o.key[id('a')].flagKinds).toEqual(['wrong-sense', 'some-senses-only']);
    expect('flagKinds' in o.key[id('b')]).toBe(false);
  });
  it('keys controls with name and expected', () => {
    const id = out.items.find((i) => i.sentences[0] === 'b').id;
    expect(out.key[id]).toEqual({ kind: 'control', name: 'addition-reaction', expected: 'fine' });
  });
});

describe('loadUnits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prescreen-units-'));
  const put = (sub, file, id) => {
    fs.mkdirSync(path.join(dir, '02-for-mt', sub), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '02-for-mt', sub, file),
      `<!-- SEG:${id}:para:p1 -->\nText ${id}.\n`
    );
  };
  put('ch02', 'm2-segments.en.md', 'm2');
  put('ch00', 'm0b-segments.en.md', 'm0b');
  put('ch00', 'm0a-segments.en.md', 'm0a');
  put('appendices', 'ma-segments.en.md', 'ma');
  fs.writeFileSync(path.join(dir, '02-for-mt', 'stray.txt'), 'x');
  const units = loadUnits(dir);
  it('numbers chapters 0, 2 and -1, skips a stray file, and sorts', () => {
    expect(units.map((u) => [u.chapter, u.moduleId])).toEqual([
      [0, 'm0a'],
      [0, 'm0b'],
      [2, 'm2'],
      [-1, 'ma'],
    ]);
  });
  it('reads the segments', () => {
    expect(units[0].segments).toEqual([{ segmentId: 'm0a:para:p1', en: 'Text m0a.' }]);
  });
});
