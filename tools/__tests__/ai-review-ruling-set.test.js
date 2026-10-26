/**
 * The scoped ruling set for the AI-reviewed layer — spec
 * docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, "Unit B".
 *
 * The committed artifact is re-derived here from its committed inputs and compared BYTE FOR
 * BYTE, so a hand edit to the artifact, a changed input, or a non-deterministic compiler all
 * go red. Every refusal carries a passing control beside it, so a compiler that refused
 * everything (or nothing) cannot read as a pass.
 */

import { describe, it, expect } from 'vitest';
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
  slugOf,
  matchability,
  glossFreeKey,
} from '../ai-review/compile-ruling-set.js';
import {
  RULING_SET_SCHEMA,
  convertLegacyChapter,
  normalizeScope,
  validateRulingSet,
  loadRulingSet,
} from '../ai-review/ruling-set.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE_REL =
  'experiments/terminology-consistency/results/2026-10-11/ruling-set-after-stage1.json';
const EXC_REL =
  'experiments/terminology-consistency/results/2026-10-26/scope-exceptions-2026-10-26.json';
const OUT_REL = 'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json';
const CLI = path.join(REPO, 'tools', 'ai-review', 'compile-ruling-set.js');
const FOR_MT = path.join(REPO, 'books', 'efnafraedi-2e', '02-for-mt');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const committedText = () => fs.readFileSync(path.join(REPO, OUT_REL), 'utf8');
const committed = () => JSON.parse(committedText());
const compileCommitted = () => {
  const { base, exceptions } = readInputs(BASE_REL, EXC_REL);
  return compileRulingSet(base, exceptions);
};
const ruling = (set, enNorm) => set.rulings.find((r) => r.enNorm === enNorm);

// ─── Synthetic inputs for the refusal tests ──────────────────────────────

const beforeRow = (en, is, extra = {}) => ({
  en,
  enNorm: en
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase(),
  is,
  competitor: null,
  kind: is === null ? 'held' : 'entry',
  source: 'synthetic',
  ruled: '2026-10-26 [TEST]',
  scope: { kind: 'book' },
  ...extra,
});
const baseInput = (before, extra = {}) => ({
  path: 'synthetic/base.json',
  text: JSON.stringify({
    stage1: [],
    before,
    supersededInBefore: [],
    inflectionNotes: [],
    ...extra,
  }),
});
const excInput = (exceptions = []) => ({
  path: 'synthetic/exceptions.json',
  text: JSON.stringify({ about: 'synthetic', recordedAt: '2026-10-26', exceptions }),
});
const exception = (enNorm, scope, status = 'proposed') => ({
  enNorm,
  scope,
  status,
  source: 'synthetic',
  note: 'synthetic',
});

// ─── The committed artifact ──────────────────────────────────────────────

describe('the committed artifact', () => {
  it('re-compiling the committed inputs reproduces it byte for byte', () => {
    expect(serializeRulingSet(compileCommitted())).toBe(committedText());
  });

  it('compiling twice yields identical bytes (no clock, no randomness)', () => {
    expect(serializeRulingSet(compileCommitted())).toBe(serializeRulingSet(compileCommitted()));
  });

  it('carries no timestamp and no git HEAD', () => {
    const keys = Object.keys(committed());
    expect(keys.filter((k) => /compiledAt|repoHead|generatedAt|head/i.test(k))).toEqual([]);
  });

  it('has the spec’s top-level keys, in order', () => {
    expect(Object.keys(committed())).toEqual([
      'schema',
      'about',
      'base',
      'exceptions',
      'counts',
      'rulings',
      'excluded',
      'notes',
    ]);
  });

  it('declares its schema', () => {
    expect(committed().schema).toBe(RULING_SET_SCHEMA);
  });

  it('records the base by repo-relative path and the sha256 of its bytes', () => {
    expect(committed().base).toEqual({
      path: BASE_REL,
      sha256: sha256(fs.readFileSync(path.join(REPO, BASE_REL))),
    });
  });

  it('records the exceptions file by repo-relative path and the sha256 of its bytes', () => {
    expect(committed().exceptions).toEqual({
      path: EXC_REL,
      sha256: sha256(fs.readFileSync(path.join(REPO, EXC_REL))),
    });
  });

  it('ends with exactly one newline', () => {
    expect(committedText().endsWith('}\n')).toBe(true);
  });
});

