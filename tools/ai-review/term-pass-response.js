/**
 * term-pass-response.js — reads one raw Messages API response to one term-pass request and
 * turns it into the gate's operations (design: docs/superpowers/specs/
 * 2026-10-27-ai-layer-runner-design.md, "Unit U3"). Pure: plain data in, plain data out; no
 * I/O and no import from server/.
 *
 * A malformed response is never partly trusted: any REQUEST_PROBLEMS code empties every other
 * field. The structured-output schema the model answers in is RESPONSE_SCHEMA, and the shape
 * check walks THAT object (never a second copy of it), so the schema the prompt embeds and the
 * schema the parser enforces cannot drift apart. The API's own enforcement is not relied on.
 *
 * Per op, in this order:
 *   1. its opId is `${requestKey}.op${n}`, n counting every op of the response 1-based in
 *      response order, before anything below — so an opId always names the model's own op;
 *   2. an entry for a segment id the request did not present, or a second entry for one it
 *      did, has every op rejected (response-unknown-segment / response-duplicate-segment), and
 *      its flags and sense judgements are left out of `flags` and `senses`. The entry itself is
 *      recorded in `dropped` — its ops' opIds and its flags and senses as the model gave them —
 *      so an entry with no ops still leaves a trace (a flag raised on a mistyped id would
 *      otherwise vanish, and the result would read as if the model had said nothing);
 *   3. an op declaring sense 'unclear' (any category) becomes a `sense-unclear` flag carrying
 *      its opId and `proposed: { find, replace }`, and never reaches the gate. This is decided
 *      before any runner check, so such an op is flagged even when its ruling was not offered:
 *      it reaches no gate either way, and a human reads the flag;
 *   4. otherwise the runner checks run and EVERY applicable code is reported:
 *      ruling-not-offered, sense-inconsistent, shadowed-by-longer-ruling (rule 4 of the design);
 *   5. an op no check refused becomes a GateOp; only a 'term-sense' op keeps its declared
 *      sense, every other category carries `sense: null` whatever the model sent.
 */

import { usesHeadword } from '../lib/chapter-term-check.js';
import { containsTargetStem } from './gate.js';
import { UNCLEAR_SENSE } from './ruling-set.js';

/** The flag kinds the model may raise, sorted. */
export const FLAG_KINDS = Object.freeze([
  'compound-term', // the fix would need a new word; no edit made
  'mistranslation-suspected', // the segment looks wrong beyond terminology
  'needs-rewrite', // a fix would rewrite more than a term pass may
  'sense-unclear', // the context does not settle a homograph's sense
  'target-other-sense', // the ruled target is used here in another sense
]);

/** What can be wrong with a response as a whole, sorted. Any one empties the result. */
export const REQUEST_PROBLEMS = Object.freeze([
  'response-empty', // no message at all
  'response-invalid', // a stop_reason other than end_turn, or a shape that breaks the schema
  'response-refusal', // stop_reason 'refusal'
  'response-truncated', // stop_reason 'max_tokens'
  'response-unparseable', // no text block, or the text blocks do not JSON.parse
]);

/**
 * The runner's own rejection codes, sorted. `group-incomplete` is assigned by the apply step,
 * not here; it is listed so the closed set has one home.
 */
export const RUNNER_REJECTIONS = Object.freeze([
  'group-incomplete', // another op of the same ruling in the segment was rejected
  'response-duplicate-segment', // an op of a second or later entry for one segment id
  'response-unknown-segment', // an op of a segment id the request did not present
  'ruling-not-offered', // the op's ruling is not among the segment's offered rulings
  'sense-inconsistent', // a term-sense op's sense differs from the segment's senses entry
  'shadowed-by-longer-ruling', // find holds the target or a competitor of a longer ruling
]);

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

const STRING = () => ({ type: 'string' });
const STRING_OR_NULL = () => ({ anyOf: [{ type: 'string' }, { type: 'null' }] });
/** An object schema whose every property is required and nothing else is allowed. */
const closedObject = (properties) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const arrayOf = (items) => ({ type: 'array', items });

/**
 * The structured-output JSON Schema the model answers in. The controller's prompt file embeds
 * it verbatim (a test requires deep equality), so this constant is the single source. The
 * API's structured outputs need `additionalProperties: false` on every object and support no
 * minLength / maximum / maxItems, so none is used.
 */
