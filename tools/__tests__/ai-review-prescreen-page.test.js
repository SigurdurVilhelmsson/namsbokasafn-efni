/**
 * The private review page's data (c19; spec §8): only flagged rows, MT stem counts, path guards.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPageData, main, chapterDirOf, makeMtTextFor } from '../ai-review/prescreen-page.js';

const vrow = (id, verdict, extra = {}) => ({
  id,
  english: `en-${id}`,
  icelandic: 'hvarfast',
  group: 'chemistry',
  verdict,
  kind: verdict === 'flag' ? 'wrong-sense' : null,
  reason: verdict === 'flag' ? 'why' : null,
  proposed: [],
  rightSenses: null,
  sentences: ['A sentence.'],
  ...extra,
});
const crow = (id, matches) => ({
  english: `en-${id}`,
  icelandic: 'hvarfast',
  domain: 'chemistry',
  alternatives: ['other'],
  ifRemoved: { text: 'next', domain: 'chemistry' },
  matchCount: matches.length,
  matches,
});
const seg = (n) => ({ chapter: 1, moduleId: 'm1', segmentId: `p:x:s${n}` });
const PASS = {
  pass: true,
  results: [{ id: 'c1', name: 'atom', expected: 'fine', got: 'fine', ok: true }],
};
/** A verdicts document (c19-prescreen-verdicts/1) holding `population`. */
const V = (population, controls = PASS) => ({
  schema: 'c19-prescreen-verdicts/1',
  controls,
  population,
});
/** A private (full) census (c19-census/1) holding `rows`. */
const C = (rows, extra = {}) => ({ schema: 'c19-census/1', rows, ...extra });

describe('buildPageData', () => {
  const verdicts = V(
    [vrow('r1', 'fine'), vrow('r2', 'flag', { proposed: ['bregðast'] }), vrow('r3', 'unjudged')],
    {
      pass: false,
      results: [
        { id: 'c1', name: 'atom', expected: 'fine', got: 'fine', ok: true },
        { id: 'c2', name: 'vessel', expected: 'flag', got: 'fine', ok: false },
        { id: 'c3', name: 'rays', expected: 'flag', got: 'unjudged', ok: false },
      ],
    }
  );
  const privateCensus = C([
    crow('r1', [seg(1)]),
    crow('r2', [seg(1), seg(2), seg(3)]),
    crow('r3', [seg(4)]),
  ]);
  const texts = {
    s1: 'Efnið hvarfast við sýru.',
    s2: 'Ekkert hér.',
    s3: 'Þau hvarfast og bregðast.',
  };
  const mtTextFor = (c, m, s) => texts[s.split(':')[2]] ?? null;
  const data = buildPageData({ verdicts, privateCensus, mtTextFor });

  it('keeps only flagged rows', () => {
    expect(data.rows.map((r) => r.id)).toEqual(['r2']);
  });
  it('counts a word present in 2 of 3 matching segments as 2', () => {
    expect(data.rows[0].mt.current).toBe(2);
  });
  it('counts each proposed word by its stem', () => {
    expect(data.rows[0].mt.proposed).toEqual({ bregðast: 1 });
  });
  it('carries the private evidence and says the count is a stem match', () => {
    expect(data.rows[0].alternatives).toEqual(['other']);
    expect(data.instrumentNote).toMatch(/stem match/);
  });
  it('fails closed on a flagged row missing from the census', () => {
    expect(() => buildPageData({ verdicts, privateCensus: C([]), mtTextFor })).toThrow(
      /not in the census/
    );
  });
  it('gives each row its domain from the private census', () => {
    expect(data.rows[0].domain).toBe('chemistry');
  });
  it('lists the unjudged rows as open, with their sentences and the private fields', () => {
    expect(data.unjudged).toEqual([
      {
        id: 'r3',
        english: 'en-r3',
        icelandic: 'hvarfast',
        domain: 'chemistry',
        sentences: ['A sentence.'],
        alternatives: ['other'],
        ifRemoved: { text: 'next', domain: 'chemistry' },
        matchCount: 1,
      },
    ]);
  });
  it('fails closed on an unjudged row missing from the census', () => {
    const census = C([crow('r1', [seg(1)]), crow('r2', [seg(1)])]);
    expect(() => buildPageData({ verdicts, privateCensus: census, mtTextFor })).toThrow(
      /r3.*not in the census/
    );
  });
  it('carries the control gate: pass, and each miss with what it got, not judged apart', () => {
    expect(data.controls).toEqual({
      pass: false,
      total: 3,
      misses: [
        { id: 'c2', name: 'vessel', expected: 'flag', got: 'fine', outcome: 'missed' },
        { id: 'c3', name: 'rays', expected: 'flag', got: 'unjudged', outcome: 'not judged' },
      ],
    });
  });
  it('refuses a reduced census: it has no alternatives or ifRemoved to show', () => {
    const reduced = C(privateCensus.rows, { reduced: true });
    expect(() => buildPageData({ verdicts, privateCensus: reduced, mtTextFor })).toThrow(/reduced/);
  });
  it('refuses a census of another schema', () => {
    const other = { ...privateCensus, schema: 'c19-census/2' };
    expect(() => buildPageData({ verdicts, privateCensus: other, mtTextFor })).toThrow(/schema/);
  });
  it('refuses verdicts of another schema', () => {
    const other = { ...verdicts, schema: 'something/1' };
    expect(() => buildPageData({ verdicts: other, privateCensus, mtTextFor })).toThrow(/schema/);
  });
});

