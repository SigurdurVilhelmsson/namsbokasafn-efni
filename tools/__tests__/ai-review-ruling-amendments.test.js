/**
 * Amendments to the scoped ruling set: a dated, cited input that retargets, adds or removes a
 * ruling (docs/decisions/2026-10-29-glossary-ruling-conflicts-resolved.md, Consequences: "the
 * ruling set cannot take these by hand … applying this record needs a dated amendments input
 * to the compiler").
 *
 * Two parts. Synthetic inputs exercise each amendment and each refusal, every refusal with a
 * passing control beside it. Then the committed 2026-10-29 artifact is recompiled from its
 * three committed inputs and compared BYTE FOR BYTE, and [USER]'s 35 decisions are pinned
 * against it one by one. The 2026-10-26 artifact (no amendments) stays pinned by
 * ai-review-ruling-set.test.js, which is what proves the amendments input is optional.
 */

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  compileRulingSet,
  readInputs,
  serializeRulingSet,
  RULING_SET_ABOUT,
} from '../ai-review/compile-ruling-set.js';
import { validateRulingSet, loadRulingSet } from '../ai-review/ruling-set.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = 'experiments/terminology-consistency/results';
const BASE_REL = `${DIR}/2026-10-11/ruling-set-after-stage1.json`;
const OLD_REL = `${DIR}/2026-10-26/ruling-set-2026-10-26.json`;
const EXC_REL = `${DIR}/2026-10-29/scope-exceptions-2026-10-29.json`;
const AMD_REL = `${DIR}/2026-10-29/amendments-2026-10-29.json`;
const OUT_REL = `${DIR}/2026-10-29/ruling-set-2026-10-29.json`;
const RECORD = 'docs/decisions/2026-10-29-glossary-ruling-conflicts-resolved.md';
const RECORD_HEAT = 'docs/decisions/2026-10-29-heat-compounds-and-symbol-trims.md';
const CLI = path.join(REPO, 'tools', 'ai-review', 'compile-ruling-set.js');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const ruling = (set, enNorm) => set.rulings.find((r) => r.enNorm === enNorm);

// ─── Synthetic inputs ────────────────────────────────────────────────────

const norm = (en) =>
  en
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const beforeRow = (en, is, extra = {}) => ({
  en,
  enNorm: norm(en),
  is,
  competitor: null,
  kind: is === null ? 'held' : 'entry',
  source: 'synthetic',
  ruled: '2026-10-29 [TEST]',
  scope: { kind: 'book' },
  ...extra,
});
const ROWS = [
  beforeRow('heat (q)', 'varmi (q)'),
  beforeRow('vacancy', 'tóm', { competitor: 'eyða' }),
  beforeRow('concentrated', 'óþynnt', { competitor: 'megn' }),
  beforeRow('valence', 'gildi'),
  beforeRow('fissile', null),
];
const baseInput = (before = ROWS) => ({
  path: 'synthetic/base.json',
  text: JSON.stringify({ stage1: [], before, supersededInBefore: [], inflectionNotes: [] }),
});
const excInput = (exceptions = [], senses = []) => ({
  path: 'synthetic/exceptions.json',
  text: JSON.stringify({ about: 'synthetic', recordedAt: '2026-10-29', exceptions, senses }),
});
const amdFile = (amendments, extra = {}) => ({
  about: 'synthetic amendments',
  recordedAt: '2026-10-29',
  record: 'synthetic/record.md',
  amendments,
  ...extra,
});
const amdInput = (amendments, extra) => ({
  path: 'synthetic/amendments.json',
  text: JSON.stringify(amdFile(amendments, extra)),
});
const retarget = (enNorm, from, to, extra = {}) => ({
  op: 'retarget',
  enNorm,
  from,
  to,
  decision: `test: ${enNorm}`,
  ...extra,
});
const add = (en, is, extra = {}) => ({ op: 'add', en, is, decision: `test: ${en}`, ...extra });
const remove = (enNorm, from, extra = {}) => ({
  op: 'remove',
  enNorm,
  from,
  decision: `test: ${enNorm}`,
  ...extra,
});
const compileWith = (amendments, { exc = excInput(), extra } = {}) =>
  compileRulingSet(baseInput(), exc, amdInput(amendments, extra));

