/**
 * The response parser (tools/ai-review/term-pass-response.js; design:
 * docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md, "Unit U3"). Every refusing case
 * has a passing control beside it.
 *
 * Rulings are the REAL committed set of 2026-10-26, loaded the way the integration test loads
 * it. The Icelandic in `find`/`replace` is hand-written to exercise one mechanism each (the
 * parser never reads segment text); the coinage `vetnisefnarafala` → `vetniseldsneytiskeri` is
 * the one the design records the gate as ACCEPTING, which only the shadowing guard stops.
 * The one exception is the KNOWN GAP block, which reads a real ch17 segment from disk.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRulingSet, UNCLEAR_SENSE } from '../ai-review/ruling-set.js';
import { carriesTarget, containsTargetStem } from '../ai-review/gate.js';
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
/**
 * A segment's `senses` judging `cell` (by default as the ruled sense). A term-sense op needs
 * one, or it is `sense-unjudged`; every fixture with a term-sense `cell` op that is meant to
 * reach the gate carries it.
 */
const judged = (sense = 'electrochemical-cell') => [{ ruling: 'cell', sense }];
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

const EMPTY = {
  segments: new Map(),
  rejected: [],
  flags: [],
  senses: [],
  missing: [],
  dropped: [],
};
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
        'sense-unjudged',
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
    // Discriminating: an ARRAY holding valid JSON. Without the type check, join('') would turn
    // it into exactly that JSON and the response would be trusted.
    expectProblem(
      parse(message(VALID, { content: [{ type: 'text', text: [JSON.stringify(VALID)] }] })),
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

  describe('a malformed element AFTER a well-formed one is response-invalid too', () => {
    // Every array element is checked, not only the first: a check of element [0] alone would
    // trust a malformed second op, flag or sense, and flags and senses reach the record a human
    // reads without passing any gate.
    const goodFlag = { kind: 'needs-rewrite', ruling: null, note: 'n' };
    const goodSense = { ruling: 'cell', sense: 'living-cell' };
    const cases = {
      'second op': doc(seg('fs-a', { ops: [op(), op({ category: 'rewrite' })] })),
      'second flag': doc(
        seg('fs-a', { flags: [goodFlag, { kind: 'approve-anyway', ruling: null, note: 'n' }] })
      ),
      'second sense': doc(
        seg('fs-b', { senses: [goodSense, { ruling: 'fuel-cell', sense: null }] })
      ),
      'second segment': doc(seg('fs-a'), { id: 'fs-b', senses: [], ops: [] }),
    };
    for (const [name, bad] of Object.entries(cases)) {
      it(name, () => expectProblem(parse(message(bad)), 'response-invalid'));
    }

    it('control: two well-formed elements in every array pass', () => {
      const good = doc(
        seg('fs-a', { ops: [op(), op({ find: 'frumeindin' })], flags: [goodFlag, goodFlag] }),
        seg('fs-b', { senses: [goodSense, { ruling: 'fuel-cell', sense: 'x' }] })
      );
      const r = parse(message(good));
      expect([r.problem, gateOpsOf(r, 'fs-a').length, r.flags.length, r.senses.length]).toEqual([
        null,
        2,
        2,
        2,
      ]);
    });
  });

  it('with a problem, nothing else is trusted: every other field is empty', () => {
    const r = parse(message(VALID, { stop_reason: 'max_tokens' }));
    expect([r.segments.size, r.rejected, r.flags, r.senses, r.missing, r.dropped]).toEqual([
      0,
      [],
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
    seg('fs-b', { senses: judged(), ops: [op(), cellOp()] }), // op4 not offered, op5 kept
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
    const senses = [{ ruling: 'cell', sense: 'living-cell' }];
    const flags = [{ kind: 'needs-rewrite', ruling: null, note: 'unknown' }];
    const r = parseDoc(
      doc(seg('fs-x', { ops: [unknownOp, op({ sense: UNCLEAR_SENSE })], senses, flags }))
    );
    expect({
      rejected: r.rejected,
      flags: r.flags,
      senses: r.senses,
      keys: [...r.segments.keys()],
      dropped: r.dropped,
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
      dropped: [
        {
          segmentId: 'fs-x',
          reason: 'response-unknown-segment',
          opIds: [`${KEY}.op1`, `${KEY}.op2`],
          flags,
          senses,
        },
      ],
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
    const senses = [{ ruling: 'atom', sense: 'x' }];
    const flags = [{ kind: 'needs-rewrite', ruling: null, note: 'second' }];
    const r = parseDoc(
      doc(seg('fs-a', { ops: [first] }), seg('fs-a', { ops: [second], senses, flags }))
    );
    expect({
      kept: gateOpsOf(r, 'fs-a').map((o) => o.find),
      rejected: r.rejected.map((x) => [x.opId, x.op, x.reasons]),
      flags: r.flags,
      senses: r.senses,
      dropped: r.dropped,
    }).toEqual({
      kept: ['frumeindin'],
      rejected: [[`${KEY}.op2`, second, ['response-duplicate-segment']]],
      flags: [],
      senses: [],
      dropped: [
        {
          segmentId: 'fs-a',
          reason: 'response-duplicate-segment',
          opIds: [`${KEY}.op2`],
          flags,
          senses,
        },
      ],
    });
  });

  it('an unknown id answered twice is unknown both times, never duplicate', () => {
    const r = parseDoc(doc(seg('fs-x', { ops: [op()] }), seg('fs-x', { ops: [op()] })));
    expect([r.rejected.map((x) => x.reasons), r.dropped.map((d) => d.reason)]).toEqual([
      [['response-unknown-segment'], ['response-unknown-segment']],
      ['response-unknown-segment', 'response-unknown-segment'],
    ]);
  });

  describe('dropped: an unknown or duplicate entry leaves a trace even with no ops', () => {
    // Without it, a flag raised on a mistyped id would vanish: no op, so no rejected record,
    // and the result would read as if the model had said nothing.
    it('a mistyped id with no ops: its flag and sense judgement are kept in dropped', () => {
      const flags = [{ kind: 'mistranslation-suspected', ruling: null, note: 'TYPO-ID FLAG' }];
      const senses = [{ ruling: 'cell', sense: 'living-cell' }];
      const r = parseDoc(doc(seg('fs-a'), seg('fs-bb', { flags, senses })));
      expect({
        rejected: r.rejected,
        flags: r.flags,
        senses: r.senses,
        missing: r.missing,
        dropped: r.dropped,
      }).toEqual({
        rejected: [],
        flags: [],
        senses: [],
        missing: ['fs-b'],
        dropped: [
          { segmentId: 'fs-bb', reason: 'response-unknown-segment', opIds: [], flags, senses },
        ],
      });
    });

    it('a duplicate entry with no ops: kept in dropped', () => {
      const flags = [{ kind: 'needs-rewrite', ruling: null, note: 'DUPLICATE FLAG' }];
      const r = parseDoc(doc(seg('fs-a'), seg('fs-b'), seg('fs-a', { flags })));
      expect([r.flags, r.dropped]).toEqual([
        [],
        [
          {
            segmentId: 'fs-a',
            reason: 'response-duplicate-segment',
            opIds: [],
            flags,
            senses: [],
          },
        ],
      ]);
    });

    it('every such entry is recorded, an empty one too, in response order', () => {
      const r = parseDoc(doc(seg('fs-x'), seg('fs-a'), seg('fs-a'), seg('fs-y')));
      expect(r.dropped.map((d) => [d.segmentId, d.reason])).toEqual([
        ['fs-x', 'response-unknown-segment'],
        ['fs-a', 'response-duplicate-segment'],
        ['fs-y', 'response-unknown-segment'],
      ]);
    });

    it('control: a presented segment answered once is never in dropped', () => {
      const r = parseDoc(
        doc(
          seg('fs-a', { ops: [op()], flags: [{ kind: 'needs-rewrite', ruling: null, note: 'n' }] }),
          seg('fs-b', { senses: [{ ruling: 'cell', sense: 'living-cell' }] })
        )
      );
      expect([r.dropped, r.flags.length, r.senses.length]).toEqual([[], 1, 1]);
    });
  });
});

// ── ruling-not-offered ───────────────────────────────────────────────────────────────────

describe('ruling-not-offered', () => {
  it('an op whose ruling is not in that segment’s rulingIds is rejected', () => {
    const r = parseDoc(doc(seg('fs-a', { senses: judged(), ops: [cellOp()] })));
    expect([reasonsOf(r, `${KEY}.op1`), gateOpsOf(r, 'fs-a')]).toEqual([
      ['ruling-not-offered'],
      [],
    ]);
  });

  it('control: the same op in the segment that offers the ruling reaches segments', () => {
    const r = parseDoc(doc(seg('fs-b', { senses: judged(), ops: [cellOp()] })));
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

  it('no entry for that ruling is not sense-inconsistent (it is sense-unjudged, below)', () => {
    const r = run([{ ruling: 'fuel-cell', sense: 'living-cell' }]);
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['sense-unjudged']);
  });

  it('two entries for the ruling, one disagreeing: rejected', () => {
    const r = run([
      { ruling: 'cell', sense: 'electrochemical-cell' },
      { ruling: 'cell', sense: 'unit-cell' },
    ]);
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['sense-inconsistent']);
  });

  it('a senses entry `unclear` is not sense-inconsistent: the op becomes a flag (below)', () => {
    const r = run([{ ruling: 'cell', sense: UNCLEAR_SENSE }]);
    expect([r.rejected, r.flags.map((f) => [f.kind, f.opId])]).toEqual([
      [],
      [['sense-unclear', `${KEY}.op1`]],
    ]);
  });

  it('only a term-sense op is checked: an agreement op of the same sensed ruling passes beside it', () => {
    // Discriminating: the agreement op's sense is null, which differs from the senses entry,
    // so a check run on every category would refuse it.
    const r = parseDoc(
      doc(
        seg('fs-b', {
          senses: [{ ruling: 'cell', sense: 'electrochemical-cell' }],
          ops: [
            cellOp(),
            cellOp({ category: 'agreement', sense: null, find: 'hún', replace: 'það' }),
          ],
        })
      )
    );
    expect([r.rejected, gateOpsOf(r, 'fs-b').map((g) => [g.category, g.sense])]).toEqual([
      [],
      [
        ['term-sense', 'electrochemical-cell'],
        ['agreement', null],
      ],
    ]);
  });

  it('only a term-sense op is checked: a term op passes beside a senses entry for its ruling', () => {
    // `atom` has no sense, so the senses entry is invalid; it still never refuses a term op.
    const r = parseDoc(doc(seg('fs-a', { senses: [{ ruling: 'atom', sense: 'x' }], ops: [op()] })));
    expect([r.rejected, gateOpsOf(r, 'fs-a').length, r.senses[0].valid]).toEqual([[], 1, false]);
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
            valid: true,
            opId: `${KEY}.op1`,
            proposed: { find: 'sellunni', replace: 'kerinu' },
          },
        ],
      });
    });
  }

  it('control: the same op declaring the ruled sense reaches segments and raises no flag', () => {
    const r = parseDoc(doc(seg('fs-b', { senses: judged(), ops: [cellOp()] })));
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
      {
        segmentId: 'fs-a',
        kind: 'mistranslation-suspected',
        rulingId: null,
        note: 'n',
        valid: true,
      },
    ]);
  });
});