describe('denominator and proposed-word notes', () => {
  const run = (v, matches, mt) =>
    buildPageData({
      verdicts: V([v]),
      privateCensus: C([crow(v.id, matches)]),
      mtTextFor: (c, m, sid) => mt[sid.split(':')[2]] ?? null,
    }).rows[0];
  it('reports how many matching segments had MT text', () => {
    const r = run(vrow('d1', 'flag'), [seg(1), seg(2), seg(3)], { s1: 'hvarfast', s2: 'x' });
    expect(r.mt.segmentsWithMt).toBe(2);
  });
  it('says the counts are over segments with MT text', () => {
    expect(buildPageData({ verdicts: V([]), privateCensus: C([]) }).instrumentNote).toMatch(
      /WITH MT TEXT/
    );
  });
  it('notes a multiword proposed word as counted by its first word', () => {
    const r = run(vrow('d2', 'flag', { proposed: ['bregðast við', 'sundrast'] }), [seg(1)], {
      s1: 'bregðast',
    });
    expect(r.mt.firstWordOnly).toEqual(['bregðast við']);
    expect(r.mt.note).toMatch(/first word/);
  });
  it('has no multiword note when every proposed word is one word', () => {
    expect(
      run(vrow('d3', 'flag', { proposed: ['sundrast'] }), [seg(1)], {}).mt.note
    ).toBeUndefined();
  });
  it('collapses duplicate proposed words to one key', () => {
    const r = run(vrow('d4', 'flag', { proposed: ['sundrast', 'sundrast'] }), [seg(1)], {
      s1: 'sundrast',
    });
    expect([r.proposed, Object.keys(r.mt.proposed)]).toEqual([['sundrast'], ['sundrast']]);
  });
});

describe('makeMtTextFor (real reader)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mtroot-'));
  const put = (dir, mod, body) => {
    const d = path.join(root, 'books', 'efnafraedi-2e', '02-mt-output', dir);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `${mod}-segments.is.md`), body);
  };
  const file = (mod, n) =>
    `<!-- SEG:${mod}:para:a${n} -->\nBody ${mod} ${n}\n\n<!-- SEG:${mod}:para:b${n} -->\nSecond ${mod}\n\n`;
  put('ch01', 'm1', file('m1', 1));
  put('ch00', 'm0', file('m0', 0));
  put('appendices', 'mA', file('mA', 9));
  const read = makeMtTextFor(root);
  it('maps chapter 1 to ch01 and returns the segment body', () => {
    expect(read(1, 'm1', 'm1:para:a1').trim()).toBe('Body m1 1');
  });
  it('maps chapter 1 to ch01 and finds a second segment of the file', () => {
    expect(read(1, 'm1', 'm1:para:b1').trim()).toBe('Second m1');
  });
  it('maps chapter 0 to ch00', () => {
    expect(read(0, 'm0', 'm0:para:a0').trim()).toBe('Body m0 0');
  });
  it('maps chapter -1 to appendices', () => {
    expect(read(-1, 'mA', 'mA:para:a9').trim()).toBe('Body mA 9');
  });
  it('returns null for an absent file', () => {
    expect(read(1, 'nope', 'nope:para:a1')).toBeNull();
  });
  it('returns null for an absent segment', () => {
    expect(read(1, 'm1', 'm1:para:zz')).toBeNull();
  });
});