export const RESPONSE_SCHEMA = deepFreeze(
  closedObject({
    segments: arrayOf(
      closedObject({
        id: STRING(),
        senses: arrayOf(closedObject({ ruling: STRING(), sense: STRING() })),
        ops: arrayOf(
          closedObject({
            category: { type: 'string', enum: ['term', 'term-sense', 'agreement'] },
            ruling: STRING(),
            sense: STRING_OR_NULL(),
            find: STRING(),
            replace: STRING(),
            reason: STRING(),
          })
        ),
        flags: arrayOf(
          closedObject({
            kind: { type: 'string', enum: [...FLAG_KINDS] },
            ruling: STRING_OR_NULL(),
            note: STRING(),
          })
        ),
      })
    ),
  })
);

// ── The shape check ──────────────────────────────────────────────────────────────────────

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The schema keywords `conforms` understands; any other keyword is refused at load. */
const SUPPORTED_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'anyOf',
]);

function assertSupported(schema, where = 'RESPONSE_SCHEMA') {
  const unknown = Object.keys(schema).filter((k) => !SUPPORTED_KEYWORDS.has(k));
  if (unknown.length > 0) throw new Error(`${where}: unsupported keyword(s) ${unknown.join(', ')}`);
  if (schema.type === 'object' && schema.additionalProperties !== false) {
    throw new Error(`${where}: an object must set additionalProperties: false`);
  }
  for (const [k, sub] of Object.entries(schema.properties ?? {})) {
    assertSupported(sub, `${where}.${k}`);
  }
  if (schema.items) assertSupported(schema.items, `${where}[]`);
  (schema.anyOf ?? []).forEach((sub, i) => assertSupported(sub, `${where}|${i}`));
}
assertSupported(RESPONSE_SCHEMA);

/**
 * Does `value` (a JSON.parse result) have exactly the shape `schema` describes? Exact keys
 * (additionalProperties is false everywhere), required keys present, types and enums.
 * @param {object} schema a node of RESPONSE_SCHEMA
 * @param {unknown} value
 * @returns {boolean}
 */
function conforms(schema, value) {
  if (schema.anyOf) return schema.anyOf.some((sub) => conforms(sub, value));
  switch (schema.type) {
    case 'object': {
      if (!isPlainObject(value)) return false;
      const keys = Object.keys(value);
      return (
        keys.every((k) => Object.hasOwn(schema.properties, k)) &&
        schema.required.every((k) => Object.hasOwn(value, k)) &&
        keys.every((k) => conforms(schema.properties[k], value[k]))
      );
    }
    case 'array':
      return Array.isArray(value) && value.every((v) => conforms(schema.items, v));
    case 'string':
      return typeof value === 'string' && (!schema.enum || schema.enum.includes(value));
    case 'null':
      return value === null;
    default:
      throw new Error(`term-pass-response: schema type ${JSON.stringify(schema.type)} unsupported`);
  }
}

// ── The response envelope ────────────────────────────────────────────────────────────────

/** Content blocks that carry no answer and are skipped. Any other non-text type is invalid. */
const IGNORED_BLOCKS = new Set(['thinking', 'redacted_thinking']);

/**
 * The parsed answer document, or the problem that stops it.
 * @returns {{ problem: string|null, document?: object }}
 */
function readDocument(message) {
  if (message === null || message === undefined) return { problem: 'response-empty' };
  if (!isPlainObject(message)) return { problem: 'response-invalid' };
  if (message.stop_reason === 'refusal') return { problem: 'response-refusal' };
  if (message.stop_reason === 'max_tokens') return { problem: 'response-truncated' };
  if (message.stop_reason !== 'end_turn') return { problem: 'response-invalid' };
  if (!Array.isArray(message.content)) return { problem: 'response-invalid' };
  const texts = [];
  for (const block of message.content) {
    if (!isPlainObject(block)) return { problem: 'response-invalid' };
    if (block.type === 'text') {
      if (typeof block.text !== 'string') return { problem: 'response-invalid' };
      texts.push(block.text);
    } else if (!IGNORED_BLOCKS.has(block.type)) {
      return { problem: 'response-invalid' };
    }
  }
  if (texts.length === 0) return { problem: 'response-unparseable' };
  let document;
  try {
    document = JSON.parse(texts.join(''));
  } catch {
    return { problem: 'response-unparseable' };
  }
  if (!conforms(RESPONSE_SCHEMA, document)) return { problem: 'response-invalid' };
  return { problem: null, document };
}

