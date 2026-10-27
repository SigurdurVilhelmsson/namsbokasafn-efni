/**
 * The response parser (tools/ai-review/term-pass-response.js; design:
 * docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md, "Unit U3"). Every refusing case
 * has a passing control beside it.
 *
 * Rulings are the REAL committed set of 2026-10-26, loaded the way the integration test loads
 * it. The Icelandic in `find`/`replace` is hand-written to exercise one mechanism each (the
 * parser never reads segment text); the coinage `vetnisefnarafala` → `vetniseldsneytiskeri` is
 * the one the design records the gate as ACCEPTING, which only the shadowing guard stops.
 */
import { describe, it, expect } from 'vitest';
import { loadRulingSet, UNCLEAR_SENSE } from '../ai-review/ruling-set.js';
import { containsTargetStem } from '../ai-review/gate.js';
import { usesHeadword } from '../lib/chapter-term-check.js';
import {
  parseTermPassResponse,
  RESPONSE_SCHEMA,
  FLAG_KINDS,
  REQUEST_PROBLEMS,
  RUNNER_REJECTIONS,
} from '../ai-review/term-pass-response.js';

const SET = loadRulingSet(
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json'
);
const KEY = 'ch17/m68727/001';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────

/** A raw Messages API response whose text block holds `doc` (JSON-encoded unless a string). */
const message = (doc, over = {}) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-test',
  stop_reason: 'end_turn',
  content: [
    { type: 'thinking', thinking: 'The segment says fuel cell; { not json', signature: 'sig' },
    { type: 'text', text: typeof doc === 'string' ? doc : JSON.stringify(doc) },
  ],
  usage: { input_tokens: 10, output_tokens: 20 },
  ...over,
});

const op = (o = {}) => ({
  category: 'term',
  ruling: 'atom',
  sense: null,
  find: 'frumeindir',
  replace: 'atóm',
  reason: 'house term',
  ...o,
});
const cellOp = (o = {}) =>
  op({
    category: 'term-sense',
    ruling: 'cell',
    sense: 'electrochemical-cell',
    find: 'rafhlöðunni',
    replace: 'kerinu',
    ...o,
  });
/** The coinage the gate accepts under `cell` (design, "Measured inputs"). */
const COINAGE = Object.freeze({ find: 'vetnisefnarafala', replace: 'vetniseldsneytiskeri' });
const seg = (id, o = {}) => ({ id, senses: [], ops: [], flags: [], ...o });
const doc = (...segments) => ({ segments });

const PRESENTED = Object.freeze([
  { segmentId: 'fs-a', rulingIds: ['atom', 'atomic-orbital'] },
  { segmentId: 'fs-b', rulingIds: ['cell', 'fuel-cell'] },
]);

const parse = (msg, presented = PRESENTED, rulingsById = SET.byId) =>
  parseTermPassResponse({ message: msg, requestKey: KEY, presented, rulingsById });
const parseDoc = (d, presented) => parse(message(d), presented);

const gateOpsOf = (r, id) => r.segments.get(id) ?? [];
const reasonsOf = (r, opId) => r.rejected.find((x) => x.opId === opId)?.reasons ?? null;

const EMPTY = { segments: new Map(), rejected: [], flags: [], senses: [], missing: [] };
const expectProblem = (r, problem) => expect(r).toEqual({ problem, ...EMPTY });

const VALID = doc(seg('fs-a', { ops: [op()] }), seg('fs-b'));

// ── The closed sets ──────────────────────────────────────────────────────────────────────

describe('the closed sets', () => {
  const sorted = (a) => [...a].sort();

  it('FLAG_KINDS is the spec’s list, frozen and sorted', () => {
    expect([FLAG_KINDS, Object.isFrozen(FLAG_KINDS), sorted(FLAG_KINDS)]).toEqual([
      [
        'compound-term',
        'mistranslation-suspected',
        'needs-rewrite',
        'sense-unclear',
        'target-other-sense',
      ],
      true,
      FLAG_KINDS,
    ]);
  });

  it('REQUEST_PROBLEMS is the spec’s list, frozen and sorted', () => {
    expect([REQUEST_PROBLEMS, Object.isFrozen(REQUEST_PROBLEMS), sorted(REQUEST_PROBLEMS)]).toEqual(
      [
        [
          'response-empty',
          'response-invalid',
          'response-refusal',
          'response-truncated',
          'response-unparseable',
        ],
        true,
        REQUEST_PROBLEMS,
      ]
    );
  });

  it('RUNNER_REJECTIONS is the spec’s list, frozen and sorted', () => {
    expect([
      RUNNER_REJECTIONS,
      Object.isFrozen(RUNNER_REJECTIONS),
      sorted(RUNNER_REJECTIONS),
    ]).toEqual([
      [
        'group-incomplete',
        'response-duplicate-segment',
        'response-unknown-segment',
        'ruling-not-offered',
        'sense-inconsistent',
        'shadowed-by-longer-ruling',
      ],
      true,
      RUNNER_REJECTIONS,
    ]);
  });
});