// ─── Scope ───────────────────────────────────────────────────────────────

describe('scope', () => {
  it('group carries its proposed ch02 scope', () => {
    const r = ruling(committed(), 'group');
    expect([r.scope, r.scopeStatus]).toEqual([
      { kind: 'chapters', chapters: ['ch02'] },
      'proposed',
    ]);
  });

  it('cell carries its proposed ch17 scope', () => {
    const r = ruling(committed(), 'cell');
    expect([r.scope, r.scopeStatus]).toEqual([
      { kind: 'chapters', chapters: ['ch17'] },
      'proposed',
    ]);
  });

  it('exactly two rulings have a non-book scope (the test above is not vacuous)', () => {
    const nonBook = committed().rulings.filter((r) => r.scope.kind !== 'book');
    expect(nonBook.map((r) => r.enNorm).sort()).toEqual(['cell', 'group']);
  });

  it('every other ruling is book-wide with the default status', () => {
    const others = committed().rulings.filter((r) => !['cell', 'group'].includes(r.enNorm));
    const odd = others.filter((r) => r.scope.kind !== 'book' || r.scopeStatus !== 'default');
    expect(odd).toEqual([]);
  });

  it('the book-wide control population is non-empty', () => {
    const books = committed().rulings.filter((r) => r.scopeStatus === 'default');
    expect(books.length).toBeGreaterThan(300);
  });

  it('every chapter token is a real directory under books/efnafraedi-2e/02-for-mt/', () => {
    const tokens = committed().rulings.flatMap((r) => r.scope.chapters || []);
    const missing = tokens.filter(
      (t) => !fs.statSync(path.join(FOR_MT, t), { throwIfNoEntry: false })?.isDirectory()
    );
    expect([tokens.length, missing]).toEqual([2, []]);
  });

  it('records each scope exception with its source in the notes', () => {
    const notes = committed().notes.filter((n) => n.kind === 'scope-exception');
    expect(notes.map((n) => [n.enNorm, n.status])).toEqual([
      ['cell', 'proposed'],
      ['group', 'proposed'],
    ]);
  });
});

// ─── Rulings ─────────────────────────────────────────────────────────────