// ─── Without amendments nothing changes ──────────────────────────────────

describe('the amendments input is optional', () => {
  it('without it, the artifact has no amendments key and the unchanged about', () => {
    const out = compileRulingSet(baseInput(), excInput());
    expect([Object.keys(out).includes('amendments'), out.about]).toEqual([false, RULING_SET_ABOUT]);
  });

  it('control: with an empty list it records the file, after exceptions', () => {
    const out = compileWith([]);
    expect(Object.keys(out).slice(2, 5)).toEqual(['base', 'exceptions', 'amendments']);
  });

  it('with it, about says so (and still begins with the unchanged text)', () => {
    const out = compileWith([]);
    expect([
      out.about.startsWith(RULING_SET_ABOUT),
      out.about.length > RULING_SET_ABOUT.length,
    ]).toEqual([true, true]);
  });

  it('records the amendments file by path and the sha256 of its bytes', () => {
    const input = amdInput([]);
    const out = compileRulingSet(baseInput(), excInput(), input);
    expect(out.amendments).toEqual({ path: input.path, sha256: sha256(Buffer.from(input.text)) });
  });

  it('the result validates through the loader', () => {
    const out = compileWith([retarget('vacancy', 'tóm', 'eyða')]);
    expect(validateRulingSet(JSON.parse(serializeRulingSet(out)))).toBeTruthy();
  });
});

// ─── retarget ────────────────────────────────────────────────────────────

describe('retarget', () => {
  it('replaces the target', () => {
    expect(ruling(compileWith([retarget('vacancy', 'tóm', 'eyða')]), 'vacancy').is).toBe('eyða');
  });

  it('keeps the old target as a competitor, and drops the new target from them', () => {
    const r = ruling(compileWith([retarget('vacancy', 'tóm', 'eyða')]), 'vacancy');
    expect(r.competitors).toEqual(['tóm']);
  });

  it("names the amendment among the ruling's kinds and sources, citing the record", () => {
    const r = ruling(compileWith([retarget('vacancy', 'tóm', 'eyða')]), 'vacancy');
    expect([r.kinds, r.sources.some((s) => s.includes('synthetic/record.md'))]).toEqual([
      ['amendment', 'entry'],
      true,
    ]);
  });

  it('a symbol trim makes the ruling matchable and leaves no competitor', () => {
    const r = ruling(compileWith([retarget('heat', 'varmi (q)', 'varmi')]), 'heat');
    expect([r.is, r.matchable, r.competitors]).toEqual(['varmi', true, []]);
  });

  it('control: without the trim the same ruling is unmatchable', () => {
    expect(ruling(compileWith([]), 'heat').matchable).toBe(false);
  });

  it('compares from case-insensitively, as a supersession does', () => {
    expect(ruling(compileWith([retarget('vacancy', 'Tóm', 'eyða')]), 'vacancy').is).toBe('eyða');
  });

  it('refuses a from that is not the current target', () => {
    expect(() => compileWith([retarget('vacancy', 'gat', 'eyða')])).toThrow(/is not the target/);
  });

  it('refuses a headword with no row', () => {
    expect(() => compileWith([retarget('vacuum', 'tóm', 'eyða')])).toThrow(/matches no row/);
  });

  it('refuses a held headword', () => {
    expect(() => compileWith([retarget('fissile', 'kljúfanlegur', 'x')])).toThrow(/held/);
  });

  it('refuses a no-op (to equals from)', () => {
    expect(() => compileWith([retarget('vacancy', 'tóm', 'tóm')])).toThrow(/changes nothing/);
  });

  it('refuses an untrimmed or empty to', () => {
    expect(() => compileWith([retarget('vacancy', 'tóm', ' eyða')])).toThrow(/trimmed/);
  });
});

// ─── add ─────────────────────────────────────────────────────────────────