// ── The response schema ──────────────────────────────────────────────────────────────────

describe('RESPONSE_SCHEMA', () => {
  const nodes = (v, out = []) => {
    if (v && typeof v === 'object') {
      out.push(v);
      for (const k of Object.keys(v)) nodes(v[k], out);
    }
    return out;
  };

  it('is exactly the structured-output schema the controller’s prompt embeds', () => {
    const str = { type: 'string' };
    const strOrNull = { anyOf: [{ type: 'string' }, { type: 'null' }] };
    expect(RESPONSE_SCHEMA).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['segments'],
      properties: {
        segments: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'senses', 'ops', 'flags'],
            properties: {
              id: str,
              senses: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['ruling', 'sense'],
                  properties: { ruling: str, sense: str },
                },
              },
              ops: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['category', 'ruling', 'sense', 'find', 'replace', 'reason'],
                  properties: {
                    category: { type: 'string', enum: ['term', 'term-sense', 'agreement'] },
                    ruling: str,
                    sense: strOrNull,
                    find: str,
                    replace: str,
                    reason: str,
                  },
                },
              },
              flags: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['kind', 'ruling', 'note'],
                  properties: {
                    kind: {
                      type: 'string',
                      enum: [
                        'compound-term',
                        'mistranslation-suspected',
                        'needs-rewrite',
                        'sense-unclear',
                        'target-other-sense',
                      ],
                    },
                    ruling: strOrNull,
                    note: str,
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('its flag-kind enum is FLAG_KINDS', () => {
    const flag = RESPONSE_SCHEMA.properties.segments.items.properties.flags.items;
    expect(flag.properties.kind.enum).toEqual(FLAG_KINDS);
  });

  it('is deep-frozen: every nested object and array', () => {
    const all = nodes(RESPONSE_SCHEMA);
    expect([all.length > 20, all.filter((n) => !Object.isFrozen(n))]).toEqual([true, []]);
  });

  it('every object forbids additional properties and requires every property', () => {
    const objects = nodes(RESPONSE_SCHEMA).filter((n) => n.type === 'object');
    expect(objects.length).toBe(5);
    expect(
      objects.filter(
        (o) =>
          o.additionalProperties !== false ||
          JSON.stringify([...o.required].sort()) !==
            JSON.stringify(Object.keys(o.properties).sort())
      )
    ).toEqual([]);
  });

  it('uses no keyword the API’s structured outputs reject', () => {
    const banned = ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems'];
    expect(nodes(RESPONSE_SCHEMA).filter((n) => banned.some((k) => k in n))).toEqual([]);
  });
});

// ── Request problems ─────────────────────────────────────────────────────────────────────