// ── 'unclear', normalised ────────────────────────────────────────────────────────────────

describe("an op's 'unclear' is recognised after trim() and toLowerCase(), in any category", () => {
  it("MEASURED: 'Unclear' on a term op of an unsensed ruling is a flag, not an applied op", () => {
    // Before the fix the comparison was exact, so 'Unclear' missed it; a term op's sense is
    // then nulled and the op reached the gate as if the model had been sure. `atom` has no
    // sense, so no other check could stop it.
    expect(SET.byId.get('atom').sense).toBe(null);
    const r = parseDoc(
      doc(seg('fs-a', { ops: [op({ sense: 'Unclear', reason: 'cannot tell' })] }))
    );
    expect({ segments: [...r.segments], rejected: r.rejected, flags: r.flags }).toEqual({
      segments: [['fs-a', []]],
      rejected: [],
      flags: [
        {
          segmentId: 'fs-a',
          kind: 'sense-unclear',
          rulingId: 'atom',
          note: 'cannot tell',
          valid: true,
          opId: `${KEY}.op1`,
          proposed: { find: 'frumeindir', replace: 'atóm' },
        },
      ],
    });
  });

  for (const category of ['term', 'term-sense', 'agreement']) {
    for (const sense of ['Unclear', ' unclear ', 'UNCLEAR', '\tUnClEaR\n']) {
      it(`(${category}, ${JSON.stringify(sense)}) becomes a sense-unclear flag, never a gate op`, () => {
        const r = parseDoc(
          doc(seg('fs-b', { senses: judged(), ops: [cellOp({ category, sense })] }))
        );
        expect([
          gateOpsOf(r, 'fs-b'),
          r.rejected,
          r.flags.map((f) => [f.kind, f.rulingId, f.opId, f.proposed]),
        ]).toEqual([
          [],
          [],
          [['sense-unclear', 'cell', `${KEY}.op1`, { find: 'rafhlöðunni', replace: 'kerinu' }]],
        ]);
      });
    }
  }

  it('control: a sense that merely contains the word is not unclear', () => {
    // Normalisation is trim + lowercase, never a substring test: these term ops are the
    // ordinary case, their sense nulled and the op kept.
    const r = parseDoc(
      doc(
        seg('fs-a', {
          ops: [
            op({ sense: 'unclearly' }),
            op({ sense: 'not unclear', find: 'frumeindin', replace: 'atómið' }),
          ],
        })
      )
    );
    expect([gateOpsOf(r, 'fs-a').map((g) => g.sense), r.flags]).toEqual([[null, null], []]);
  });
});