describe('add', () => {
  it('adds a book-wide ruling with no competitors, of kind amendment', () => {
    const r = ruling(compileWith([add('valence electron', 'gildisrafeind')]), 'valence electron');
    expect([r.id, r.is, r.competitors, r.kinds, r.scope, r.sense]).toEqual([
      'valence-electron',
      'gildisrafeind',
      [],
      ['amendment'],
      { kind: 'book' },
      null,
    ]);
  });

  it('counts the added headword among the enNorms and the rulings', () => {
    const before = compileWith([]).counts;
    const after = compileWith([add('valence electron', 'gildisrafeind')]).counts;
    expect([after.enNorms - before.enNorms, after.rulings - before.rulings]).toEqual([1, 1]);
  });

  it('refuses a headword that already has rows (retarget it instead)', () => {
    expect(() => compileWith([add('valence', 'gildistala')])).toThrow(/already has rows/);
  });

  it('refuses a held headword (it has rows too)', () => {
    expect(() => compileWith([add('fissile', 'kljúfanlegur')])).toThrow(/already has rows/);
  });

  it('control: a sense may name an added headword', () => {
    const sense = {
      enNorm: 'valence electron',
      sense: 'outer-electron',
      gloss: 'an outer-shell electron',
      otherSenses: [{ id: 'other', gloss: 'anything else' }],
      status: 'ruled',
      source: 'synthetic',
      glossBy: 'synthetic',
    };
    const out = compileWith([add('valence electron', 'gildisrafeind')], {
      exc: excInput([], [sense]),
    });
    expect(ruling(out, 'valence electron').sense.id).toBe('outer-electron');
  });
});

// ─── remove ──────────────────────────────────────────────────────────────

describe('remove', () => {
  it('lists the headword as excluded with reason removed', () => {
    const out = compileWith([remove('concentrated', 'óþynnt')]);
    expect([
      ruling(out, 'concentrated'),
      out.excluded.find((e) => e.enNorm === 'concentrated'),
    ]).toEqual([undefined, { enNorm: 'concentrated', reason: 'removed' }]);
  });

  it('keeps the enNorm count: rulings + excluded still cover every headword', () => {
    const out = compileWith([remove('concentrated', 'óþynnt')]);
    expect(out.rulings.length + out.excluded.length).toBe(out.counts.enNorms);
  });

  it('refuses a from that is not the current target', () => {
    expect(() => compileWith([remove('concentrated', 'megn')])).toThrow(/is not the target/);
  });

  it('refuses a held headword (it is excluded already)', () => {
    expect(() => compileWith([remove('fissile', 'x')])).toThrow(/held/);
  });

  it('refuses a sense on a removed headword', () => {
    const sense = {
      enNorm: 'concentrated',
      sense: 'a',
      gloss: 'a',
      otherSenses: [{ id: 'b', gloss: 'b' }],
      status: 'ruled',
      source: 'synthetic',
      glossBy: 'synthetic',
    };
    expect(() =>
      compileWith([remove('concentrated', 'óþynnt')], { exc: excInput([], [sense]) })
    ).toThrow(/removed/);
  });
});

// ─── The file itself ─────────────────────────────────────────────────────