describe('request problems', () => {
  it('control: a well-formed response has no problem', () => {
    expect(parse(message(VALID)).problem).toBe(null);
  });

  it('a null or undefined message is response-empty', () => {
    expectProblem(parse(null), 'response-empty');
    expectProblem(parse(undefined), 'response-empty');
  });

  it('stop_reason refusal is response-refusal, even with a valid text block', () => {
    expectProblem(parse(message(VALID, { stop_reason: 'refusal' })), 'response-refusal');
  });

  it('stop_reason max_tokens is response-truncated, ahead of the broken JSON it leaves', () => {
    expectProblem(
      parse(message('{"segments":[{"id":"fs-a","sen', { stop_reason: 'max_tokens' })),
      'response-truncated'
    );
  });

  it('any other stop_reason, or none, is response-invalid', () => {
    for (const stop_reason of ['pause_turn', 'tool_use', 'stop_sequence', undefined, null]) {
      expectProblem(parse(message(VALID, { stop_reason })), 'response-invalid');
    }
  });

  it('a message that is not an object, or content that is not an array, is response-invalid', () => {
    expectProblem(parse('{"segments":[]}'), 'response-invalid');
    expectProblem(parse(message(VALID, { content: 'text' })), 'response-invalid');
    expectProblem(parse(message(VALID, { content: [null] })), 'response-invalid');
    expectProblem(
      parse(message(VALID, { content: [{ type: 'text', text: 7 }] })),
      'response-invalid'
    );
  });

  it('a content block of an unexpected type is response-invalid', () => {
    const content = [
      ...message(VALID).content,
      { type: 'tool_use', id: 't', name: 'x', input: {} },
    ];
    expectProblem(parse(message(VALID, { content })), 'response-invalid');
  });

  it('control: thinking and redacted_thinking blocks are ignored', () => {
    const content = [{ type: 'redacted_thinking', data: 'xx' }, ...message(VALID).content];
    expect(parse(message(VALID, { content })).problem).toBe(null);
  });

  it('no text block is response-unparseable', () => {
    const content = [{ type: 'thinking', thinking: JSON.stringify(VALID), signature: 's' }];
    expectProblem(parse(message(VALID, { content })), 'response-unparseable');
  });

  it('text that does not JSON.parse is response-unparseable', () => {
    expectProblem(parse(message('{"segments": [}')), 'response-unparseable');
    expectProblem(parse(message('')), 'response-unparseable');
  });

  it('control: text blocks are concatenated in order before parsing', () => {
    const text = JSON.stringify(VALID);
    const cut = 17;
    const content = [
      { type: 'text', text: text.slice(0, cut) },
      { type: 'thinking', thinking: 'mid', signature: 's' },
      { type: 'text', text: text.slice(cut) },
    ];
    const r = parse(message(VALID, { content }));
    expect([r.problem, gateOpsOf(r, 'fs-a').length]).toEqual([null, 1]);
    const reversed = [content[2], content[0]];
    expectProblem(parse(message(VALID, { content: reversed })), 'response-unparseable');
  });

  it('a top level that parses but is not an object is response-invalid', () => {
    for (const text of ['null', '[]', '"segments"', '7', 'true']) {
      expectProblem(parse(message(text)), 'response-invalid');
    }
  });

  describe('schema violations are response-invalid (checked by hand, never trusted)', () => {
    const cases = {
      'extra top-level key': { ...VALID, note: 'x' },
      'extra key in a segment': doc({ ...seg('fs-a'), comment: 'x' }),
      'extra key in an op': doc(seg('fs-a', { ops: [{ ...op(), confidence: 'high' }] })),
      'extra key in a sense': doc(
        seg('fs-b', { senses: [{ ruling: 'cell', sense: 'living-cell', why: 'x' }] })
      ),
      'extra key in a flag': doc(
        seg('fs-a', { flags: [{ kind: 'needs-rewrite', ruling: null, note: 'n', opId: 'x' }] })
      ),
      'missing top-level key': {},
      'missing key in a segment': doc({ id: 'fs-a', senses: [], ops: [] }),
      'missing key in an op': doc(seg('fs-a', { ops: [{ ...op(), reason: undefined }] })),
      'missing sense key in an op': doc(seg('fs-a', { ops: [{ ...op(), sense: undefined }] })),
      'missing key in a sense': doc(seg('fs-b', { senses: [{ ruling: 'cell' }] })),
      'missing key in a flag': doc(seg('fs-a', { flags: [{ kind: 'needs-rewrite', note: 'n' }] })),
      'wrong type: segments not an array': { segments: {} },
      'wrong type: segment not an object': { segments: ['fs-a'] },
      'wrong type: id a number': doc({ ...seg('fs-a'), id: 7 }),
      'wrong type: ops not an array': doc({ ...seg('fs-a'), ops: op() }),
      'wrong type: find a number': doc(seg('fs-a', { ops: [op({ find: 3 })] })),
      'wrong type: op sense a number': doc(seg('fs-a', { ops: [op({ sense: 1 })] })),
      'wrong type: sense sense null': doc(
        seg('fs-b', { senses: [{ ruling: 'cell', sense: null }] })
      ),
      'wrong type: flag ruling a number': doc(
        seg('fs-a', { flags: [{ kind: 'needs-rewrite', ruling: 2, note: 'n' }] })
      ),
      'wrong type: flag note null': doc(
        seg('fs-a', { flags: [{ kind: 'needs-rewrite', ruling: null, note: null }] })
      ),
      'bad enum: op category': doc(seg('fs-a', { ops: [op({ category: 'rewrite' })] })),
      'bad enum: flag kind': doc(
        seg('fs-a', { flags: [{ kind: 'other', ruling: null, note: 'n' }] })
      ),
      'a __proto__ key in an op':
        '{"segments":[{"id":"fs-a","senses":[],"flags":[],"ops":[{"category":"term","ruling":"atom","sense":null,"find":"a","replace":"b","reason":"r","__proto__":{}}]}]}',
    };
    for (const [name, bad] of Object.entries(cases)) {
      it(name, () => expectProblem(parse(message(bad)), 'response-invalid'));
    }

    it('control: the same shapes, well-formed, pass', () => {
      const good = doc(
        seg('fs-a', {
          ops: [op(), op({ category: 'agreement', sense: null })],
          flags: [{ kind: 'needs-rewrite', ruling: null, note: 'n' }],
        }),
        seg('fs-b', {
          senses: [{ ruling: 'cell', sense: 'living-cell' }],
          flags: [{ kind: 'compound-term', ruling: 'cell', note: 'n' }],
        })
      );
      expect(parse(message(good)).problem).toBe(null);
    });
  });

  it('with a problem, nothing else is trusted: every other field is empty', () => {
    const r = parse(message(VALID, { stop_reason: 'max_tokens' }));
    expect([r.segments.size, r.rejected, r.flags, r.senses, r.missing]).toEqual([
      0,
      [],
      [],
      [],
      [],
    ]);
  });
});