describe('rulings', () => {
  it('bonding orbital resolves to tengisvigrúm (supersededInBefore applied)', () => {
    expect(ruling(committed(), 'bonding orbital').is).toBe('tengisvigrúm');
  });

  it('the superseded target survives only as a competitor', () => {
    expect(ruling(committed(), 'bonding orbital').competitors).toContain('bindandi svigrúm');
  });

  it('held rows are excluded with reason held', () => {
    expect(committed().excluded).toEqual([
      { enNorm: 'fissile', reason: 'held' },
      { enNorm: 'fissionable', reason: 'held' },
      { enNorm: 'radioactive material', reason: 'held' },
      { enNorm: 'substituted', reason: 'held' },
    ]);
  });

  it('no excluded headword appears among the rulings', () => {
    const ex = new Set(committed().excluded.map((e) => e.enNorm));
    expect(committed().rulings.filter((r) => ex.has(r.enNorm))).toEqual([]);
  });

  it('one ruling per enNorm, and rulings + excluded cover every enNorm of the base', () => {
    const base = JSON.parse(fs.readFileSync(path.join(REPO, BASE_REL), 'utf8'));
    const all = new Set([...base.stage1, ...base.before].map((r) => r.enNorm));
    const set = committed();
    const seen = [...set.rulings.map((r) => r.enNorm), ...set.excluded.map((e) => e.enNorm)];
    expect([new Set(seen).size, seen.length]).toEqual([all.size, all.size]);
  });

  it('ids are unique lowercase-ASCII slugs, sorted', () => {
    const ids = committed().rulings.map((r) => r.id);
    const ok = ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id));
    expect([ok, new Set(ids).size === ids.length, [...ids].sort()]).toEqual([true, true, ids]);
  });

  it('σ and σ* bonding orbitals get distinct ids', () => {
    expect([slugOf('σ bonding orbital'), slugOf('σ* bonding orbital')]).toEqual([
      'sigma-bonding-orbital',
      'sigma-star-bonding-orbital',
    ]);
  });

  it('a slug refuses a character it has no transliteration for', () => {
    expect(() => slugOf('ʘ click')).toThrow(/transliteration/);
  });

  it('every en list holds a parenthetical-free form equal to its enNorm', () => {
    const bad = committed().rulings.filter(
      (r) => !r.en.some((f) => !f.includes('(') && f.toLowerCase() === r.enNorm)
    );
    expect(bad.map((r) => r.enNorm)).toEqual([]);
  });

  it('a parenthetical-only key term gains its bare form (heat (q) → heat)', () => {
    expect(ruling(committed(), 'heat').en).toEqual(['heat', 'heat (q)']);
  });

  it('no competitor equals its own target', () => {
    const bad = committed().rulings.filter((r) =>
      r.competitors.some((c) => c.toLowerCase() === r.is.toLowerCase())
    );
    expect(bad).toEqual([]);
  });

  it('a competitor that is only the target plus a gloss is dropped', () => {
    expect(ruling(committed(), 'standard electrode potential').competitors).toEqual([]);
  });

  it('control: a real competitor carrying a gloss stays', () => {
    expect(ruling(committed(), 'electrode potential').competitors).toEqual(['troðspenna (EX)']);
  });

  it('glossFreeKey removes nested parentheticals', () => {
    expect(glossFreeKey('Staðalraftroðsspenna ((EX°))')).toBe('staðalraftroðsspenna');
  });

  it('kinds name the base parts a ruling came from', () => {
    expect(ruling(committed(), 'group').kinds).toEqual(['entry', 'stage1']);
  });
});

// ─── Matchability ────────────────────────────────────────────────────────

describe('matchability', () => {
  it('at least one ruling is unmatchable, and every unmatchable ruling carries a reason', () => {
    const un = committed().rulings.filter((r) => r.matchable === false);
    const reasonless = un.filter(
      (r) => typeof r.unmatchableReason !== 'string' || !r.unmatchableReason
    );
    expect([un.length > 0, reasonless]).toEqual([true, []]);
  });

  it('no matchable ruling carries a reason', () => {
    const bad = committed().rulings.filter((r) => r.matchable && 'unmatchableReason' in r);
    expect(bad).toEqual([]);
  });

  it.each([
    ['sp3 hybrid orbital', /target-digit/],
    ['σ bonding orbital', /target-greek/],
    ['poh', /target-inner-capital/],
    ['standard hydrogen electrode', /target-operator-or-bracket/],
    ['half-life of a reaction', /target-operator-or-bracket/],
    ['positron [formula] or [formula]', /enNorm-placeholder/],
  ])('%s is unmatchable (%s)', (enNorm, reason) => {
    const r = ruling(committed(), enNorm);
    expect([r.matchable, reason.test(r.unmatchableReason)]).toEqual([false, true]);
  });

  it.each(['group', 'bonding orbital', 'brønsted-lowry acid', 'born-haber cycle'])(
    'control: %s is matchable',
    (enNorm) => {
      expect(ruling(committed(), enNorm).matchable).toBe(true);
    }
  );

  it('flags a digit, including a subscript digit', () => {
    expect(matchability('H₂-sameind', 'x').matchable).toBe(false);
  });

  it('flags an operator or bracket character', () => {
    expect(matchability('varmi (q)', 'heat').reason).toMatch(/target-operator-or-bracket/);
  });

  it('flags a non-ASCII space', () => {
    const nbsp = String.fromCodePoint(0xa0);
    expect(matchability(`stig${nbsp}á`, 'x').reason).toMatch(/target-space-or-control/);
  });

  it('flags an inner capital within one run of letters, not after a hyphen', () => {
    expect([
      matchability('pOH', 'poh').matchable,
      matchability('Born-Haber-hringur', 'x').matchable,
    ]).toEqual([false, true]);
  });

  it('control: a plain Icelandic target with a hyphen is matchable', () => {
    expect(matchability('Lewis-mynd', 'lewis structure')).toEqual({ matchable: true });
  });

  it('lists the trailing-gloss targets a strip would make matchable', () => {
    const notes = committed().notes.filter((n) => n.kind === 'trailing-gloss');
    expect(notes.map((n) => n.enNorm)).toContain('heat');
  });
});

