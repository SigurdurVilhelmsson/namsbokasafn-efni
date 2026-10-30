/**
 * English forms in amendments, and amendments files in order
 * (docs/decisions/2026-10-30-diffract-verb-and-imf-abbreviation.md, Consequences: "Whether the
 * amendments format can add an English form to an existing ruling, or needs a new amendment kind,
 * is found out when it is built").
 *
 * It could not: `add` took one English form and `retarget` changes only the target. And the
 * matcher (tools/lib/chapter-term-check.js headwordPattern) is word-bounded with only a plural
 * `-s`/`-es` for forms over 3 characters and NO suffix at all for shorter ones, so `diffract`
 * does not reach `diffracted` and `IMF` does not reach `IMFs`. Three additions:
 *   - `add` may list several English forms (`en` an array);
 *   - a new op, `forms`, adds English forms to an existing ruling, naming its current target so
 *     it refuses against a set it was not written for;
 *   - the compiler takes several amendments files in date order, each keeping its own date in
 *     the sources it writes (copying the 2026-10-29 entries into a 2026-10-30 file would have
 *     re-dated them).
 * The 2026-10-29 artifact stays byte-pinned by ai-review-ruling-amendments.test.js, which is what
 * proves none of this changes a set that does not use it.
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
  AMENDMENTS_ABOUT,
  CHAINED_FORMS_ABOUT,
} from '../ai-review/compile-ruling-set.js';
import { validateRulingSet, loadRulingSet } from '../ai-review/ruling-set.js';
import { usesHeadword } from '../lib/chapter-term-check.js';
import { matchesOccurrence, offeredRulings } from '../ai-review/worklist.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = 'experiments/terminology-consistency/results';
const BASE_REL = `${DIR}/2026-10-11/ruling-set-after-stage1.json`;
const EXC_REL = `${DIR}/2026-10-29/scope-exceptions-2026-10-29.json`;
const AMD29_REL = `${DIR}/2026-10-29/amendments-2026-10-29.json`;
const SET29_REL = `${DIR}/2026-10-29/ruling-set-2026-10-29.json`;
const AMD30_REL = `${DIR}/2026-10-30/amendments-2026-10-30.json`;
const SET30_REL = `${DIR}/2026-10-30/ruling-set-2026-10-30.json`;
const RECORD30 = 'docs/decisions/2026-10-30-diffract-verb-and-imf-abbreviation.md';
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
  ruled: '2026-10-30 [TEST]',
  scope: { kind: 'book' },
  ...extra,
});
const ROWS = [
  beforeRow('intermolecular force', 'millisameindakraftur'),
  beforeRow('diffraction', 'beygja'),
  beforeRow('concentrated', 'óþynnt'),
  beforeRow('fissile', null),
];
const baseInput = () => ({
  path: 'synthetic/base.json',
  text: JSON.stringify({ stage1: [], before: ROWS, supersededInBefore: [], inflectionNotes: [] }),
});
const excInput = () => ({
  path: 'synthetic/exceptions.json',
  text: JSON.stringify({
    about: 'synthetic',
    recordedAt: '2026-10-30',
    exceptions: [],
    senses: [],
  }),
});
const amdInput = (amendments, { recordedAt = '2026-10-30', name = 'a', record } = {}) => ({
  path: `synthetic/amendments-${name}.json`,
  text: JSON.stringify({
    about: 'synthetic amendments',
    recordedAt,
    record: record ?? `synthetic/record-${name}.md`,
    amendments,
  }),
});
const add = (en, is, extra = {}) => ({
  op: 'add',
  en,
  is,
  decision: `test: ${[en].flat()[0]}`,
  ...extra,
});
const forms = (enNorm, is, list, extra = {}) => ({
  op: 'forms',
  enNorm,
  is,
  forms: list,
  decision: `test: ${enNorm}`,
  ...extra,
});
const retarget = (enNorm, from, to) => ({
  op: 'retarget',
  enNorm,
  from,
  to,
  decision: `test: ${enNorm}`,
});
const remove = (enNorm, from) => ({ op: 'remove', enNorm, from, decision: `test: ${enNorm}` });
const compileWith = (amendments) => compileRulingSet(baseInput(), excInput(), amdInput(amendments));
const compileChain = (...files) => compileRulingSet(baseInput(), excInput(), files);

// ─── add with several English forms ──────────────────────────────────────

describe('add with several English forms', () => {
  const VERB = ['diffract', 'diffracted', 'diffracting'];

  it('lists every form, keyed on the first', () => {
    const r = ruling(compileWith([add(VERB, 'beygja')]), 'diffract');
    expect([r.id, r.en, r.is, r.kinds]).toEqual(['diffract', VERB, 'beygja', ['amendment']]);
  });

  it('control: a single string still adds one form', () => {
    expect(ruling(compileWith([add('diffract', 'beygja')]), 'diffract').en).toEqual(['diffract']);
  });

  it('its note lists the forms; a single-string add keeps the note it always had', () => {
    const noteOf = (out) => out.notes.find((n) => n.kind === 'amendment');
    expect(noteOf(compileWith([add(VERB, 'beygja')])).forms).toEqual(VERB);
    expect('forms' in noteOf(compileWith([add('diffract', 'beygja')]))).toBe(false);
  });

  it('refuses an empty list', () => {
    expect(() => compileWith([add([], 'beygja')])).toThrow(/en/);
  });

  it('refuses an untrimmed or empty form', () => {
    expect(() => compileWith([add(['diffract', ' diffracted'], 'beygja')])).toThrow(/trimmed/);
    expect(() => compileWith([add(['diffract', ''], 'beygja')])).toThrow(/en/);
  });

  it('refuses a form listed twice', () => {
    expect(() => compileWith([add(['diffract', 'diffract'], 'beygja')])).toThrow(/twice/);
  });

  it("refuses a form that is another headword's", () => {
    expect(() => compileWith([add(['diffract', 'Diffraction'], 'beygja')])).toThrow(/diffraction/);
  });
});

// ─── forms ───────────────────────────────────────────────────────────────

describe('forms: English forms added to an existing ruling', () => {
  const IMF = ['IMF', 'IMFs', 'I M F'];
  const amended = () => compileWith([forms('intermolecular force', 'millisameindakraftur', IMF)]);

  it('adds the forms beside the old one, target unchanged', () => {
    const r = ruling(amended(), 'intermolecular force');
    expect([r.en, r.is]).toEqual([
      ['I M F', 'IMF', 'IMFs', 'intermolecular force'],
      'millisameindakraftur',
    ]);
  });

  it("names the amendment among the ruling's kinds and sources, citing the record", () => {
    const r = ruling(amended(), 'intermolecular force');
    expect(r.kinds).toEqual(['amendment', 'entry']);
    expect(
      r.sources.some((s) => /^amendment 2026-10-30 forms: synthetic\/record-a\.md/.test(s))
    ).toBe(true);
  });

  it('control: a ruling the amendment does not name is unchanged', () => {
    expect(ruling(amended(), 'diffraction')).toEqual(ruling(compileWith([]), 'diffraction'));
  });

  it('leaves a note with the forms, from and to both the target (not a remove)', () => {
    const n = amended().notes.find((x) => x.kind === 'amendment');
    expect(n).toMatchObject({
      op: 'forms',
      enNorm: 'intermolecular force',
      from: 'millisameindakraftur',
      to: 'millisameindakraftur',
      forms: IMF,
    });
  });

  it('counts forms only when there are some (so an older set keeps its bytes)', () => {
    expect(amended().counts.amendments).toEqual({ retargeted: 0, added: 0, removed: 0, forms: 1 });
    expect(compileWith([]).counts.amendments).toEqual({ retargeted: 0, added: 0, removed: 0 });
  });

  it('refuses a target that is not the current one', () => {
    expect(() => compileWith([forms('intermolecular force', 'millikraftur', IMF)])).toThrow(
      /not the target/
    );
  });

  it('refuses a headword with no row, and a held one', () => {
    expect(() => compileWith([forms('imf', 'x', ['IMF'])])).toThrow(/matches no row/);
    expect(() => compileWith([forms('fissile', 'x', ['fissionable'])])).toThrow(/held/);
  });

  it('refuses a form the ruling already has', () => {
    expect(() =>
      compileWith([forms('intermolecular force', 'millisameindakraftur', ['Intermolecular force'])])
    ).toThrow(/already/);
  });

  it("refuses a form that is another headword's", () => {
    expect(() =>
      compileWith([forms('intermolecular force', 'millisameindakraftur', ['diffraction'])])
    ).toThrow(/diffraction/);
  });

  it('refuses an empty list, an untrimmed form and a form listed twice', () => {
    expect(() => compileWith([forms('intermolecular force', 'millisameindakraftur', [])])).toThrow(
      /forms/
    );
    expect(() =>
      compileWith([forms('intermolecular force', 'millisameindakraftur', ['IMF '])])
    ).toThrow(/trimmed/);
    expect(() =>
      compileWith([forms('intermolecular force', 'millisameindakraftur', ['IMF', 'IMF'])])
    ).toThrow(/twice/);
  });

  it('refuses an amendment carrying a key the op does not name', () => {
    expect(() =>
      compileWith([forms('intermolecular force', 'millisameindakraftur', IMF, { to: 'x' })])
    ).toThrow(/to/);
  });
});

// ─── several amendments files, in date order ─────────────────────────────

describe('amendments files in order', () => {
  const first = amdInput([retarget('concentrated', 'óþynnt', 'megn')], {
    name: 'a',
    recordedAt: '2026-10-29',
  });
  const second = amdInput([retarget('concentrated', 'megn', 'sterkur')], {
    name: 'b',
    recordedAt: '2026-10-30',
  });

  it('applies the second on top of the first', () => {
    expect(ruling(compileChain(first, second), 'concentrated').is).toBe('sterkur');
  });

  it('every replaced target survives as a competitor', () => {
    expect(ruling(compileChain(first, second), 'concentrated').competitors).toEqual([
      'megn',
      'óþynnt',
    ]);
  });

  it('each source keeps its own file’s date and record', () => {
    const s = ruling(compileChain(first, second), 'concentrated').sources;
    expect(s.filter((x) => x.startsWith('amendment')).map((x) => x.slice(0, 51))).toEqual([
      'amendment 2026-10-29 retarget: synthetic/record-a.m',
      'amendment 2026-10-30 retarget: synthetic/record-b.m',
    ]);
  });

  it('control: the second alone refuses, since it names a target only the first makes', () => {
    expect(() => compileChain(second)).toThrow(/not the target/);
  });

  it('refuses files out of date order, or two of one date', () => {
    expect(() => compileChain(second, first)).toThrow(/order/);
    const sameDay = amdInput([], { name: 'c', recordedAt: '2026-10-29' });
    expect(() => compileChain(first, sameDay)).toThrow(/order/);
  });

  it('refuses an amendment to a headword an earlier file removed', () => {
    const rm = amdInput([remove('concentrated', 'óþynnt')], {
      name: 'a',
      recordedAt: '2026-10-29',
    });
    expect(() => compileChain(rm, second)).toThrow(/removed/);
  });

  it('records the files as a list of {path, sha256}, in order; one file stays a single ref', () => {
    const out = compileChain(first, second);
    expect(out.amendments.map((r) => r.path)).toEqual([
      'synthetic/amendments-a.json',
      'synthetic/amendments-b.json',
    ]);
    expect(Array.isArray(compileChain(first).amendments)).toBe(false);
  });

  it('sums the counts over the files', () => {
    expect(compileChain(first, second).counts.amendments).toEqual({
      retargeted: 2,
      added: 0,
      removed: 0,
    });
  });

  it('about gains the chained-and-forms sentence only when a set uses either', () => {
    const plain = `${RULING_SET_ABOUT} ${AMENDMENTS_ABOUT}`;
    expect(compileChain(first).about).toBe(plain);
    expect(compileChain(first, second).about).toBe(`${plain} ${CHAINED_FORMS_ABOUT}`);
    const withForms = compileWith([forms('intermolecular force', 'millisameindakraftur', ['IMF'])]);
    expect(withForms.about).toBe(`${plain} ${CHAINED_FORMS_ABOUT}`);
  });

  it('the loader accepts a list of two or more refs and refuses a list of one or a bad ref', () => {
    const set = JSON.parse(serializeRulingSet(compileChain(first, second)));
    expect(() => validateRulingSet(set)).not.toThrow();
    const ref = { path: 'a.json', sha256: 'a'.repeat(64) };
    expect(() => validateRulingSet({ ...set, amendments: [ref] })).toThrow(/amendments/);
    expect(() =>
      validateRulingSet({ ...set, amendments: [ref, { path: 'b.json', sha256: 'no' }] })
    ).toThrow(/amendments/);
  });
});

// ─── The matcher reaches exactly the forms the record names ──────────────

describe('matching the new forms (tools/lib/chapter-term-check.js usesHeadword)', () => {
  // ≤ 3 characters: case-sensitive, no suffix. Over 3: case-insensitive, plural -s/-es.
  // So IMF and IMFs must both be listed, while I M F (5 characters) is in the other branch.
  it('IMF matches IMF, not IMFs, imf or a longer word', () => {
    expect(['the IMF is', 'two IMFs', 'an imf', 'IMFX'].map((t) => usesHeadword('IMF', t))).toEqual(
      [true, false, false, false]
    );
  });

  it('IMFs matches IMFs and not IMF', () => {
    expect(['two IMFs', 'the IMF'].map((t) => usesHeadword('IMFs', t))).toEqual([true, false]);
  });

  it('I M F matches the alt text and the spaced plural of m68770', () => {
    expect(
      ['Increasing I M F.', 'covalent bonds, I M F s. Under'].map((t) => usesHeadword('I M F', t))
    ).toEqual([true, true]);
  });

  it('I M F never matches a lone I, a partial sequence, or IMF', () => {
    expect(
      ['I think so', 'I M the one', 'M F only', 'the IMF', 'I M Fe2+'].map((t) =>
        usesHeadword('I M F', t)
      )
    ).toEqual([false, false, false, false, false]);
  });

  it('diffract matches diffract and diffracts, not diffracted, diffraction or diffractometer', () => {
    expect(
      ['to diffract', 'it diffracts', 'diffracted', 'diffraction', 'a diffractometer'].map((t) =>
        usesHeadword('diffract', t)
      )
    ).toEqual([true, true, false, false, false]);
  });

  it('control: diffracted and diffracting match their own forms, capitalised too', () => {
    expect(
      [
        ['diffracted', 'Diffracted waves'],
        ['diffracting', 'diffracting planes'],
      ].map(([f, t]) => usesHeadword(f, t))
    ).toEqual([true, true]);
  });
});

// ─── The committed 2026-10-30 artifact ───────────────────────────────────

const text30 = () => fs.readFileSync(path.join(REPO, SET30_REL), 'utf8');
const set30 = () => JSON.parse(text30());
const set29 = () => JSON.parse(fs.readFileSync(path.join(REPO, SET29_REL), 'utf8'));
const compile30 = () => {
  const { base, exceptions, amendments } = readInputs(BASE_REL, EXC_REL, [AMD29_REL, AMD30_REL]);
  return compileRulingSet(base, exceptions, amendments);
};

describe('the committed 2026-10-30 artifact', () => {
  it('re-compiling the committed inputs reproduces it byte for byte', () => {
    expect(serializeRulingSet(compile30())).toBe(text30());
  });

  it('loads through the loader', () => {
    expect(loadRulingSet(path.join(REPO, SET30_REL)).rulings.length).toBe(set30().rulings.length);
  });

  it('records its inputs by path and sha256, the two amendments files in date order', () => {
    const ref = (rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(REPO, rel))) });
    const c = set30();
    expect([c.base, c.exceptions, c.amendments]).toEqual([
      ref(BASE_REL),
      ref(EXC_REL),
      [ref(AMD29_REL), ref(AMD30_REL)],
    ]);
  });

  it('the 2026-10-30 file carries out only the 2026-10-30 record', () => {
    const f = JSON.parse(fs.readFileSync(path.join(REPO, AMD30_REL), 'utf8'));
    expect([f.record, f.amendments.every((a) => !('record' in a))]).toEqual([RECORD30, true]);
  });

  // Predicted before compiling: one add (the verb), one forms (IMF); nothing removed, nothing
  // becomes unmatchable (beygja is a plain word).
  it('predicted delta against 2026-10-29: rulings +1, excluded 0, unmatchable 0', () => {
    const [a, b] = [set29().counts, set30().counts];
    expect([b.rulings - a.rulings, b.excluded - a.excluded, b.unmatchable - a.unmatchable]).toEqual(
      [1, 0, 0]
    );
    expect(b.amendments).toEqual({ retargeted: 27, added: 12, removed: 1, forms: 1 });
  });

  it('the verb ruling: diffract → beygja, its three English forms, no competitor', () => {
    const r = ruling(set30(), 'diffract');
    expect([r.id, r.en, r.is, r.competitors, r.sense, r.matchable]).toEqual([
      'diffract',
      ['diffract', 'diffracted', 'diffracting'],
      'beygja',
      [],
      null,
      true,
    ]);
  });

  it('intermolecular force gains IMF, IMFs and I M F, target unchanged', () => {
    const [a, b] = [
      ruling(set29(), 'intermolecular force'),
      ruling(set30(), 'intermolecular force'),
    ];
    expect([b.en, b.is === a.is]).toEqual([['I M F', 'IMF', 'IMFs', 'intermolecular force'], true]);
  });

  it('changes no other ruling', () => {
    const changed = set29()
      .rulings.filter((r) => r.enNorm !== 'intermolecular force')
      .filter((r) => JSON.stringify(r) !== JSON.stringify(ruling(set30(), r.enNorm)))
      .map((r) => r.enNorm);
    expect(changed).toEqual([]);
  });

  it('the m68761 alt is now offered intermolecular force (it was not under 2026-10-29)', () => {
    // The real alt text's last sentence (02-for-mt/ch10/m68761, fs-idp1251008-alt).
    const occ = { en: 'There is a left-facing arrow. The arrow is labeled, “Increasing I M F.”' };
    expect(
      [set29(), set30()].map((s) =>
        matchesOccurrence(ruling(s, 'intermolecular force'), occ, s.rulings)
      )
    ).toEqual([false, true]);
  });

  it('control: a sentence with a lone I and no IMF is offered neither ruling', () => {
    const item = {
      occurrences: [{ en: 'I think the force is large.', is: 'Ég held að krafturinn sé mikill.' }],
    };
    const ids = offeredRulings({ item, rulings: set30().rulings, chapterDir: 'ch10' }).rulingIds;
    expect(ids.filter((id) => id === 'intermolecular-force' || id === 'diffract')).toEqual([]);
  });
});

// ─── The CLI takes --amendments more than once ───────────────────────────

describe('CLI', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruling-forms-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('writes the 2026-10-30 set from two --amendments flags, byte for byte', () => {
    const out = path.join(tmp, 'ruling-set-2026-10-30.json');
    const r = spawnSync(
      process.execPath,
      [
        CLI,
        '--base',
        BASE_REL,
        '--exceptions',
        EXC_REL,
        '--amendments',
        AMD29_REL,
        '--amendments',
        AMD30_REL,
        '--out',
        out,
      ],
      { cwd: REPO, encoding: 'utf8' }
    );
    expect([r.status, r.stderr]).toEqual([0, '']);
    expect(fs.readFileSync(out, 'utf8')).toBe(text30());
  });

  it('control: still refuses any other repeated flag', () => {
    const r = spawnSync(
      process.execPath,
      [CLI, '--base', BASE_REL, '--base', BASE_REL, '--exceptions', EXC_REL, '--out', 'x'],
      { cwd: REPO, encoding: 'utf8' }
    );
    expect([r.status, /given twice/.test(r.stderr)]).toEqual([1, true]);
  });
});
