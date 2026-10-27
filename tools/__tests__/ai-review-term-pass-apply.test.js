/**
 * The term pass's apply step, unit level: the group rule (all or nothing per ruling and
 * segment) and change-record chaining, with the committed ruling set and the real gate.
 * The full run → apply path is in ai-review-term-pass.test.js.
 */
import { describe, it, expect } from 'vitest';
import {
  gateWithGroups,
  chainChanges,
  GROUP_INCOMPLETE,
  FLAGGED_NO_EDIT,
  WITHDRAWING_FLAG_KINDS,
} from '../ai-review/term-pass-apply.js';
import { gateSegment } from '../ai-review/gate.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';

const RULINGS = loadRulingSet(
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json'
).byId;

const op = (opId, category, rulingId, find, replace, sense = null) => ({
  opId,
  category,
  rulingId,
  sense,
  find,
  replace,
  reason: 'test',
});
const one = (en, is) => ({ occurrences: [{ occurrence: 0, key: 'k', en, is }] });

const CELL_EN = 'An electrolytic cell is used for the production of aluminum.';
const CELL_IS = 'Rafgreiningarklefi er notaður til framleiðslu á áli.';
const CELL_OPS = () => [
  op('c1', 'term', 'electrolytic-cell', 'Rafgreiningarklefi', 'Rafker'),
  op('c2', 'agreement', 'electrolytic-cell', 'notaður', 'notað'),
];
const ATOM_EN =
  'The atom has lost three electrons and thus has three more positive charges than it has electrons.';
const ATOM_IS =
  'Frumeindin hefur misst þrjár rafeindir og hefur því þremur fleiri jákvæðum hleðslum en hún hefur rafeindir.';
const ATOM_TERM = () => op('a1', 'term', 'atom', 'Frumeindin', 'Atómið');
const ATOM_FAR = () => op('a2', 'agreement', 'atom', 'hún hefur', 'það hefur');

describe('gateWithGroups', () => {
  it('accepts a ruling whose operations all pass', () => {
    const g = gateWithGroups({
      ops: CELL_OPS(),
      item: one(CELL_EN, CELL_IS),
      chapterDir: 'ch18',
      rulingsById: RULINGS,
    });
    expect(g.accepted.map((o) => o.opId)).toEqual(['c1', 'c2']);
    expect(g.rejected).toEqual([]);
    expect(g.occurrences[0].after).toBe('Rafker er notað til framleiðslu á áli.');
  });

  it('control: the gate alone accepts the term change whose agreement is too far', () => {
    const r = gateSegment({
      ops: [ATOM_TERM(), ATOM_FAR()],
      en: ATOM_EN,
      is: ATOM_IS,
      chapterDir: 'ch02',
      rulingsById: RULINGS,
    });
    expect(r.accepted.map((o) => o.opId)).toEqual(['a1']);
    expect(r.rejected[0].reasons).toContain('agreement-too-far');
  });

  it('withdraws that term change when its agreement is refused, leaving the segment unchanged', () => {
    const g = gateWithGroups({
      ops: [ATOM_TERM(), ATOM_FAR()],
      item: one(ATOM_EN, ATOM_IS),
      chapterDir: 'ch02',
      rulingsById: RULINGS,
    });
    expect(g.accepted).toEqual([]);
    expect(g.occurrences[0].after).toBe(ATOM_IS);
    const byId = Object.fromEntries(g.rejected.map((r) => [r.op.opId, r.reasons]));
    expect(byId.a1).toEqual([GROUP_INCOMPLETE]);
    expect(byId.a2).toContain('agreement-too-far');
  });

  it('withdraws every operation of a ruling the parser already failed', () => {
    const g = gateWithGroups({
      ops: [ATOM_TERM()],
      item: one(ATOM_EN, ATOM_IS),
      chapterDir: 'ch02',
      rulingsById: RULINGS,
      preFailed: new Set(['atom']),
    });
    expect(g.accepted).toEqual([]);
    expect(g.rejected).toEqual([
      { op: expect.objectContaining({ opId: 'a1' }), reasons: [GROUP_INCOMPLETE] },
    ]);
  });

  it('leaves another ruling in the same segment alone', () => {
    const en = `${ATOM_EN} ${CELL_EN}`;
    const is = `${ATOM_IS} ${CELL_IS}`;
    const g = gateWithGroups({
      ops: [ATOM_TERM(), ATOM_FAR(), ...CELL_OPS()],
      item: one(en, is),
      chapterDir: 'ch18',
      rulingsById: RULINGS,
    });
    expect(g.accepted.map((o) => o.opId)).toEqual(['c1', 'c2']);
    expect(g.occurrences[0].after).toBe(`${ATOM_IS} Rafker er notað til framleiðslu á áli.`);
  });

  it('applies to every occurrence of a duplicated id', () => {
    const item = {
      occurrences: [
        { occurrence: 0, key: 'k', en: CELL_EN, is: CELL_IS },
        { occurrence: 1, key: 'k#1', en: CELL_EN, is: CELL_IS },
      ],
    };
    const g = gateWithGroups({ ops: CELL_OPS(), item, chapterDir: 'ch18', rulingsById: RULINGS });
    expect(g.occurrences.map((o) => o.occurrence)).toEqual([0, 1]);
    expect(g.occurrences.map((o) => o.after)).toEqual([
      'Rafker er notað til framleiðslu á áli.',
      'Rafker er notað til framleiðslu á áli.',
    ]);
  });

  it('refuses a ruling in every occurrence when one occurrence diverges', () => {
    const item = {
      occurrences: [
        { occurrence: 0, key: 'k', en: CELL_EN, is: CELL_IS },
        {
          occurrence: 1,
          key: 'k#1',
          en: CELL_EN,
          is: 'Rafgreiningarklefi var notaður til framleiðslu á áli.',
        },
      ],
    };
    // c3 passes in occurrence 0 (`er notaður`) and is not found in occurrence 1 (`var notaður`).
    const ops = [
      CELL_OPS()[0],
      op('c3', 'agreement', 'electrolytic-cell', 'er notaður', 'er notað'),
    ];
    const g = gateWithGroups({ ops, item, chapterDir: 'ch18', rulingsById: RULINGS });
    expect(g.accepted).toEqual([]);
    expect(g.occurrences.map((o) => o.after)).toEqual([CELL_IS, item.occurrences[1].is]);
    const byId = Object.fromEntries(g.rejected.map((r) => [r.op.opId, r]));
    expect(byId.c3.reasons[0]).toBe('duplicate-divergent');
    expect(byId.c3.perOccurrence).toHaveLength(2);
    expect(byId.c1.reasons).toEqual([GROUP_INCOMPLETE]);
  });
});