// ── opId numbering ───────────────────────────────────────────────────────────────────────

describe('opId numbering', () => {
  const d = doc(
    seg('fs-a', { ops: [op(), op({ sense: UNCLEAR_SENSE })] }), // op1 kept, op2 → flag
    seg('fs-x', { ops: [op()] }), // op3 unknown segment
    seg('fs-b', { ops: [op(), cellOp()] }), // op4 not offered, op5 kept
    seg('fs-a', { ops: [op()] }) // op6 duplicate entry
  );
  const r = parseDoc(d);

  it('counts every op of the response 1-based in response order, whatever became of it', () => {
    expect({
      kept: [...r.segments.values()].flat().map((o) => o.opId),
      rejected: r.rejected.map((x) => x.opId),
      flagged: r.flags.map((f) => f.opId),
    }).toEqual({
      kept: [`${KEY}.op1`, `${KEY}.op5`],
      rejected: [`${KEY}.op3`, `${KEY}.op4`, `${KEY}.op6`],
      flagged: [`${KEY}.op2`],
    });
  });

  it('control: the opId names the model’s own op (find and reason carried through)', () => {
    const kept = gateOpsOf(r, 'fs-b')[0];
    expect([kept.opId, kept.find, kept.rulingId]).toEqual([`${KEY}.op5`, 'rafhlöðunni', 'cell']);
  });
});

// ── Segments, unknown and duplicate entries, missing ─────────────────────────────────────

describe('segments, unknown and duplicate entries, missing', () => {
  it('a presented segment answered with no ops is in segments with an empty list', () => {
    const r = parseDoc(doc(seg('fs-b')));
    expect([[...r.segments], r.missing]).toEqual([[['fs-b', []]], ['fs-a']]);
  });

  it('missing lists unanswered presented ids in presented order', () => {
    const presented = [
      { segmentId: 'fs-c', rulingIds: ['atom'] },
      ...PRESENTED,
      { segmentId: 'fs-d', rulingIds: ['atom'] },
    ];
    expect(parseDoc(doc(seg('fs-a')), presented).missing).toEqual(['fs-c', 'fs-b', 'fs-d']);
  });

  it('control: a response answering every presented segment has nothing missing', () => {
    expect(parseDoc(VALID).missing).toEqual([]);
  });

  it('segments are keyed in presented order, whatever order the response answers in', () => {
    expect([...parseDoc(doc(seg('fs-b'), seg('fs-a'))).segments.keys()]).toEqual(['fs-a', 'fs-b']);
  });

  it('an unknown segment entry: its ops rejected, its flags and senses dropped', () => {
    const unknownOp = op();
    const r = parseDoc(
      doc(
        seg('fs-x', {
          ops: [unknownOp, op({ sense: UNCLEAR_SENSE })],
          senses: [{ ruling: 'cell', sense: 'living-cell' }],
          flags: [{ kind: 'needs-rewrite', ruling: null, note: 'unknown' }],
        })
      )
    );
    expect({
      rejected: r.rejected,
      flags: r.flags,
      senses: r.senses,
      keys: [...r.segments.keys()],
    }).toEqual({
      rejected: [
        {
          segmentId: 'fs-x',
          opId: `${KEY}.op1`,
          op: unknownOp,
          reasons: ['response-unknown-segment'],
        },
        {
          segmentId: 'fs-x',
          opId: `${KEY}.op2`,
          op: op({ sense: UNCLEAR_SENSE }),
          reasons: ['response-unknown-segment'],
        },
      ],
      flags: [],
      senses: [],
      keys: [],
    });
  });

  it('control: a presented segment’s flags and senses are kept', () => {
    const r = parseDoc(
      doc(
        seg('fs-b', {
          senses: [{ ruling: 'cell', sense: 'living-cell' }],
          flags: [{ kind: 'target-other-sense', ruling: 'cell', note: 'blood cells' }],
        })
      )
    );
    expect([r.flags.length, r.senses.length]).toEqual([1, 1]);
  });

  it('a duplicate entry: the second entry’s ops rejected and its flags dropped; the first kept', () => {
    const first = op({ find: 'frumeindin', replace: 'atómið' });
    const second = op({ find: 'frumeindir', replace: 'atóm' });
    const r = parseDoc(
      doc(
        seg('fs-a', { ops: [first] }),
        seg('fs-a', {
          ops: [second],
          senses: [{ ruling: 'atom', sense: 'x' }],
          flags: [{ kind: 'needs-rewrite', ruling: null, note: 'second' }],
        })
      )
    );
    expect({
      kept: gateOpsOf(r, 'fs-a').map((o) => o.find),
      rejected: r.rejected.map((x) => [x.opId, x.op, x.reasons]),
      flags: r.flags,
      senses: r.senses,
    }).toEqual({
      kept: ['frumeindin'],
      rejected: [[`${KEY}.op2`, second, ['response-duplicate-segment']]],
      flags: [],
      senses: [],
    });
  });

  it('an unknown id answered twice is unknown both times, never duplicate', () => {
    const r = parseDoc(doc(seg('fs-x', { ops: [op()] }), seg('fs-x', { ops: [op()] })));
    expect(r.rejected.map((x) => x.reasons)).toEqual([
      ['response-unknown-segment'],
      ['response-unknown-segment'],
    ]);
  });
});