// ── A senses entry 'unclear' ─────────────────────────────────────────────────────────────

describe("a senses entry 'unclear' turns that ruling's term-sense ops into flags", () => {
  const agreement = (o = {}) =>
    cellOp({ category: 'agreement', sense: null, find: 'hún', replace: 'það', ...o });

  it('the term-sense op becomes a sense-unclear flag, not a sense-inconsistent rejection', () => {
    const r = parseDoc(
      doc(seg('fs-b', { senses: judged(UNCLEAR_SENSE), ops: [cellOp({ reason: 'cell → ker' })] }))
    );
    expect({ segments: [...r.segments], rejected: r.rejected, flags: r.flags }).toEqual({
      segments: [['fs-b', []]],
      rejected: [],
      flags: [
        {
          segmentId: 'fs-b',
          kind: 'sense-unclear',
          rulingId: 'cell',
          note: 'cell → ker',
          valid: true,
          opId: `${KEY}.op1`,
          proposed: { find: 'rafhlöðunni', replace: 'kerinu' },
        },
      ],
    });
  });

  it('the entry is normalised as an op’s sense is (` Unclear `)', () => {
    const r = parseDoc(doc(seg('fs-b', { senses: judged(' Unclear '), ops: [cellOp()] })));
    expect([r.rejected, r.flags.map((f) => [f.kind, f.opId])]).toEqual([
      [],
      [['sense-unclear', `${KEY}.op1`]],
    ]);
  });

  it('every term-sense op of that ruling is converted, each under its own opId', () => {
    const r = parseDoc(
      doc(
        seg('fs-b', {
          senses: judged(UNCLEAR_SENSE),
          ops: [cellOp(), cellOp({ find: 'rafhlöðu', replace: 'ker' })],
        })
      )
    );
    expect([gateOpsOf(r, 'fs-b'), r.flags.map((f) => [f.opId, f.proposed.find])]).toEqual([
      [],
      [
        [`${KEY}.op1`, 'rafhlöðunni'],
        [`${KEY}.op2`, 'rafhlöðu'],
      ],
    ]);
  });

  it('an agreement op of that ruling stays an op (the apply step’s group rule withdraws it)', () => {
    const r = parseDoc(
      doc(seg('fs-b', { senses: judged(UNCLEAR_SENSE), ops: [cellOp(), agreement()] }))
    );
    expect([
      gateOpsOf(r, 'fs-b').map((g) => [g.opId, g.category]),
      r.rejected,
      r.flags.map((f) => [f.opId, f.rulingId]),
    ]).toEqual([[[`${KEY}.op2`, 'agreement']], [], [[`${KEY}.op1`, 'cell']]]);
  });

  it('two entries for the ruling, one of them unclear: converted', () => {
    const senses = [
      { ruling: 'cell', sense: 'electrochemical-cell' },
      { ruling: 'cell', sense: UNCLEAR_SENSE },
    ];
    const r = parseDoc(doc(seg('fs-b', { senses, ops: [cellOp()] })));
    expect([r.rejected, r.flags.map((f) => f.opId)]).toEqual([[], [`${KEY}.op1`]]);
  });

  it('control: an unclear entry for ANOTHER ruling converts nothing', () => {
    const senses = [...judged(), { ruling: 'fuel-cell', sense: UNCLEAR_SENSE }];
    const r = parseDoc(doc(seg('fs-b', { senses, ops: [cellOp()] })));
    expect([r.rejected, gateOpsOf(r, 'fs-b').length, r.flags]).toEqual([[], 1, []]);
  });

  it('converted even when the ruling is not offered (it reaches no gate either way)', () => {
    const r = parseDoc(doc(seg('fs-a', { senses: judged(UNCLEAR_SENSE), ops: [cellOp()] })));
    expect([r.rejected, r.flags.map((f) => [f.kind, f.rulingId, f.valid])]).toEqual([
      [],
      [['sense-unclear', 'cell', false]],
    ]);
  });
});