describe('chainChanges', () => {
  const g = () =>
    gateWithGroups({
      ops: CELL_OPS(),
      item: one(CELL_EN, CELL_IS),
      chapterDir: 'ch18',
      rulingsById: RULINGS,
    });

  it('chains one record per accepted operation, each before the previous after', () => {
    const res = g();
    const records = chainChanges({
      stem: 'm68830',
      segmentId: 'm68830:caption:x',
      occurrence: 0,
      before: CELL_IS,
      accepted: res.occurrences[0].accepted,
      after: res.occurrences[0].after,
      runId: 'r1',
    });
    expect(records).toHaveLength(2);
    expect(records[0].before).toBe(CELL_IS);
    expect(records[1].before).toBe(records[0].after);
    expect(records[1].after).toBe(res.occurrences[0].after);
    expect(records.map((r) => [r.source, r.rulingId, r.category, r.runId])).toEqual([
      ['ai', 'electrolytic-cell', 'term', 'r1'],
      ['ai', 'electrolytic-cell', 'agreement', 'r1'],
    ]);
  });

  it('refuses when the chain does not end on the gate’s text', () => {
    const res = g();
    expect(() =>
      chainChanges({
        stem: 'm68830',
        segmentId: 'm68830:caption:x',
        occurrence: 0,
        before: CELL_IS,
        accepted: res.occurrences[0].accepted,
        after: 'something else',
        runId: 'r1',
      })
    ).toThrow(/not the gate/);
  });

  it('refuses an operation whose find is ambiguous in the chained text', () => {
    expect(() =>
      chainChanges({
        stem: 'm1',
        segmentId: 'm1:para:x',
        occurrence: 0,
        before: 'notaður og notaður',
        accepted: [op('x', 'agreement', 'electrolytic-cell', 'notaður', 'notað')],
        after: 'notað og notaður',
        runId: 'r1',
      })
    ).toThrow(/exactly once/);
  });
});

// The runner review (2026-10-27, layer2-integrity + prompt-model, both high): a flag the model
// raised on a ruling (needs-rewrite, compound-term, target-other-sense, sense-unclear) did not
// stop that ruling's operations in the same segment, although the prompt says those kinds
// mean "make no edit".
describe('gateWithGroups — a flagged ruling makes no edit', () => {
  it('names exactly the four "make no edit" kinds, and not mistranslation-suspected', () => {
    expect([...WITHDRAWING_FLAG_KINDS]).toEqual([
      'compound-term',
      'needs-rewrite',
      'sense-unclear',
      'target-other-sense',
    ]);
  });

  it('withdraws every operation of the flagged ruling before the gate, as flagged-no-edit', () => {
    const g = gateWithGroups({
      ops: [ATOM_TERM()],
      item: one(ATOM_EN, ATOM_IS),
      chapterDir: 'ch02',
      rulingsById: RULINGS,
      flagged: new Map([['atom', 'needs-rewrite']]),
    });
    expect(g.accepted).toEqual([]);
    expect(g.occurrences[0].after).toBe(ATOM_IS);
    expect(g.rejected).toEqual([
      {
        op: expect.objectContaining({ opId: 'a1' }),
        reasons: [FLAGGED_NO_EDIT],
        flag: 'needs-rewrite',
      },
    ]);
  });

  it('control: a flag on another ruling leaves this one to the gate', () => {
    const g = gateWithGroups({
      ops: [ATOM_TERM()],
      item: one(ATOM_EN, ATOM_IS),
      chapterDir: 'ch02',
      rulingsById: RULINGS,
      flagged: new Map([['electrolytic-cell', 'needs-rewrite']]),
    });
    expect(g.accepted.map((o) => o.opId)).toEqual(['a1']);
  });
});

// layer2-integrity, low: an op that first failed, was accepted in a later round and was then
// withdrawn lost its root cause, so a duplicate op left no gate reason in the record at all.
describe('gateWithGroups — a withdrawn op keeps the reason it first failed for', () => {
  it('a duplicate term op reports find-not-found beside group-incomplete', () => {
    const g = gateWithGroups({
      ops: [ATOM_TERM(), op('a1b', 'term', 'atom', 'Frumeindin', 'Atómið')],
      item: one(ATOM_EN, ATOM_IS),
      chapterDir: 'ch02',
      rulingsById: RULINGS,
    });
    expect(g.accepted).toEqual([]);
    const byId = Object.fromEntries(g.rejected.map((r) => [r.op.opId, r.reasons]));
    expect(byId.a1).toEqual([GROUP_INCOMPLETE]);
    expect(byId.a1b).toContain('find-not-found');
    expect(byId.a1b).toContain(GROUP_INCOMPLETE);
  });
});