// ── ruling-not-offered ───────────────────────────────────────────────────────────────────

describe('ruling-not-offered', () => {
  it('an op whose ruling is not in that segment’s rulingIds is rejected', () => {
    const r = parseDoc(doc(seg('fs-a', { ops: [cellOp()] })));
    expect([reasonsOf(r, `${KEY}.op1`), gateOpsOf(r, 'fs-a')]).toEqual([
      ['ruling-not-offered'],
      [],
    ]);
  });

  it('control: the same op in the segment that offers the ruling reaches segments', () => {
    const r = parseDoc(doc(seg('fs-b', { ops: [cellOp()] })));
    expect([r.rejected, gateOpsOf(r, 'fs-b').length]).toEqual([[], 1]);
  });

  it('an unknown ruling id is not offered', () => {
    const r = parseDoc(doc(seg('fs-a', { ops: [op({ ruling: 'no-such-ruling' })] })));
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['ruling-not-offered']);
  });
});

// ── sense-inconsistent ───────────────────────────────────────────────────────────────────

describe('sense-inconsistent', () => {
  const run = (senses, o) => parseDoc(doc(seg('fs-b', { senses, ops: [cellOp(o)] })));

  it('a term-sense op whose sense differs from the segment’s senses entry is rejected', () => {
    const r = run([{ ruling: 'cell', sense: 'living-cell' }]);
    expect([reasonsOf(r, `${KEY}.op1`), gateOpsOf(r, 'fs-b')]).toEqual([
      ['sense-inconsistent'],
      [],
    ]);
  });

  it('control: senses agrees with the op', () => {
    const r = run([{ ruling: 'cell', sense: 'electrochemical-cell' }]);
    expect([r.rejected, gateOpsOf(r, 'fs-b').length]).toEqual([[], 1]);
  });

  it('control: senses has no entry for that ruling', () => {
    const r = run([{ ruling: 'fuel-cell', sense: 'living-cell' }]);
    expect([r.rejected, gateOpsOf(r, 'fs-b').length]).toEqual([[], 1]);
  });

  it('two entries for the ruling, one disagreeing: rejected', () => {
    const r = run([
      { ruling: 'cell', sense: 'electrochemical-cell' },
      { ruling: 'cell', sense: 'unit-cell' },
    ]);
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['sense-inconsistent']);
  });

  it('senses entry `unclear` against a declared sense: rejected', () => {
    const r = run([{ ruling: 'cell', sense: UNCLEAR_SENSE }]);
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['sense-inconsistent']);
  });
});

// ── 'unclear' ────────────────────────────────────────────────────────────────────────────