// ── sense-unjudged ───────────────────────────────────────────────────────────────────────

describe('sense-unjudged', () => {
  // The prompt requires one judgement per sensed ruling listed; a term-sense edit whose
  // ruling the model did not judge in that segment must not land.
  it('a term-sense op whose ruling has no senses entry in the segment is rejected', () => {
    const r = parseDoc(doc(seg('fs-b', { ops: [cellOp()] })));
    expect([reasonsOf(r, `${KEY}.op1`), gateOpsOf(r, 'fs-b')]).toEqual([['sense-unjudged'], []]);
  });

  it('an entry for another ruling is not a judgement of this one', () => {
    // Discriminating: a check of "senses is empty" would let this op through.
    const senses = [{ ruling: 'fuel-cell', sense: 'living-cell' }];
    const r = parseDoc(doc(seg('fs-b', { senses, ops: [cellOp()] })));
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['sense-unjudged']);
  });

  it('a judgement given in another segment does not count', () => {
    // Discriminating: a lookup across the whole response would let this op through.
    const presented = [
      { segmentId: 'fs-b', rulingIds: ['cell'] },
      { segmentId: 'fs-c', rulingIds: ['cell'] },
    ];
    const r = parseDoc(
      doc(seg('fs-b', { ops: [cellOp()] }), seg('fs-c', { senses: judged() })),
      presented
    );
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['sense-unjudged']);
  });

  it('control: the same op with a judgement of its ruling reaches segments', () => {
    const r = parseDoc(doc(seg('fs-b', { senses: judged(), ops: [cellOp()] })));
    expect([r.rejected, gateOpsOf(r, 'fs-b').length]).toEqual([[], 1]);
  });

  it('control: a term op and an agreement op need no judgement', () => {
    const r = parseDoc(
      doc(
        seg('fs-a', { ops: [op()] }),
        seg('fs-b', {
          ops: [cellOp({ category: 'agreement', sense: null, find: 'hún', replace: 'það' })],
        })
      )
    );
    expect([r.rejected, gateOpsOf(r, 'fs-a').length, gateOpsOf(r, 'fs-b').length]).toEqual([
      [],
      1,
      1,
    ]);
  });

  it('every applicable code is reported: not offered and unjudged', () => {
    const r = parseDoc(doc(seg('fs-a', { ops: [cellOp()] })));
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['ruling-not-offered', 'sense-unjudged']);
  });
});