// ── The runner checks ────────────────────────────────────────────────────────────────────

function rulingLookup(rulingsById) {
  if (rulingsById instanceof Map) return (id) => rulingsById.get(id);
  return (id) => (Object.hasOwn(rulingsById, id) ? rulingsById[id] : undefined);
}

/**
 * Rule 4: is an op of ruling R shadowed by a LONGER ruling L offered for the same segment?
 * L shadows R when one of L's English forms contains one of R's as a whole-word phrase
 * (usesHeadword, the gate's English matcher; `fuel cell` ⊃ `cell`, but `atomic orbital` does
 * not contain `atom`). A ruling never shadows itself, although many rulings in the 2026-10-26
 * set carry forms that contain each other (`heat` ⊂ `heat (q)`). The op is shadowed when its
 * `find` contains L's target or a competitor by the gate's LOOSE containsTargetStem, so the
 * guard refuses more rather than less.
 */
function isShadowed(op, offeredIds, lookup) {
  const R = lookup(op.ruling);
  if (!R) return false; // not offered either: ruling-not-offered already refuses it
  return offeredIds.some((lid) => {
    if (lid === R.id) return false;
    const L = lookup(lid);
    const contains = L.en.some((fL) => R.en.some((fR) => fL !== fR && usesHeadword(fR, fL)));
    return (
      contains && [L.is, ...L.competitors].some((target) => containsTargetStem(op.find, target))
    );
  });
}

/** The runner codes for one op of a presented segment (sorted, as RUNNER_REJECTIONS is). */
function runnerReasons(op, entry, offeredIds, lookup) {
  const reasons = [];
  if (!offeredIds.includes(op.ruling)) reasons.push('ruling-not-offered');
  if (
    op.category === 'term-sense' &&
    entry.senses.some((s) => s.ruling === op.ruling && s.sense !== op.sense)
  ) {
    reasons.push('sense-inconsistent');
  }
  if (isShadowed(op, offeredIds, lookup)) reasons.push('shadowed-by-longer-ruling');
  return reasons;
}

/** Is a sense judgement one the ruling's closed list admits? */
function senseIsValid(judgement, offeredIds, lookup) {
  if (!offeredIds.includes(judgement.ruling)) return false;
  const sense = lookup(judgement.ruling)?.sense;
  if (!sense) return false;
  return (
    judgement.sense === UNCLEAR_SENSE ||
    judgement.sense === sense.id ||
    sense.otherSenses.some((o) => o.id === judgement.sense)
  );
}

function checkArgs({ requestKey, presented, rulingsById }) {
  if (typeof requestKey !== 'string' || requestKey === '') {
    throw new TypeError('parseTermPassResponse: requestKey must be a non-empty string');
  }
  if (!(rulingsById instanceof Map) && !isPlainObject(rulingsById)) {
    throw new TypeError('parseTermPassResponse: rulingsById must be a Map or an object');
  }
  if (!Array.isArray(presented)) {
    throw new TypeError('parseTermPassResponse: presented must be an array');
  }
  const lookup = rulingLookup(rulingsById);
  const seen = new Set();
  for (const p of presented) {
    if (!isPlainObject(p) || typeof p.segmentId !== 'string' || p.segmentId === '') {
      throw new TypeError('parseTermPassResponse: each presented entry needs a segmentId');
    }
    if (seen.has(p.segmentId)) {
      throw new TypeError(`parseTermPassResponse: segment ${p.segmentId} presented twice`);
    }
    seen.add(p.segmentId);
    if (!Array.isArray(p.rulingIds) || !p.rulingIds.every((id) => typeof id === 'string')) {
      throw new TypeError(`parseTermPassResponse: ${p.segmentId}: rulingIds must be strings`);
    }
    for (const id of p.rulingIds) {
      if (!lookup(id)) {
        throw new TypeError(`parseTermPassResponse: ${p.segmentId}: unknown ruling ${id}`);
      }
    }
  }
  return lookup;
}

// ── Public API ───────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ opId: string, category: 'term'|'term-sense'|'agreement', rulingId: string,
 *   sense: string|null, find: string, replace: string, reason: string }} GateOp
 */