describe("an op declaring sense 'unclear'", () => {
  for (const category of ['term-sense', 'term', 'agreement']) {
    it(`(${category}) becomes a sense-unclear flag and never reaches the gate`, () => {
      const r = parseDoc(
        doc(
          seg('fs-b', {
            ops: [
              cellOp({
                category,
                sense: UNCLEAR_SENSE,
                find: 'sellunni',
                replace: 'kerinu',
                reason: 'cannot tell',
              }),
            ],
          })
        )
      );
      expect({ segments: [...r.segments], rejected: r.rejected, flags: r.flags }).toEqual({
        segments: [['fs-b', []]],
        rejected: [],
        flags: [
          {
            segmentId: 'fs-b',
            kind: 'sense-unclear',
            rulingId: 'cell',
            note: 'cannot tell',
            opId: `${KEY}.op1`,
            proposed: { find: 'sellunni', replace: 'kerinu' },
          },
        ],
      });
    });
  }

  it('control: the same op declaring the ruled sense reaches segments and raises no flag', () => {
    const r = parseDoc(doc(seg('fs-b', { ops: [cellOp()] })));
    expect([gateOpsOf(r, 'fs-b').length, r.flags]).toEqual([1, []]);
  });

  it('is flagged even when its ruling is not offered (it never reaches the gate either way)', () => {
    const r = parseDoc(doc(seg('fs-a', { ops: [cellOp({ sense: UNCLEAR_SENSE })] })));
    expect([r.rejected, r.flags.map((f) => [f.kind, f.rulingId])]).toEqual([
      [],
      [['sense-unclear', 'cell']],
    ]);
  });

  it('the model’s own flags come first in an entry, then its converted ops', () => {
    const r = parseDoc(
      doc(
        seg('fs-b', {
          ops: [cellOp({ sense: UNCLEAR_SENSE })],
          flags: [{ kind: 'compound-term', ruling: 'cell', note: 'would coin' }],
        })
      )
    );
    expect(r.flags.map((f) => f.kind)).toEqual(['compound-term', 'sense-unclear']);
  });

  it('control: a model flag carries no opId and no proposed', () => {
    const r = parseDoc(
      doc(seg('fs-a', { flags: [{ kind: 'mistranslation-suspected', ruling: null, note: 'n' }] }))
    );
    expect(r.flags).toEqual([
      { segmentId: 'fs-a', kind: 'mistranslation-suspected', rulingId: null, note: 'n' },
    ]);
  });
});

// ── Sense judgements ─────────────────────────────────────────────────────────────────────

describe('sense judgements', () => {
  const presented = [{ segmentId: 'fs-b', rulingIds: ['atom', 'cell', 'fuel-cell'] }];
  const judge = (ruling, sense) =>
    parseDoc(doc(seg('fs-b', { senses: [{ ruling, sense }] })), presented).senses;

  it('the ruled id is valid', () => {
    expect(judge('cell', 'electrochemical-cell')).toEqual([
      { segmentId: 'fs-b', rulingId: 'cell', sense: 'electrochemical-cell', valid: true },
    ]);
  });

  it('another listed sense id is valid', () => {
    expect(judge('cell', 'living-cell')[0].valid).toBe(true);
  });

  it("'unclear' is valid", () => {
    expect(judge('cell', UNCLEAR_SENSE)[0].valid).toBe(true);
  });

  it('an unknown sense id is invalid', () => {
    expect(judge('cell', 'battery-cell')[0].valid).toBe(false);
  });

  it('a ruling with no sense is invalid, whatever sense is named', () => {
    expect([
      judge('atom', 'electrochemical-cell')[0].valid,
      judge('atom', UNCLEAR_SENSE)[0].valid,
    ]).toEqual([false, false]);
  });

  it('a sensed ruling not offered for the segment is invalid', () => {
    expect(SET.byId.get('group').sense).not.toBe(null);
    const sense = SET.byId.get('group').sense.id;
    expect(judge('group', sense)[0].valid).toBe(false);
  });

  it('every entry is reported, in order', () => {
    const r = parseDoc(
      doc(
        seg('fs-b', {
          senses: [
            { ruling: 'cell', sense: 'living-cell' },
            { ruling: 'fuel-cell', sense: 'x' },
          ],
        })
      )
    );
    expect(r.senses.map((s) => [s.rulingId, s.valid])).toEqual([
      ['cell', true],
      ['fuel-cell', false],
    ]);
  });
});

// ── The gate's operation shape ───────────────────────────────────────────────────────────

describe('GateOp', () => {
  it('maps the model’s op to the gate’s shape, keys in order', () => {
    const r = parseDoc(doc(seg('fs-b', { ops: [cellOp({ reason: 'cell → ker' })] })));
    const [g] = gateOpsOf(r, 'fs-b');
    expect([Object.keys(g), g]).toEqual([
      ['opId', 'category', 'rulingId', 'sense', 'find', 'replace', 'reason'],
      {
        opId: `${KEY}.op1`,
        category: 'term-sense',
        rulingId: 'cell',
        sense: 'electrochemical-cell',
        find: 'rafhlöðunni',
        replace: 'kerinu',
        reason: 'cell → ker',
      },
    ]);
  });

  it('a term or agreement op carries sense null even when the model sent one', () => {
    const r = parseDoc(
      doc(
        seg('fs-a', {
          ops: [
            op({ sense: 'electrochemical-cell' }),
            op({ category: 'agreement', sense: 'living-cell', find: 'þær', replace: 'þau' }),
          ],
        })
      )
    );
    expect(gateOpsOf(r, 'fs-a').map((g) => [g.category, g.sense])).toEqual([
      ['term', null],
      ['agreement', null],
    ]);
  });

  it('control: a term-sense op keeps its declared sense', () => {
    const r = parseDoc(doc(seg('fs-b', { ops: [cellOp({ sense: 'living-cell' })] })));
    expect(gateOpsOf(r, 'fs-b')[0].sense).toBe('living-cell');
  });

  it('rejected[].op is the model’s op as given (schema names, not the gate’s)', () => {
    const given = cellOp();
    const r = parseDoc(doc(seg('fs-a', { ops: [given] })));
    expect(r.rejected[0].op).toEqual(given);
  });
});

