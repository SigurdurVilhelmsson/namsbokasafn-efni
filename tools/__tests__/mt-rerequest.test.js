/**
 * The pure halves of the re-request mode (plan 2026-10-10 §2.3; plan
 * docs/superpowers/plans/2026-11-08-rerequest-mode.md, Task 1): which named segments may be
 * re-requested, what goes on the wire, and how each answer is classified.
 *
 * 🔴 SELECTION IS FAIL-CLOSED ON RESIDUE: an id whose current body is already translated is
 * refused, so a typo can never re-buy a translated segment. "Untranslated" is
 * `detectResidue(...).exact`, the same predicate that found the 8 September segments.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_ATTEMPTS,
  REREQUEST_RULE,
  parseRerequestIds,
  planRerequest,
  classifyAttempt,
} from '../lib/mt-rerequest.js';

const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n\n`;
const P0_EN = 'Atoms are small.';
const P0_IS = 'Frumeindir eru litlar.';
const P1_EN = 'Water boils at one hundred degrees under normal pressure.';
const P1_IS = 'Vatn sýður við hundrað gráður við venjulegan þrýsting.';
const P2_EN = 'The [[term:boiling point|term-00001]] depends strongly on the surrounding pressure.';
const P2_IS = '[[term:Suðumarkið|term-00001]] veltur mjög á þrýstingnum umhverfis.';

const EN = seg('m100:para:p0', P0_EN) + seg('m100:para:p1', P1_EN) + seg('m100:para:p2', P2_EN);
// p1 and p2 came back as English; p0 was translated. Layer-1 files end with no newline.
const IS = (
  seg('m100:para:p0', P0_IS) +
  seg('m100:para:p1', P1_EN) +
  seg('m100:para:p2', P2_EN)
).trimEnd();

const plan = (o = {}) =>
  planRerequest({
    enText: EN,
    baseText: IS,
    ids: ['m100:para:p1'],
    selectedKeys: new Set(),
    untranslatedCounts: new Map(),
    ...o,
  });

describe('constants', () => {
  it('two attempts per run, and the rule name the overlay records', () => {
    expect([MAX_ATTEMPTS, REREQUEST_RULE]).toEqual([2, 'rerequest']);
  });
});

describe('parseRerequestIds', () => {
  it('splits a comma list and trims each id', () => {
    expect(parseRerequestIds(' m100:para:p1, m100:para:p2 ')).toEqual([
      'm100:para:p1',
      'm100:para:p2',
    ]);
  });
  it('refuses an empty list', () => {
    expect(() => parseRerequestIds('')).toThrow(/no ids/);
  });
  it('refuses an empty item (trailing comma)', () => {
    expect(() => parseRerequestIds('m100:para:p1,')).toThrow(/empty/);
  });
  it('refuses an id that is not three [\\w-] parts', () => {
    expect(() => parseRerequestIds('m100:para')).toThrow(/m100:para/);
    expect(() => parseRerequestIds('m100:para:a.b')).toThrow(/m100:para:a\.b/);
  });
  it('refuses an id whose module is not m<digits>', () => {
    expect(() => parseRerequestIds('chapter:title:t1')).toThrow(/chapter:title:t1/);
  });
  it('refuses a repeated id', () => {
    expect(() => parseRerequestIds('m100:para:p1,m100:para:p1')).toThrow(/m100:para:p1/);
  });
});

describe('planRerequest', () => {
  it('requests an untranslated id and builds its wire text', () => {
    const p = plan();
    expect([p.requested, p.refused, p.wireText]).toEqual([
      ['m100:para:p1'],
      [],
      `<!-- SEG:m100:para:p1 -->\n${P1_EN}\n\n`,
    ]);
  });
  it('orders requested ids as the EN does, whatever order they were named in', () => {
    expect(plan({ ids: ['m100:para:p2', 'm100:para:p1'] }).requested).toEqual([
      'm100:para:p1',
      'm100:para:p2',
    ]);
  });
  it('refuses an id the EN lacks: not-in-en', () => {
    expect(plan({ ids: ['m100:para:nope'] }).refused).toEqual([
      { id: 'm100:para:nope', why: 'not-in-en' },
    ]);
  });
  it('refuses an id the IS lacks: not-in-is', () => {
    const baseText = seg('m100:para:p0', P0_IS).trimEnd();
    expect(plan({ baseText }).refused).toEqual([{ id: 'm100:para:p1', why: 'not-in-is' }]);
  });
  it('refuses an id that occurs twice in the EN or the IS: duplicated-id', () => {
    const twiceEn = EN + seg('m100:para:p1', P1_EN);
    const twiceIs = IS + '\n\n' + seg('m100:para:p1', P1_EN).trimEnd();
    expect([plan({ enText: twiceEn }).refused, plan({ baseText: twiceIs }).refused]).toEqual([
      [{ id: 'm100:para:p1', why: 'duplicated-id' }],
      [{ id: 'm100:para:p1', why: 'duplicated-id' }],
    ]);
  });
  it('refuses an id already in the overlay: already-selected', () => {
    expect(plan({ selectedKeys: new Set(['m100:para:p1']) }).refused).toEqual([
      { id: 'm100:para:p1', why: 'already-selected' },
    ]);
  });
  it('refuses an id with two untranslated answers: already-flagged', () => {
    expect(plan({ untranslatedCounts: new Map([['m100:para:p1', 2]]) }).refused).toEqual([
      { id: 'm100:para:p1', why: 'already-flagged' },
    ]);
  });
  it('control: an id with one untranslated answer is still requested', () => {
    expect(plan({ untranslatedCounts: new Map([['m100:para:p1', 1]]) }).requested).toEqual([
      'm100:para:p1',
    ]);
  });
  it('refuses an id whose base body is translated: not-untranslated', () => {
    expect(plan({ ids: ['m100:para:p0'] }).refused).toEqual([
      { id: 'm100:para:p0', why: 'not-untranslated' },
    ]);
  });
  it('a refusal leaves the id out of the wire text', () => {
    const p = plan({ ids: ['m100:para:p0', 'm100:para:p1'] });
    expect([p.requested, p.wireText.includes('m100:para:p0')]).toEqual([['m100:para:p1'], false]);
  });
});

describe('classifyAttempt', () => {
  const ids = ['m100:para:p1', 'm100:para:p2'];
  const wire = plan({ ids }).wireText;

  it('an identity response is untranslated', () => {
    expect(
      classifyAttempt({ enText: EN, responseText: wire, ids: ['m100:para:p1'] }).map(
        (r) => r.outcome
      )
    ).toEqual(['untranslated']);
  });
  it('an Icelandic response is translated and carries the body as received', () => {
    const responseText = seg('m100:para:p1', P1_IS);
    expect(classifyAttempt({ enText: EN, responseText, ids: ['m100:para:p1'] })).toEqual([
      { segmentId: 'm100:para:p1', outcome: 'translated', body: P1_IS, reason: null },
    ]);
  });
  it('classifies each id on its own', () => {
    const responseText = seg('m100:para:p1', P1_IS) + seg('m100:para:p2', P2_EN);
    expect(classifyAttempt({ enText: EN, responseText, ids }).map((r) => r.outcome)).toEqual([
      'translated',
      'untranslated',
    ]);
  });
  it('a translated body with a line break is held, reason line-break', () => {
    const responseText = seg(
      'm100:para:p1',
      'Vatn sýður\nvið hundrað gráður við venjulegan þrýsting.'
    );
    expect(classifyAttempt({ enText: EN, responseText, ids: ['m100:para:p1'] })[0]).toMatchObject({
      outcome: 'held',
      reason: 'line-break',
    });
  });
  // Review finding (2026-11-08): `.exact` alone admits an answer that is still mostly English.
  // detectResidue's own `warn` (token overlap ≥ 0.7) holds it; measured on chemistry, warn
  // fires on 0.42% of translated segments (formula answers and names), and on none of June's
  // Icelandic for the 7 September segments (ratio ≤ 0.07).
  it('an answer with only one word translated is held, reason mostly-english', () => {
    const responseText = seg('m100:para:p1', P1_EN.replace('Water', 'Vatn'));
    expect(classifyAttempt({ enText: EN, responseText, ids: ['m100:para:p1'] })[0]).toMatchObject({
      outcome: 'held',
      reason: expect.stringMatching(/^mostly-english ratio 0\.\d\d$/),
    });
  });
  it('the English with one word dropped is held, not translated', () => {
    const responseText = seg('m100:para:p1', P1_EN.replace(' normal', ''));
    expect(classifyAttempt({ enText: EN, responseText, ids: ['m100:para:p1'] })[0].outcome).toBe(
      'held'
    );
  });
  it('control: P2_IS keeps its term marker and is translated', () => {
    const responseText = seg('m100:para:p2', P2_IS);
    expect(classifyAttempt({ enText: EN, responseText, ids: ['m100:para:p2'] })[0].outcome).toBe(
      'translated'
    );
  });
});
