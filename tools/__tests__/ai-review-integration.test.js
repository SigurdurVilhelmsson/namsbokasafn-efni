/**
 * Units B and C meet here: the committed ruling set (tools/ai-review/compile-ruling-set.js)
 * as the code gate (tools/ai-review/gate.js) reads it. The two units were built in parallel
 * without each other's code, so their shared contract is tested on the real artifact, not on
 * either unit's fixtures.
 *
 * B's `matchable` and C's forbidden-token rules are two enumerations of one idea. B declined
 * to copy C's rules (a second copy would drift); this file is the guard it asked for instead.
 */
import { describe, it, expect } from 'vitest';
import { loadRulingSet, UNCLEAR_SENSE } from '../ai-review/ruling-set.js';
import { gateSegment, forbiddenTokenReasons } from '../ai-review/gate.js';

const SET = loadRulingSet(
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json'
);

/**
 * The gate's reasons for one probe op on ruling `r`, in the category its sense calls for and
 * declaring `sense` (by default the ruled sense, or none).
 */
const probe = (r, { rulingsById = SET.byId, sense = r.sense ? r.sense.id : null } = {}) => {
  const op = {
    opId: 'p',
    category: r.sense ? 'term-sense' : 'term',
    sense,
    rulingId: r.id,
    find: 'xyzzy',
    replace: r.is,
    reason: 'probe',
  };
  const result = gateSegment({
    ops: [op],
    en: 'a probe sentence',
    is: 'abc xyzzy def',
    chapterDir: 'ch01',
    rulingsById,
  });
  return result.rejected.flatMap((x) => x.reasons);
};

describe('matchable (B) agrees with the forbidden-token rules (C)', () => {
  const matchable = SET.rulings.filter((r) => r.matchable);

  it('every matchable target passes the gate’s forbidden-token rules', () => {
    const bad = matchable
      .map((r) => [r.id, forbiddenTokenReasons(r.is)])
      .filter(([, reasons]) => reasons.length > 0);
    expect(bad).toEqual([]);
  });

  it('control: the matchable population is the large majority of the set', () => {
    expect([matchable.length > 300, matchable.length < SET.rulings.length]).toEqual([true, true]);
  });

  it('control: the rules do refuse some target, all of them unmatchable', () => {
    const caught = SET.rulings.filter((r) => forbiddenTokenReasons(r.is).length > 0);
    expect([caught.length > 0, caught.every((r) => !r.matchable)]).toEqual([true, true]);
  });
});

describe('every compiled ruling is well-formed to the gate', () => {
  it('no ruling reads as ruling-invalid', () => {
    const invalid = SET.rulings.filter((r) => probe(r).includes('ruling-invalid'));
    expect(invalid.map((r) => r.id)).toEqual([]);
  });

  it('control: the probe does see a ruling the gate cannot read (sense key absent)', () => {
    const real = SET.byId.get('node');
    const r = { ...real };
    delete r.sense;
    expect([real.id, probe(r, { rulingsById: new Map([[r.id, r]]) })]).toEqual([
      'node',
      expect.arrayContaining(['ruling-invalid']),
    ]);
  });
});

describe('the sense rulings, as the gate reads them', () => {
  const sensed = SET.rulings.filter((r) => r.sense !== null);

  it('are the five homographs', () => {
    expect(sensed.map((r) => r.id)).toEqual(['addition', 'bent', 'cell', 'group', 'hole']);
  });

  it('each refuses a plain term op (sense-undeclared)', () => {
    const notRefused = sensed.filter((r) => {
      const op = { opId: 'p', category: 'term', rulingId: r.id, find: 'x', replace: r.is };
      const res = gateSegment({
        ops: [{ ...op, reason: 'probe' }],
        en: 'a probe sentence',
        is: 'abc x def',
        chapterDir: 'ch01',
        rulingsById: SET.byId,
      });
      return !res.rejected.flatMap((x) => x.reasons).includes('sense-undeclared');
    });
    expect(notRefused.map((r) => r.id)).toEqual([]);
  });

  it("each refuses 'unclear' and every other sense on its list (sense-mismatch)", () => {
    const declared = sensed.flatMap((r) =>
      [UNCLEAR_SENSE, ...r.sense.otherSenses.map((o) => o.id)].map((sense) => [r, sense])
    );
    const admitted = declared
      .filter(([r, sense]) => !probe(r, { sense }).includes('sense-mismatch'))
      .map(([r, sense]) => `${r.id}:${sense}`);
    // 15 pins the committed artifact: 5 x 'unclear' plus 10 other senses. A new sense moves it.
    expect([declared.length, admitted]).toEqual([15, []]);
  });

  it('control: declaring the ruled sense raises no sense reason', () => {
    const withSenseReason = sensed.filter((r) => probe(r).some((c) => c.startsWith('sense-')));
    expect(withSenseReason.map((r) => r.id)).toEqual([]);
  });
});