// ── Shadowing, with the real committed ruling set ────────────────────────────────────────

describe('shadowed-by-longer-ruling (rule 4), on the real ruling set', () => {
  const first = (d, presented) => {
    const r = parseDoc(d, presented);
    return { reasons: reasonsOf(r, `${KEY}.op1`), kept: [...r.segments.values()].flat().length };
  };

  it('the real rulings are what these cases assume', () => {
    const cell = SET.byId.get('cell');
    const fuel = SET.byId.get('fuel-cell');
    expect({
      cell: [cell.en, cell.is, cell.sense.id],
      fuel: [fuel.en, fuel.is, fuel.competitors],
      cellInFuel: usesHeadword('cell', 'fuel cell'),
      atomInAtomicOrbital: usesHeadword('atom', 'atomic orbital'),
    }).toEqual({
      cell: [['cell'], 'ker', 'electrochemical-cell'],
      fuel: [['fuel cell'], 'efnarafall', ['Efnarafhlaða']],
      cellInFuel: true,
      atomInAtomicOrbital: false,
    });
  });

  it('a cell op whose find holds the fuel-cell target is rejected (the gate would accept it)', () => {
    expect(first(doc(seg('fs-b', { ops: [cellOp(COINAGE)] })))).toEqual({
      reasons: ['shadowed-by-longer-ruling'],
      kept: 0,
    });
  });

  it('control: the same op with find `rafhlöðunni` is not shadowed', () => {
    expect(first(doc(seg('fs-b', { ops: [cellOp({ find: 'rafhlöðunni' })] })))).toEqual({
      reasons: null,
      kept: 1,
    });
  });

  it('control: the coinage is not shadowed when fuel-cell is not offered for the segment', () => {
    const presented = [{ segmentId: 'fs-b', rulingIds: ['cell'] }];
    expect(first(doc(seg('fs-b', { ops: [cellOp(COINAGE)] })), presented)).toEqual({
      reasons: null,
      kept: 1,
    });
  });

  it('a competitor of the longer ruling shadows too (`Efnarafhlaða`)', () => {
    const find = 'efnarafhlöðunni';
    expect([
      containsTargetStem(find, 'efnarafall'),
      containsTargetStem(find, 'Efnarafhlaða'),
    ]).toEqual([false, true]);
    expect(first(doc(seg('fs-b', { ops: [cellOp({ find })] }))).reasons).toEqual([
      'shadowed-by-longer-ruling',
    ]);
  });

  it('the guard applies to an agreement op of the shorter ruling as well', () => {
    const agreement = cellOp({ category: 'agreement', sense: null, ...COINAGE });
    expect(first(doc(seg('fs-b', { ops: [agreement] }))).reasons).toEqual([
      'shadowed-by-longer-ruling',
    ]);
  });

  it('an op of the longer fuel-cell is never shadowed by the shorter cell', () => {
    const find = 'eldsneytiskerið';
    // Discriminating: cell's target IS in this find, so a reversed containment would shadow.
    expect(containsTargetStem(find, 'ker')).toBe(true);
    const fuelOp = op({ ruling: 'fuel-cell', find, replace: 'efnarafallið' });
    expect(first(doc(seg('fs-b', { ops: [fuelOp] })))).toEqual({ reasons: null, kept: 1 });
  });

  it('an atomic-orbital op is not shadowed by atom (atom is not a whole word in it)', () => {
    const find = 'frumeindasvigrúmi';
    // Discriminating for DIRECTION: atom's competitor IS in this find, so a check that let the
    // shorter ruling shadow the longer would refuse it.
    expect(containsTargetStem(find, SET.byId.get('atom').competitors[0])).toBe(true);
    const orbitalOp = op({ ruling: 'atomic-orbital', find, replace: 'atómsvigrúmi' });
    expect(first(doc(seg('fs-a', { ops: [orbitalOp] })))).toEqual({ reasons: null, kept: 1 });
  });

  it('nor is an atom op shadowed by atomic-orbital: containment is whole-word, not substring', () => {
    const find = 'frumeindasvigrúmi';
    // Discriminating for WHOLE-WORD: `atomic orbital` holds `atom` as a substring, and
    // atomic-orbital's competitor IS in this find, so a substring containment would refuse it.
    const orbital = SET.byId.get('atomic-orbital');
    expect([
      orbital.en[0].includes('atom'),
      containsTargetStem(find, orbital.competitors[0]),
    ]).toEqual([true, true]);
    const atomOp = op({ ruling: 'atom', find, replace: 'atómsvigrúmi' });
    expect(first(doc(seg('fs-a', { ops: [atomOp] })))).toEqual({ reasons: null, kept: 1 });
  });

  it('a ruling never shadows itself, though its own forms contain each other', () => {
    const r = SET.byId.get('osmotic-pressure');
    const find = 'flæðiþrýstingi';
    expect([
      usesHeadword(r.en[0], r.en[1]),
      r.en[0] !== r.en[1],
      containsTargetStem(find, r.competitors[0]),
    ]).toEqual([true, true, true]);
    const presented = [{ segmentId: 'fs-c', rulingIds: ['osmotic-pressure'] }];
    const own = op({ ruling: 'osmotic-pressure', find, replace: 'osmósuþrýstingi' });
    expect(first(doc(seg('fs-c', { ops: [own] })), presented)).toEqual({ reasons: null, kept: 1 });
  });

  it('HYPOTHETICAL: a different ruling with the SAME English form is not longer, so does not shadow', () => {
    // No two rulings of the committed set share a form, so this case is synthetic: a second
    // `cell` ruling invented for the test, saying nothing about what the book should use.
    const twin = {
      ...SET.byId.get('fuel-cell'),
      id: 'cell-twin',
      enNorm: 'cell twin',
      en: ['cell'],
    };
    const rulingsById = new Map([...SET.byId, [twin.id, twin]]);
    const presented = [{ segmentId: 'fs-b', rulingIds: ['cell', 'cell-twin'] }];
    const r = parse(message(doc(seg('fs-b', { ops: [cellOp(COINAGE)] }))), presented, rulingsById);
    expect([r.rejected, gateOpsOf(r, 'fs-b').length]).toEqual([[], 1]);
  });

  it('every applicable runner reason is reported, sorted', () => {
    const presented = [{ segmentId: 'fs-b', rulingIds: ['fuel-cell'] }];
    expect(
      first(
        doc(
          seg('fs-b', {
            senses: [{ ruling: 'cell', sense: 'living-cell' }],
            ops: [cellOp(COINAGE)],
          })
        ),
        presented
      ).reasons
    ).toEqual(['ruling-not-offered', 'sense-inconsistent', 'shadowed-by-longer-ruling']);
  });
});