// ─── Legacy chapters and scope shapes ────────────────────────────────────

describe('convertLegacyChapter', () => {
  it.each([
    [0, 'book'],
    [-1, 'appendices'],
    [5, 'ch05'],
    [17, 'ch17'],
    ['ch17', 'ch17'],
    ['ch00', 'ch00'],
    ['appendices', 'appendices'],
  ])('maps %j to %j', (input, out) => {
    expect(convertLegacyChapter(input)).toBe(out);
  });

  it.each(['chapter 3', 'ch3', 'book', '17', 'Ch17', -2, 1.5, 100, null, undefined, {}])(
    'refuses %j',
    (input) => {
      expect(() => convertLegacyChapter(input)).toThrow(/chapter/);
    }
  );
});

describe('normalizeScope', () => {
  it('keeps the book shape', () => {
    expect(normalizeScope({ kind: 'book' })).toEqual({ kind: 'book' });
  });

  it('converts legacy integers in a chapter list and orders it', () => {
    expect(normalizeScope({ kind: 'chapters', chapters: [-1, 17, 2] })).toEqual({
      kind: 'chapters',
      chapters: ['ch02', 'ch17', 'appendices'],
    });
  });

  it('reads a legacy [0] chapter list as book-wide', () => {
    expect(normalizeScope({ kind: 'chapters', chapters: [0] })).toEqual({ kind: 'book' });
  });

  it('refuses 0 mixed with other chapters (ambiguous)', () => {
    expect(() => normalizeScope({ kind: 'chapters', chapters: [0, 3] })).toThrow(/ambiguous/);
  });

  it('refuses 0 in an exclude list', () => {
    expect(() => normalizeScope({ kind: 'exclude', chapters: [0] })).toThrow(/ambiguous/);
  });

  it('accepts the exclude shape', () => {
    expect(normalizeScope({ kind: 'exclude', chapters: ['ch20'] })).toEqual({
      kind: 'exclude',
      chapters: ['ch20'],
    });
  });

  it.each([
    [{ kind: 'chapter', chapters: ['ch01'] }],
    [{ kind: 'book', chapters: ['ch01'] }],
    [{ kind: 'chapters', chapters: [] }],
    [{ kind: 'chapters', chapters: ['ch01', 'ch01'] }],
    [{ kind: 'chapters', chapters: 'ch01' }],
    [{ kind: 'chapters' }],
    ['book'],
    [null],
  ])('refuses %j', (scope) => {
    expect(() => normalizeScope(scope)).toThrow(/scope|chapter/);
  });
});

// ─── Refusals, each with a control ───────────────────────────────────────