/**
 * Parse one raw Messages API response to one term-pass request.
 *
 * @param {object} args
 * @param {object|null|undefined} args.message the raw response (`content` blocks; thinking
 *   blocks are skipped, text blocks concatenated in order before JSON.parse)
 * @param {string} args.requestKey the request's key; opIds are `${requestKey}.op${n}`
 * @param {Array<{ segmentId: string, rulingIds: string[] }>} args.presented the segments the
 *   request showed, in order, with the rulings offered for each
 * @param {Map<string, object>|Record<string, object>} args.rulingsById Unit B's rulings
 *   (loadRulingSet's `byId`); every offered ruling id must be in it
 * @returns {{
 *   problem: string|null,
 *   segments: Map<string, GateOp[]>,
 *   rejected: Array<{ segmentId: string, opId: string, op: object, reasons: string[] }>,
 *   flags: Array<{ segmentId: string, kind: string, rulingId: string|null, note: string,
 *     opId?: string, proposed?: { find: string, replace: string } }>,
 *   senses: Array<{ segmentId: string, rulingId: string, sense: string, valid: boolean }>,
 *   missing: string[],
 *   dropped: Array<{ segmentId: string, reason: 'response-unknown-segment'|
 *     'response-duplicate-segment', opIds: string[], flags: object[], senses: object[] }>,
 * }} `segments` is keyed in presented order, one entry per presented segment the response
 *   answered (its list possibly empty); `rejected` and `senses` are in response order; `flags`
 *   are in response order, an entry's own flags before its converted 'unclear' ops; `missing`
 *   is in presented order; `dropped` holds every unknown or duplicate entry in response order,
 *   its `flags` and `senses` as the model gave them (schema names, like `rejected[].op`). With
 *   a `problem`, every other field is empty.
 * @throws {TypeError} on malformed arguments — a caller bug fails the run, not one request.
 */
export function parseTermPassResponse({ message, requestKey, presented, rulingsById } = {}) {
  const lookup = checkArgs({ requestKey, presented, rulingsById });
  const result = {
    problem: null,
    segments: new Map(),
    rejected: [],
    flags: [],
    senses: [],
    missing: [],
    dropped: [],
  };

  const { problem, document } = readDocument(message);
  if (problem) return { ...result, problem };

  const offered = new Map(presented.map((p) => [p.segmentId, p.rulingIds]));
  const answered = new Map(); // segmentId → GateOp[], in response order
  let n = 0;

  for (const entry of document.segments) {
    const segmentId = entry.id;
    const opIds = entry.ops.map(() => `${requestKey}.op${++n}`);
    const offeredIds = offered.get(segmentId);
    const whole = !offeredIds
      ? 'response-unknown-segment'
      : answered.has(segmentId)
        ? 'response-duplicate-segment'
        : null;
    if (whole) {
      entry.ops.forEach((op, k) =>
        result.rejected.push({ segmentId, opId: opIds[k], op, reasons: [whole] })
      );
      result.dropped.push({
        segmentId,
        reason: whole,
        opIds,
        flags: entry.flags,
        senses: entry.senses,
      });
      continue;
    }

    const gateOps = [];
    answered.set(segmentId, gateOps);
    for (const s of entry.senses) {
      result.senses.push({
        segmentId,
        rulingId: s.ruling,
        sense: s.sense,
        valid: senseIsValid(s, offeredIds, lookup),
      });
    }
    for (const f of entry.flags) {
      result.flags.push({ segmentId, kind: f.kind, rulingId: f.ruling, note: f.note });
    }
    entry.ops.forEach((op, k) => {
      const opId = opIds[k];
      if (op.sense === UNCLEAR_SENSE) {
        result.flags.push({
          segmentId,
          kind: 'sense-unclear',
          rulingId: op.ruling,
          note: op.reason,
          opId,
          proposed: { find: op.find, replace: op.replace },
        });
        return;
      }
      const reasons = runnerReasons(op, entry, offeredIds, lookup);
      if (reasons.length > 0) {
        result.rejected.push({ segmentId, opId, op, reasons });
        return;
      }
      gateOps.push({
        opId,
        category: op.category,
        rulingId: op.ruling,
        sense: op.category === 'term-sense' ? op.sense : null,
        find: op.find,
        replace: op.replace,
        reason: op.reason,
      });
    });
  }

  for (const { segmentId } of presented) {
    if (answered.has(segmentId)) result.segments.set(segmentId, answered.get(segmentId));
    else result.missing.push(segmentId);
  }
  return result;
}