describe('the amendments file', () => {
  it('writes one note per amendment, citing the record and the decision', () => {
    const out = compileWith([retarget('vacancy', 'tóm', 'eyða'), remove('concentrated', 'óþynnt')]);
    expect(out.notes.filter((n) => n.kind === 'amendment')).toEqual([
      {
        kind: 'amendment',
        op: 'remove',
        enNorm: 'concentrated',
        from: 'óþynnt',
        to: null,
        record: 'synthetic/record.md',
        decision: 'test: concentrated',
      },
      {
        kind: 'amendment',
        op: 'retarget',
        enNorm: 'vacancy',
        from: 'tóm',
        to: 'eyða',
        record: 'synthetic/record.md',
        decision: 'test: vacancy',
      },
    ]);
  });

  it('counts each kind of amendment', () => {
    const out = compileWith([
      retarget('vacancy', 'tóm', 'eyða'),
      add('valence electron', 'gildisrafeind'),
      remove('concentrated', 'óþynnt'),
    ]);
    expect(out.counts.amendments).toEqual({ retargeted: 1, added: 1, removed: 1 });
  });

  it('control: without the file, counts carry no amendments key', () => {
    expect('amendments' in compileRulingSet(baseInput(), excInput()).counts).toBe(false);
  });

  it('refuses two amendments of one headword', () => {
    expect(() =>
      compileWith([retarget('vacancy', 'tóm', 'eyða'), remove('vacancy', 'eyða')])
    ).toThrow(/two amendments/);
  });

  it('refuses an unknown op', () => {
    expect(() => compileWith([{ op: 'rename', enNorm: 'vacancy', decision: 'x' }])).toThrow(/op/);
  });

  it('refuses an amendment carrying a key its op does not name', () => {
    expect(() => compileWith([retarget('vacancy', 'tóm', 'eyða', { en: 'vacancy' })])).toThrow(
      /unexpected key/
    );
  });

  it('refuses an amendment without a decision', () => {
    expect(() => compileWith([retarget('vacancy', 'tóm', 'eyða', { decision: '' })])).toThrow(
      /decision/
    );
  });

  it('control: an amendment may cite its own record, which its note and source carry', () => {
    const out = compileWith([retarget('vacancy', 'tóm', 'eyða', { record: 'synthetic/other.md' })]);
    expect([
      out.notes.find((n) => n.kind === 'amendment').record,
      ruling(out, 'vacancy').sources.some((x) => x.includes('synthetic/other.md')),
    ]).toEqual(['synthetic/other.md', true]);
  });

  it('refuses an amendment whose own record is empty', () => {
    expect(() => compileWith([retarget('vacancy', 'tóm', 'eyða', { record: '' })])).toThrow(
      /record/
    );
  });

  it('refuses a file without a record', () => {
    expect(() => compileWith([], { extra: { record: '' } })).toThrow(/record/);
  });

  it('refuses a file without recordedAt as YYYY-MM-DD', () => {
    expect(() => compileWith([], { extra: { recordedAt: '29 Oct' } })).toThrow(/recordedAt/);
  });

  it('refuses a file carrying a key the schema does not name', () => {
    expect(() => compileWith([], { extra: { rulings: [] } })).toThrow(/unexpected key/);
  });
});

// ─── The loader ──────────────────────────────────────────────────────────

describe('loader', () => {
  const withAmendmentsRef = (ref) => {
    const set = JSON.parse(serializeRulingSet(compileWith([])));
    set.amendments = ref;
    return set;
  };

  it('control: a well-formed amendments reference validates', () => {
    expect(() =>
      validateRulingSet(withAmendmentsRef({ path: 'a.json', sha256: 'a'.repeat(64) }))
    ).not.toThrow();
  });

  it('refuses a malformed amendments reference', () => {
    expect(() => validateRulingSet(withAmendmentsRef({ path: 'a.json', sha256: 'nope' }))).toThrow(
      /amendments/
    );
  });
});

// ─── The committed 2026-10-29 artifact ───────────────────────────────────

const committedText = () => fs.readFileSync(path.join(REPO, OUT_REL), 'utf8');
const committed = () => JSON.parse(committedText());
const compileCommitted = () => {
  const { base, exceptions, amendments } = readInputs(BASE_REL, EXC_REL, AMD_REL);
  return compileRulingSet(base, exceptions, amendments);
};
const old = () => JSON.parse(fs.readFileSync(path.join(REPO, OLD_REL), 'utf8'));