describe('compile refusals', () => {
  it('control: a clean synthetic base compiles', () => {
    const out = compileRulingSet(baseInput([beforeRow('acid', 'sýra')]), excInput());
    expect(out.rulings.map((r) => [r.id, r.is])).toEqual([['acid', 'sýra']]);
  });

  it('control: two rows of one enNorm whose targets differ only by case compile', () => {
    const rows = [beforeRow('acid', 'sýra'), beforeRow('acid', 'Sýra', { kind: 'verdict' })];
    expect(compileRulingSet(baseInput(rows), excInput()).rulings).toHaveLength(1);
  });

  it('refuses two rows of one enNorm with different targets', () => {
    const rows = [beforeRow('acid', 'sýra'), beforeRow('acid', 'súr', { kind: 'verdict' })];
    expect(() => compileRulingSet(baseInput(rows), excInput())).toThrow(/different targets/);
  });

  it('refuses an exception whose enNorm matches no row', () => {
    const exc = excInput([exception('base', { kind: 'chapters', chapters: ['ch14'] })]);
    expect(() => compileRulingSet(baseInput([beforeRow('acid', 'sýra')]), exc)).toThrow(
      /matches no row/
    );
  });

  it('control: an exception that matches applies its scope and status', () => {
    const exc = excInput([exception('acid', { kind: 'chapters', chapters: [14] }, 'ruled')]);
    const r = compileRulingSet(baseInput([beforeRow('acid', 'sýra')]), exc).rulings[0];
    expect([r.scope, r.scopeStatus]).toEqual([{ kind: 'chapters', chapters: ['ch14'] }, 'ruled']);
  });

  it('refuses an exception on a held headword', () => {
    const exc = excInput([exception('fissile', { kind: 'chapters', chapters: ['ch21'] })]);
    expect(() => compileRulingSet(baseInput([beforeRow('fissile', null)]), exc)).toThrow(
      /held|excluded/
    );
  });

  it('refuses two exceptions for one enNorm', () => {
    const e = exception('acid', { kind: 'chapters', chapters: ['ch14'] });
    expect(() =>
      compileRulingSet(baseInput([beforeRow('acid', 'sýra')]), excInput([e, e]))
    ).toThrow(/duplicate/);
  });

  it('refuses an exception status other than proposed or ruled', () => {
    const exc = excInput([exception('acid', { kind: 'book' }, 'maybe')]);
    expect(() => compileRulingSet(baseInput([beforeRow('acid', 'sýra')]), exc)).toThrow(/status/);
  });

  it('refuses an exception carrying a key the schema does not name', () => {
    const exc = excInput([{ ...exception('acid', { kind: 'book' }), chapters: [3] }]);
    expect(() => compileRulingSet(baseInput([beforeRow('acid', 'sýra')]), exc)).toThrow(/key/);
  });

  it('refuses a supersession whose from matches nothing', () => {
    const base = baseInput([beforeRow('acid', 'sýra')], {
      supersededInBefore: [{ enNorm: 'acid', from: 'súr', to: 'sýra' }],
    });
    expect(() => compileRulingSet(base, excInput())).toThrow(
      /supersession .* matches no before row/
    );
  });

  it('control: a supersession that matches drops the old row', () => {
    const base = baseInput(
      [beforeRow('acid', 'súr'), beforeRow('acid', 'sýra', { kind: 'verdict' })],
      { supersededInBefore: [{ enNorm: 'acid', from: 'súr', to: 'sýra' }] }
    );
    const r = compileRulingSet(base, excInput()).rulings[0];
    expect([r.is, r.competitors]).toEqual(['sýra', ['súr']]);
  });

  it('refuses a base row whose scope is not book-wide (widths come through the exceptions file)', () => {
    const rows = [beforeRow('acid', 'sýra', { scope: { kind: 'chapters', chapters: [14] } })];
    expect(() => compileRulingSet(baseInput(rows), excInput())).toThrow(/exceptions file/);
  });

  it('refuses a headword that is both held and ruled', () => {
    const rows = [beforeRow('acid', 'sýra'), beforeRow('acid', null)];
    expect(() => compileRulingSet(baseInput(rows), excInput())).toThrow(/held/);
  });

  it('refuses a row whose enNorm is not the normalised en', () => {
    const rows = [{ ...beforeRow('acid', 'sýra'), enNorm: 'acids' }];
    expect(() => compileRulingSet(baseInput(rows), excInput())).toThrow(/enNorm/);
  });

  it('refuses two enNorms that mint the same id', () => {
    const rows = [beforeRow('a b', 'x'), beforeRow('a-b', 'y')];
    expect(() => compileRulingSet(baseInput(rows), excInput())).toThrow(/same id/);
  });

  it('refuses an absolute input path (the artifact must be portable)', () => {
    const base = { ...baseInput([beforeRow('acid', 'sýra')]), path: '/tmp/base.json' };
    expect(() => compileRulingSet(base, excInput())).toThrow(/repo-relative/);
  });
});