// ── flags[].valid ────────────────────────────────────────────────────────────────────────

describe('every flag carries valid: its ruling is null or offered for that segment', () => {
  const flagged = (segmentId, ruling) =>
    parseDoc(doc(seg(segmentId, { flags: [{ kind: 'needs-rewrite', ruling, note: 'n' }] })))
      .flags[0];

  it('a flag with no ruling is valid', () => {
    expect(flagged('fs-a', null).valid).toBe(true);
  });

  it('a flag on a ruling offered for the segment is valid', () => {
    expect(flagged('fs-b', 'cell').valid).toBe(true);
  });

  it('a flag on a ruling offered only for ANOTHER segment is invalid', () => {
    expect(flagged('fs-a', 'cell').valid).toBe(false);
  });

  it('a flag on an unknown ruling is invalid', () => {
    expect(flagged('fs-a', 'no-such-ruling').valid).toBe(false);
  });

  it('a converted op’s flag is judged the same way', () => {
    const r = parseDoc(
      doc(
        seg('fs-a', {
          ops: [cellOp({ sense: UNCLEAR_SENSE }), op({ sense: UNCLEAR_SENSE })],
        })
      )
    );
    expect(r.flags.map((f) => [f.rulingId, f.valid])).toEqual([
      ['cell', false],
      ['atom', true],
    ]);
  });

  it('the shapes are fixed, keys in order: a model flag, then a converted op', () => {
    const r = parseDoc(
      doc(
        seg('fs-b', {
          ops: [cellOp({ sense: UNCLEAR_SENSE })],
          flags: [{ kind: 'compound-term', ruling: 'cell', note: 'n' }],
        })
      )
    );
    expect(r.flags.map((f) => Object.keys(f))).toEqual([
      ['segmentId', 'kind', 'rulingId', 'note', 'valid'],
      ['segmentId', 'kind', 'rulingId', 'note', 'valid', 'opId', 'proposed'],
    ]);
  });

  it('control: a dropped entry’s flags stay as the model gave them, with no valid', () => {
    const flags = [{ kind: 'needs-rewrite', ruling: 'cell', note: 'n' }];
    const r = parseDoc(doc(seg('fs-x', { flags })));
    expect(r.dropped[0].flags).toEqual(flags);
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
    const r = parseDoc(
      doc(seg('fs-b', { senses: judged(), ops: [cellOp({ reason: 'cell → ker' })] }))
    );
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
    const r = parseDoc(
      doc(seg('fs-b', { senses: judged('living-cell'), ops: [cellOp({ sense: 'living-cell' })] }))
    );
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
  /** fs-b answered with `cell` judged as the ruled sense, so a term-sense op is not unjudged. */
  const cellSeg = (...ops) => seg('fs-b', { senses: judged(), ops });

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
    expect(first(doc(cellSeg(cellOp(COINAGE))))).toEqual({
      reasons: ['shadowed-by-longer-ruling'],
      kept: 0,
    });
  });

  it('control: the same op with find `rafhlöðunni` is not shadowed', () => {
    expect(first(doc(cellSeg(cellOp({ find: 'rafhlöðunni' }))))).toEqual({
      reasons: null,
      kept: 1,
    });
  });

  it('control: the coinage is not shadowed when fuel-cell is not offered for the segment', () => {
    const presented = [{ segmentId: 'fs-b', rulingIds: ['cell'] }];
    expect(first(doc(cellSeg(cellOp(COINAGE))), presented)).toEqual({
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
    expect(first(doc(cellSeg(cellOp({ find })))).reasons).toEqual(['shadowed-by-longer-ruling']);
  });

  it('the guard matches LOOSELY: the longer target as a modifier of `find` shadows too', () => {
    // The design picks the gate's loose containsTargetStem so the guard refuses more rather
    // than less. Discriminating: the strict carriesTarget does not see a modifier, so a guard
    // built on it would let this op through.
    const find = 'efnarafalsbíllinn';
    expect([containsTargetStem(find, 'efnarafall'), carriesTarget(find, 'efnarafall')]).toEqual([
      true,
      false,
    ]);
    expect(first(doc(cellSeg(cellOp({ find, replace: 'kerbíllinn' }))))).toEqual({
      reasons: ['shadowed-by-longer-ruling'],
      kept: 0,
    });
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
    const r = parse(message(doc(cellSeg(cellOp(COINAGE)))), presented, rulingsById);
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

// ── KNOWN GAP: a design gap, not a U3 defect ─────────────────────────────────────────────

describe('KNOWN GAP (design, not U3): rule 4 cannot see an uncatalogued rendering of the longer term', () => {
  // Real ch17 text, m68825 fs-idm8272528: the English says "Hydrogen fuel cells" and the MT
  // renders it `Vetnisrafalar`, which is neither fuel-cell's target nor its one catalogued
  // competitor, while `cell` has no competitor at all. Rule 4 as the design writes it refuses
  // only a find holding one of those, so a cell op `Vetnisrafalar` → `Vetnisker` passes the
  // parser, and the U3 review measured the real gate ACCEPTING it. The remedy is a ruling-set
  // or design change for the controller to rule on, not a parser change. The `it.fails` below
  // asserts the WANTED behaviour, so it turns red the day such a change lands here and this
  // marker cannot outlive the gap.
  // ✏️ Ruled 2026-10-27 (controller): closed UPSTREAM, by phrase precedence in the work list
  // (worklist.js). Every "cell" in that segment lies inside "fuel cell(s)", so `cell` is never
  // offered there, and an op naming it is refused here as ruling-not-offered. This block still
  // fakes `presented: ['cell','fuel-cell']`, a request the work list no longer builds, so the
  // parser-level gap it marks remains true of the parser alone; worklist's test of the same
  // real segment pins the closure.
  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const ID = 'fs-idm8272528';
  const segmentText = (tree, file) => {
    const lines = fs
      .readFileSync(path.join(REPO, 'books', 'efnafraedi-2e', tree, 'ch17', file), 'utf8')
      .split('\n');
    const at = lines.indexOf(`<!-- SEG:m68825:para:${ID} -->`);
    return at < 0 ? null : lines[at + 1];
  };
  const presented = [{ segmentId: ID, rulingIds: ['cell', 'fuel-cell'] }];
  const coinOp = cellOp({ find: 'Vetnisrafalar', replace: 'Vetnisker' });
  // Since `sense-unjudged` (2026-10-27), a term-sense op with no judgement of its ruling is
  // refused for THAT reason, so each case below answers with `cell` judged as the ruled sense.
  // Without it the `it.fails` would keep failing for the wrong reason and stop being a marker.
  const answer = (o) => doc(seg(ID, { senses: judged(), ops: [o] }));

  it('the premise holds on the committed text and ruling set', () => {
    const en = segmentText('02-for-mt', 'm68825-segments.en.md');
    const is = segmentText('02-mt-output', 'm68825-segments.is.md');
    const fuel = SET.byId.get('fuel-cell');
    expect({
      en: en?.includes('Hydrogen fuel cells'),
      is: is?.includes('Vetnisrafalar eru'),
      seenByGuard: [fuel.is, ...fuel.competitors].map((t) => containsTargetStem(coinOp.find, t)),
      cellCompetitors: SET.byId.get('cell').competitors,
    }).toEqual({ en: true, is: true, seenByGuard: [false, false], cellCompetitors: [] });
  });

  it('the gap is live at the parser: with its ruling judged, that op is kept today', () => {
    // What keeps the `it.fails` below meaningful: it fails because the op PASSES, not because
    // some other check refuses it first.
    const r = parseDoc(answer(coinOp), presented);
    expect([reasonsOf(r, `${KEY}.op1`), gateOpsOf(r, ID).length]).toEqual([null, 1]);
  });

  it.fails('WANTED (fails today): a cell op on that rendering is shadowed by fuel-cell', () => {
    const r = parseDoc(answer(coinOp), presented);
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['shadowed-by-longer-ruling']);
  });

  it('control: on the same segment, an op whose find holds fuel-cell’s target IS shadowed', () => {
    const r = parseDoc(answer(cellOp({ find: 'efnarafal', replace: 'efnaker' })), presented);
    expect(reasonsOf(r, `${KEY}.op1`)).toEqual(['shadowed-by-longer-ruling']);
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

  // Each case asserts the guard's own message as well as the class: a TypeError alone is also
  // what an unguarded input raises by accident further on, so the class pins nothing.
  const cases = [
    ['an empty requestKey', { requestKey: '' }, /requestKey must be a non-empty string/],
    ['a non-string requestKey', { requestKey: 7 }, /requestKey must be a non-empty string/],
    ['presented null', { presented: null }, /presented must be an array/],
    ['a presented entry with no rulingIds', { presented: [{ segmentId: 'fs-a' }] }, /rulingIds/],
    ['a segment presented twice', { presented: [PRESENTED[0], PRESENTED[0]] }, /presented twice/],
    // An op-less answer: with ops, an unknown ruling would also crash later by accident.
    [
      'an unknown offered ruling',
      {
        message: message(doc(seg('fs-a'))),
        presented: [{ segmentId: 'fs-a', rulingIds: ['no-such-ruling'] }],
      },
      /unknown ruling no-such-ruling/,
    ],
    ['rulingsById null', { rulingsById: null }, /rulingsById must be a Map or an object/],
    ['rulingsById an array', { rulingsById: [] }, /rulingsById must be a Map or an object/],
  ];
  for (const [name, args, pattern] of cases) {
    it(`a caller bug throws TypeError (it fails the run, not one request): ${name}`, () => {
      expect(call(args)).toThrow(TypeError);
      expect(call(args)).toThrow(pattern);
    });
  }

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
