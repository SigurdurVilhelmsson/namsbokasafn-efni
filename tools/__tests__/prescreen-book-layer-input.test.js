import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInput, EXPECTED_RULING_COUNT } from '../ai-review/prescreen-book-layer-input.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(
  here,
  '../../experiments/terminology-consistency/results/2026-11-18/c19-book-layer-input.json'
);

const ans = (id, choice, comment, extra = {}) => ({
  choice,
  comment,
  english: `en-${id}`,
  group: 'chemistry',
  icelandic: `is-${id}`,
  kind: 'wrong-sense',
  savedAt: '2026-11-18T10:00:00.000Z',
  text: '',
  ...extra,
});

function fixture() {
  const answers = {
    r001: ans('r001', 'remove', 'SKILYRÐI: made up. Úrskurðað 2026-11-18 með Claude.'),
    r002: ans('r002', 'replace', 'made up', { text: 'nýtt' }),
    r003: ans('r003', 'phrases', 'made up', { text: 'two words', phraseIcelandic: 'tvö orð' }),
    r004: ans('r004', 'keep', 'made up'),
    r005: ans('r005', 'remove', 'AÐEINS þessi lína'),
    r006: ans('r006', 'remove', 'SKILYRÐI: made up', { group: 'physics' }),
  };
  const verdicts = {
    population: Object.entries(answers).map(([id, a]) => ({
      id,
      english: a.english,
      icelandic: a.icelandic,
      group: a.group === 'chemistry' ? 'chemistry' : 'physicsBiology',
    })),
  };
  const census = {
    rows: Object.entries(answers).map(([_id, a], i) => ({
      english: a.english,
      icelandic: a.icelandic,
      domain: a.group,
      conceptId: 100 + i,
      ifRemoved: { next: `x${i}` },
    })),
  };
  return { rulings: { answers }, census, verdicts };
}
const build = (f, n = 6) => buildInput(f, { expectedCount: n });

describe('buildInput', () => {
  it('maps each choice to its actions and joins the conceptId', () => {
    const out = build(fixture());
    const by = (id) => out.actions.filter((a) => a.rulingId === id);
    expect(by('r001')).toMatchObject([{ kind: 'exclude-headword', english: 'en-r001' }]);
    expect(by('r001')[0].conceptId).toBeUndefined();
    expect(by('r002').map((a) => a.kind)).toEqual(['entry']);
    expect(by('r002')[0].entry).toEqual({
      english: ['en-r002'],
      icelandic: 'nýtt',
      replaces: [101],
    });
    expect(by('r004')).toEqual([]);
    expect(by('r005')).toMatchObject([
      {
        kind: 'exclude-concept',
        conceptId: 104,
        icelandicAtCensus: 'is-r005',
        domainAtCensus: 'chemistry',
      },
    ]);
    expect(out.actions.at(-1).rulingId).toBe('C234-8');
  });

  it('strips the attribution phrase from a comment, keeps the rest, and still reads the prefix', () => {
    const [a] = build(fixture()).actions.filter((x) => x.rulingId === 'r001');
    expect(a.kind).toBe('exclude-headword');
    expect(a.comment).toBe('SKILYRÐI: made up. Úrskurðað 2026-11-18.');
  });

  it('phrases: excludes the row only and adds the phrase entry with phraseIcelandic', () => {
    const acts = build(fixture()).actions.filter((a) => a.rulingId === 'r003');
    expect(acts.map((a) => a.kind)).toEqual(['exclude-concept', 'entry']);
    expect(acts[0].conceptId).toBe(102);
    expect(acts[1].entry).toEqual({ english: ['two words'], icelandic: 'tvö orð', replaces: [] });
  });

  it('phrases: omits the entry when an in-scope census row already has it', () => {
    const f = fixture();
    f.census.rows.push({
      english: 'two words',
      icelandic: 'tvö orð',
      domain: 'physics',
      conceptId: 9,
      ifRemoved: {},
    });
    const acts = build(f).actions.filter((a) => a.rulingId === 'r003');
    expect(acts.map((a) => a.kind)).toEqual(['exclude-concept']);
  });

  it('refuses a count other than 212', () => {
    expect(() => buildInput(fixture())).toThrow(/212/);
    expect(EXPECTED_RULING_COUNT).toBe(212);
  });

  it('refuses an ambiguous census match', () => {
    const f = fixture();
    f.census.rows.push({ ...f.census.rows[0], conceptId: 999 });
    expect(() => build(f)).toThrow(/r001/);
  });

  it('refuses a group/domain mismatch', () => {
    const f = fixture();
    f.census.rows[1].domain = 'biology';
    expect(() => build(f)).toThrow(/r002/);
  });

  it('refuses an unknown choice and an unknown prefix', () => {
    const f = fixture();
    f.rulings.answers.r004.choice = 'maybe';
    expect(() => build(f)).toThrow(/choice/);
    const g = fixture();
    g.rulings.answers.r005.comment = 'something else';
    expect(() => build(g)).toThrow(/prefix/);
  });
});

describe('the committed input', () => {
  const doc = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const n = (k) => doc.actions.filter((a) => a.kind === k).length;
  it('counts 107 exclude-headword and 10 exclude-concept', () => {
    expect(n('exclude-headword')).toBe(107);
    expect(n('exclude-concept')).toBe(10);
  });
  it('has 17 to 19 entries', () => {
    expect(n('entry')).toBeGreaterThanOrEqual(17);
    expect(n('entry')).toBeLessThanOrEqual(19);
  });
  it('no action carries census-alternative data', () => {
    const bad = doc.actions.filter((a) => 'ifRemovedAtCensus' in a || 'alternatives' in a);
    expect(bad).toEqual([]);
  });
  it('no comment carries the attribution phrase ([USER], 2026-11-19)', () => {
    const bad = doc.actions.filter((a) => /með Claude/.test(a.comment ?? ''));
    expect(bad.map((a) => a.rulingId)).toEqual([]);
    // control: the ruling text itself is kept — the date sentence the phrase followed is still there
    expect(doc.actions.some((a) => /Úrskurðað 2026-11-18\./.test(a.comment ?? ''))).toBe(true);
  });
  it('has a unique rulingId on every action', () => {
    const keys = doc.actions.map((a) => `${a.rulingId}/${a.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('records the rulings snapshot hash', () => {
    expect(doc.rulingsSha256).toBe(
      'de83082d1381eaa4a4de0427707efeb45c2b2d959978c3365104d098b02f3ce9'
    );
  });
});