describe('the committed 2026-10-29 artifact', () => {
  it('re-compiling the committed inputs reproduces it byte for byte', () => {
    expect(serializeRulingSet(compileCommitted())).toBe(committedText());
  });

  it('loads through the loader', () => {
    expect(loadRulingSet(path.join(REPO, OUT_REL)).rulings.length).toBe(committed().rulings.length);
  });

  it('records its three inputs by path and sha256', () => {
    const ref = (rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(REPO, rel))) });
    const c = committed();
    expect([c.base, c.exceptions, c.amendments]).toEqual([
      ref(BASE_REL),
      ref(EXC_REL),
      ref(AMD_REL),
    ]);
  });

  it('every amendment cites one of the two 2026-10-29 records, and both are cited', () => {
    const notes = committed().notes.filter((n) => n.kind === 'amendment');
    expect([...new Set(notes.map((n) => n.record))].sort()).toEqual([RECORD, RECORD_HEAT].sort());
  });

  it('counts: 27 retargeted (the conflict record’s 21 plus valence, and five symbol trims), 11 added, 1 removed', () => {
    expect(committed().counts.amendments).toEqual({ retargeted: 27, added: 11, removed: 1 });
  });

  // Predicted before compiling: +11 added, −1 removed; the eleven symbol trims (six from the
  // conflict record, five from the heat record) leave the unmatchable list and nothing joins it.
  it('predicted delta against 2026-10-26: rulings +10, excluded +1, unmatchable −11', () => {
    const [a, b] = [old().counts, committed().counts];
    expect([b.rulings - a.rulings, b.excluded - a.excluded, b.unmatchable - a.unmatchable]).toEqual(
      [10, 1, -11]
    );
  });

  it('changes no ruling the amendments do not name', () => {
    const named = new Set(
      committed()
        .notes.filter((n) => n.kind === 'amendment')
        .map((n) => n.enNorm)
    );
    named.add('becquerel'); // its sense is new; its target is a retarget, named anyway
    const changed = old()
      .rulings.filter((r) => !named.has(r.enNorm))
      .filter((r) => JSON.stringify(r) !== JSON.stringify(ruling(committed(), r.enNorm)))
      .map((r) => r.enNorm);
    expect(changed).toEqual([]);
  });
});