// ─── loadRulingSet ───────────────────────────────────────────────────────

describe('loadRulingSet', () => {
  it('loads the committed artifact with the sha256 of its bytes', () => {
    expect(loadRulingSet(OUT_REL).sha256).toBe(sha256(fs.readFileSync(path.join(REPO, OUT_REL))));
  });

  it('indexes every ruling by id', () => {
    const set = loadRulingSet(OUT_REL);
    expect([set.byId.size, set.byId.get('bonding-orbital').is]).toEqual([
      set.rulings.length,
      'tengisvigrúm',
    ]);
  });

  it('returns frozen rulings', () => {
    expect(Object.isFrozen(loadRulingSet(OUT_REL).rulings[0].scope)).toBe(true);
  });

  it('control: the committed artifact validates in memory', () => {
    expect(() => validateRulingSet(committed())).not.toThrow();
  });

  it('refuses a wrong schema', () => {
    expect(() => validateRulingSet({ ...committed(), schema: 'ai-review-ruling-set/0' })).toThrow(
      /schema/
    );
  });

  it('refuses a legacy integer chapter token in the artifact', () => {
    const set = committed();
    const i = set.rulings.findIndex((r) => r.enNorm === 'cell');
    set.rulings[i].scope = { kind: 'chapters', chapters: [17] };
    expect(() => validateRulingSet(set)).toThrow(/chapter/);
  });

  it('refuses a duplicate id', () => {
    const set = committed();
    set.rulings[1] = { ...set.rulings[1], id: set.rulings[0].id };
    expect(() => validateRulingSet(set)).toThrow(/id/);
  });

  it('refuses an unmatchable ruling without a reason', () => {
    const set = committed();
    const i = set.rulings.findIndex((r) => r.matchable === false);
    delete set.rulings[i].unmatchableReason;
    expect(() => validateRulingSet(set)).toThrow(/unmatchableReason/);
  });

  it('refuses a default status on a non-book scope', () => {
    const set = committed();
    const i = set.rulings.findIndex((r) => r.enNorm === 'cell');
    set.rulings[i].scopeStatus = 'default';
    expect(() => validateRulingSet(set)).toThrow(/default/);
  });
});

// ─── CLI ─────────────────────────────────────────────────────────────────

describe('CLI', () => {
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ruling-set-'));

  it('writes the committed artifact byte for byte', () => {
    const out = path.join(tmp(), 'ruling-set-2026-10-26.json');
    const r = run(['--base', BASE_REL, '--exceptions', EXC_REL, '--out', out]);
    expect([r.status, fs.readFileSync(out, 'utf8') === committedText()]).toEqual([0, true]);
  });

  it('refuses an unknown flag and writes nothing', () => {
    const dir = tmp();
    const out = path.join(dir, 'ruling-set-2026-10-26.json');
    const r = run(['--base', BASE_REL, '--exceptions', EXC_REL, '--out', out, '--dry-run']);
    expect([r.status, fs.existsSync(out)]).toEqual([1, false]);
  });

  it('refuses to write over its frozen base', () => {
    const before = sha256(fs.readFileSync(path.join(REPO, BASE_REL)));
    const r = run(['--base', BASE_REL, '--exceptions', EXC_REL, '--out', BASE_REL]);
    expect([r.status, sha256(fs.readFileSync(path.join(REPO, BASE_REL)))]).toEqual([1, before]);
  });

  it('refuses an output name that is not a dated ruling set', () => {
    const out = path.join(tmp(), 'whatever.json');
    const r = run(['--base', BASE_REL, '--exceptions', EXC_REL, '--out', out]);
    expect([r.status, fs.existsSync(out)]).toEqual([1, false]);
  });

  it('refuses when a required flag is missing', () => {
    expect(run(['--base', BASE_REL]).status).toBe(1);
  });
});