describe('chapterDirOf', () => {
  it('follows ruling P1', () => {
    expect([chapterDirOf(1), chapterDirOf(0), chapterDirOf(-1)]).toEqual([
      'ch01',
      'ch00',
      'appendices',
    ]);
  });
});

describe('main path guards', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'page-'));
  const repo = path.join(base, 'repo');
  const priv = path.join(base, 'private');
  const resultsDir = path.join(repo, 'experiments/terminology-consistency/results/x');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(priv, { recursive: true });
  const verdictsAbs = path.join(resultsDir, 'prescreen-verdicts.json');
  fs.writeFileSync(
    verdictsAbs,
    JSON.stringify(V([vrow('g1', 'flag', { proposed: ['bregðast'] })]))
  );
  const census = path.join(priv, 'census.json');
  fs.writeFileSync(census, JSON.stringify(C([crow('g1', [seg(1)])])));
  const verdictsRel = 'experiments/terminology-consistency/results/x/prescreen-verdicts.json';
  const deps = { repoRoot: repo, mtTextFor: () => 'hvarfast' };
  let n = 0;
  const fresh = () => path.join(priv, `out-${n++}.json`);
  const run = (args) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = main(args, deps);
    const msg = err.mock.calls.flat().join(' ');
    err.mockRestore();
    log.mockRestore();
    return { code, msg };
  };
  const ok = (over = {}) => ({
    verdicts: verdictsRel,
    'census-private': census,
    out: fresh(),
    ...over,
  });
  const argv = (o) => Object.entries(o).flatMap(([k, v]) => [`--${k}`, v]);

  it('control: valid inputs exit 0 and write page-data', () => {
    const o = ok();
    const r = run(argv(o));
    expect([r.code, fs.existsSync(o.out)]).toEqual([0, true]);
    expect(JSON.parse(fs.readFileSync(o.out, 'utf8')).rows).toHaveLength(1);
  });
  it('refuses an --out inside the repository, writing nothing', () => {
    const o = ok({ out: path.join(repo, 'p.json') });
    const r = run(argv(o));
    expect([r.code, r.msg, fs.existsSync(o.out)]).toEqual([
      1,
      expect.stringMatching(/--out must be outside the repository/),
      false,
    ]);
  });
  it('refuses a --census-private inside the repository, writing nothing', () => {
    const inside = path.join(repo, 'census.json');
    fs.copyFileSync(census, inside);
    const o = ok({ 'census-private': inside });
    const r = run(argv(o));
    expect([r.code, r.msg, fs.existsSync(o.out)]).toEqual([
      1,
      expect.stringMatching(/--census-private must be outside the repository/),
      false,
    ]);
  });
  it('refuses --verdicts outside the results directory, writing nothing', () => {
    const elsewhere = path.join(repo, 'other-verdicts.json');
    fs.copyFileSync(verdictsAbs, elsewhere);
    const o = ok({ verdicts: 'other-verdicts.json' });
    const r = run(argv(o));
    expect([r.code, r.msg, fs.existsSync(o.out)]).toEqual([
      1,
      expect.stringMatching(/--verdicts must be inside/),
      false,
    ]);
  });
  it('refuses an --out equal to --census-private, leaving the census intact', () => {
    const before = fs.readFileSync(census, 'utf8');
    const r = run(argv(ok({ out: census })));
    expect([r.code, r.msg, fs.readFileSync(census, 'utf8')]).toEqual([
      1,
      expect.stringMatching(/must not be the --census-private/),
      before,
    ]);
  });
  it('refuses an --out that already exists, leaving it untouched', () => {
    const existing = fresh();
    fs.writeFileSync(existing, 'KEEP');
    const r = run(argv(ok({ out: existing })));
    expect([r.code, r.msg, fs.readFileSync(existing, 'utf8')]).toEqual([
      1,
      expect.stringMatching(/already exists/),
      'KEEP',
    ]);
  });
  it('refuses an unknown flag', () => {
    expect(run(['--bogus', '1']).code).toBe(1);
  });
  it('refuses a --census-private that is the reduced census, writing nothing', () => {
    const reduced = path.join(priv, 'reduced.json');
    fs.writeFileSync(reduced, JSON.stringify(C([crow('g1', [seg(1)])], { reduced: true })));
    const o = ok({ 'census-private': reduced });
    const r = run(argv(o));
    expect([r.code, r.msg, fs.existsSync(o.out)]).toEqual([
      1,
      expect.stringMatching(/reduced/),
      false,
    ]);
  });
});