// ── Arguments and determinism ────────────────────────────────────────────────────────────

describe('arguments', () => {
  const call = (o) => () =>
    parseTermPassResponse({
      message: message(VALID),
      requestKey: KEY,
      presented: PRESENTED,
      rulingsById: SET.byId,
      ...o,
    });

  it('control: well-formed arguments do not throw', () => {
    expect(call({})).not.toThrow();
  });

  it('a caller bug throws TypeError (it fails the run, not one request)', () => {
    expect(call({ requestKey: '' })).toThrow(TypeError);
    expect(call({ requestKey: 7 })).toThrow(TypeError);
    expect(call({ presented: null })).toThrow(TypeError);
    expect(call({ presented: [{ segmentId: 'fs-a' }] })).toThrow(TypeError);
    expect(call({ presented: [PRESENTED[0], PRESENTED[0]] })).toThrow(TypeError);
    expect(call({ presented: [{ segmentId: 'fs-a', rulingIds: ['no-such-ruling'] }] })).toThrow(
      TypeError
    );
    expect(call({ rulingsById: null })).toThrow(TypeError);
  });

  it('a plain object of rulings is accepted, as the gate accepts one', () => {
    const r = parseTermPassResponse({
      message: message(VALID),
      requestKey: KEY,
      presented: PRESENTED,
      rulingsById: Object.fromEntries(SET.byId),
    });
    expect(gateOpsOf(r, 'fs-a').length).toBe(1);
  });
});

describe('determinism', () => {
  it('the same input gives the same output', () => {
    const d = doc(
      seg('fs-b', {
        senses: [{ ruling: 'cell', sense: 'electrochemical-cell' }],
        ops: [cellOp(), cellOp({ sense: UNCLEAR_SENSE }), cellOp(COINAGE)],
        flags: [{ kind: 'compound-term', ruling: 'cell', note: 'n' }],
      }),
      seg('fs-x', { ops: [op()] })
    );
    expect(parseDoc(d)).toEqual(parseDoc(d));
  });
});