describe("[USER]'s 35 decisions, against the committed artifact", () => {
  const STANDS = {
    accuracy: 'hittni',
    'atomic orbital': 'atómsvigrúm',
    'alpha particle': 'alfaeind',
    'bonding orbital': 'tengisvigrúm',
    'dipole moment': 'tvískautsvægi',
    'dissociation constant': 'klofnunarfasti',
    'electron affinity': 'rafeindasækni',
    'polyatomic ion': 'fjölatómajón',
    'rate law': 'hraðalögmál',
  };
  const GLOSSARY_WINS = {
    'alpha decay': 'alfasundrun',
    'beta decay': 'betasundrun',
    becquerel: 'bekerel',
    'bimolecular reaction': 'tvísameinda efnahvarf',
    calorie: 'kaloría',
    'collision theory': 'árekstrakenningin',
    'electron capture': 'rafeindarhremming',
    'electron volt': 'rafeindarvolt',
    'frequency factor': 'tíðnistuðull',
    'geiger counter': 'Geiger-nemi',
    heat: 'varmi',
    'lattice energy': 'grindarorka',
    molality: 'mólalstyrkur',
    nucleon: 'kjarnaeind',
    osmosis: 'himnuflæði',
    'osmotic pressure': 'flæðiþrýstingur',
    solute: 'leyst efni',
    'standing wave': 'stæð bylgja',
  };
  // Number, gender and the definite article are not conflicts (entry rule 3): the dictionary
  // form is the target, except the deliberate definite lotukerfið.
  const BY_GRAMMAR = {
    isomers: 'hverfur',
    'intermolecular force': 'millisameindakraftur',
    monodentate: 'eintenntur',
    calorimetry: 'varmamæling',
    'periodic table': 'lotukerfið',
  };
  const OTHER = {
    valence: 'gildistala',
    'valence electron': 'gildisrafeind',
    'valence bond': 'gildistengi',
    'valence band': 'gildisborði',
    'valence shell': 'gildishvolf',
    'valence orbital': 'gildissvigrúm',
    vacancy: 'eyða',
    'concentrated acid': 'megn sýra',
    'concentrated base': 'megn basi',
  };

  it.each(Object.entries({ ...STANDS, ...GLOSSARY_WINS, ...BY_GRAMMAR, ...OTHER }))(
    '%s → %s',
    (enNorm, is) => {
      expect(ruling(committed(), enNorm)?.is).toBe(is);
    }
  );

  it('the 9 standing rulings are byte-identical to 2026-10-26', () => {
    const differ = Object.keys(STANDS).filter(
      (k) => JSON.stringify(ruling(old(), k)) !== JSON.stringify(ruling(committed(), k))
    );
    expect(differ).toEqual([]);
  });

  it('every ruled target is matchable', () => {
    const all = { ...STANDS, ...GLOSSARY_WINS, ...BY_GRAMMAR, ...OTHER };
    expect(Object.keys(all).filter((k) => !ruling(committed(), k)?.matchable)).toEqual([]);
  });

  it('standalone concentrated is removed, not ruled', () => {
    expect(committed().excluded).toContainEqual({ enNorm: 'concentrated', reason: 'removed' });
  });

  it('vacancy keeps tóm and eyðuveila as competitors, never its own target', () => {
    expect(ruling(committed(), 'vacancy').competitors).toEqual(['eyðuveila', 'tóm']);
  });

  it('valence keeps the old ruling gildi and the glossary typo girðitala as competitors', () => {
    expect(ruling(committed(), 'valence').competitors).toEqual(['gildi', 'girðitala']);
  });

  it('becquerel is restricted to the unit sense, ruled', () => {
    const s = ruling(committed(), 'becquerel').sense;
    expect([s.id, s.status, s.otherSenses.map((o) => o.id)]).toEqual([
      'unit',
      'ruled',
      ['person-name'],
    ]);
  });

  it('heat is restricted to the noun sense, ruled', () => {
    const s = ruling(committed(), 'heat').sense;
    expect([s.id, s.status, s.otherSenses.map((o) => o.id)]).toEqual([
      'thermal-energy',
      'ruled',
      ['verb-to-heat'],
    ]);
  });

  it.each([
    ['heat capacity', 'varmarýmd'],
    ['heat of combustion', 'brunavarmi'],
    ['heat transfer', 'varmaflutningur'],
    ['heat exchanger', 'varmaskiptir'],
    ['body-centered cubic solid', 'miðlægt teningslaga fast efni'],
    ['face-centered cubic solid', 'hliðlægt teningslaga fast efni'],
    ['gamma emission', 'gammaútgeislun'],
    ['half-life of a reaction', 'helmingunartími efnahvarfs'],
    ['standard hydrogen electrode', 'staðalvetnisraftroð'],
  ])('heat record: %s → %s, matchable', (enNorm, is) => {
    const r = ruling(committed(), enNorm);
    expect([r?.is, r?.matchable]).toEqual([is, true]);
  });

  it('the 2026-10-26 senses carry over unchanged', () => {
    const ids = (set) =>
      set.rulings
        .filter((r) => r.sense)
        .map((r) => [r.enNorm, r.sense])
        .filter(([k]) => k !== 'becquerel' && k !== 'heat');
    expect(ids(committed())).toEqual(ids(old()));
  });
});

// ─── CLI ─────────────────────────────────────────────────────────────────

describe('CLI with --amendments', () => {
  const made = [];
  afterAll(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ruling-amend-'));
    made.push(d);
    return d;
  };
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

  it('writes the committed artifact byte for byte', () => {
    const out = path.join(tmp(), 'ruling-set-2026-10-29.json');
    const r = run([
      '--base',
      BASE_REL,
      '--exceptions',
      EXC_REL,
      '--amendments',
      AMD_REL,
      '--out',
      out,
    ]);
    expect([r.status, r.stderr, fs.readFileSync(out, 'utf8') === committedText()]).toEqual([
      0,
      '',
      true,
    ]);
  });

  // --amendments may repeat since 2026-10-30, in date order; the same file twice is two files
  // of one date, which the order check refuses (ai-review-ruling-amendments-forms.test.js).
  it('refuses the same --amendments file given twice', () => {
    const out = path.join(tmp(), 'ruling-set-2026-10-29.json');
    const r = run([
      '--base',
      BASE_REL,
      '--exceptions',
      EXC_REL,
      '--amendments',
      AMD_REL,
      '--amendments',
      AMD_REL,
      '--out',
      out,
    ]);
    expect([r.status, fs.existsSync(out)]).toEqual([1, false]);
  });
});
