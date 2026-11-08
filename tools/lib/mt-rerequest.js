/**
 * mt-rerequest.js — the pure halves of the RE-REQUEST mode (plan 2026-10-10 §2.3): which
 * named segments may be re-requested from the API, what goes on the wire for them, and how
 * each answer is classified.
 *
 * Why it exists: `--top-up` buys only MISSING ids, and `--force` rewrites whole modules over
 * `02-mt-output`'s hand repairs. Segments the MT returned in English are present ids, so
 * neither reaches them. The mode re-sends just those segments and writes accepted answers to
 * layer 1s (`02-mt-selected/`, `mt-layers.js`), never to layer 1.
 *
 * 🔴 SELECTION IS FAIL-CLOSED ON RESIDUE. An id whose current body is already translated is
 * refused (`not-untranslated`), so a typo cannot re-buy a translated segment. "Untranslated"
 * is `detectResidue(en, is).exact` (`residue-check.js`) — the predicate that found the 8
 * September segments — and the same predicate judges each answer. No second test is written.
 *
 * Pure: strings in, values out. It writes nothing and talks to no API; the wire text goes
 * through `api-translate`'s guarded core like every other paid text.
 */

import { createRequire } from 'node:module';
import { detectResidue } from './residue-check.js';
import { SEGMENT_ID_RE, validateBody } from './mt-layers.js';

const require = createRequire(import.meta.url);
const { parseSegmentRecords, occurrenceKey } = require('./seg-markers.cjs');

/** Sends per segment per run. Two untranslated ANSWERS flag a segment (counted across runs). */
export const MAX_ATTEMPTS = 2;

/** The `rule` an accepted re-request records in its layer-1s entry. */
export const REREQUEST_RULE = 'rerequest';

/** Answers at or above this count of `untranslated` make an id flagged, never re-sent. */
const FLAG_AFTER_UNTRANSLATED = 2;

const MODULE_RE = /^m\d+$/;

/**
 * The ids named on the command line.
 * @param {string} value comma-separated `module:type:element` ids
 * @returns {string[]}
 * @throws naming the bad item: an empty list or item, an id that is not three `[\w-]` parts,
 *   a module that is not `m<digits>`, a repeated id
 */
export function parseRerequestIds(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('--rerequest: no ids given');
  }
  const ids = value.split(',').map((s) => s.trim());
  const seen = new Set();
  for (const id of ids) {
    if (id === '') throw new Error(`--rerequest: an empty item in "${value}"`);
    if (!SEGMENT_ID_RE.test(id)) {
      throw new Error(`--rerequest: ${id} is not a module:type:element id of [\\w-] parts`);
    }
    if (!MODULE_RE.test(id.split(':')[0])) {
      throw new Error(`--rerequest: ${id} does not name a module (m<digits>)`);
    }
    if (seen.has(id)) throw new Error(`--rerequest: ${id} is named twice`);
    seen.add(id);
  }
  return ids;
}

/** id → every body it carries, in file order (all occurrences, so a duplicate is seen). */
function bodiesById(text) {
  const map = new Map();
  for (const r of parseSegmentRecords(text)) {
    if (!map.has(r.segmentId)) map.set(r.segmentId, []);
    map.get(r.segmentId).push(r.content);
  }
  return map;
}

/**
 * Which named ids may be re-requested, and the wire text for them.
 *
 * One refusal per id, checked in this order: `not-in-en`, `not-in-is`, `duplicated-id`
 * (more than one occurrence on either side), `already-selected` (layer 1s already holds it),
 * `already-flagged` (two untranslated answers logged), `not-untranslated`.
 *
 * @param {{enText: string, baseText: string, ids: string[], selectedKeys: Set<string>,
 *   untranslatedCounts: Map<string, number>}} args `baseText` is layer 1 with any overlay
 *   applied (`readBase(...).parsed.text`); `selectedKeys` are occurrence keys
 * @returns {{requested: string[], refused: Array<{id: string, why: string}>, wireText: string}}
 *   `requested` in EN order; `wireText` is planTopUp's shape, every segment terminated
 */
export function planRerequest({ enText, baseText, ids, selectedKeys, untranslatedCounts }) {
  const en = bodiesById(enText);
  const base = bodiesById(baseText);
  const refused = [];
  const ok = new Set();
  for (const id of ids) {
    const why = refusalFor(id, { en, base, selectedKeys, untranslatedCounts });
    if (why) refused.push({ id, why });
    else ok.add(id);
  }
  const requested = [...en.keys()].filter((id) => ok.has(id));
  const wireText = requested.map((id) => `<!-- SEG:${id} -->\n${en.get(id)[0]}\n\n`).join('');
  return { requested, refused, wireText };
}

function refusalFor(id, { en, base, selectedKeys, untranslatedCounts }) {
  if (!en.has(id)) return 'not-in-en';
  if (!base.has(id)) return 'not-in-is';
  if (en.get(id).length !== 1 || base.get(id).length !== 1) return 'duplicated-id';
  if (selectedKeys.has(occurrenceKey(id, 0))) return 'already-selected';
  if ((untranslatedCounts.get(id) ?? 0) >= FLAG_AFTER_UNTRANSLATED) return 'already-flagged';
  if (!detectResidue(en.get(id)[0], base.get(id)[0]).exact) return 'not-untranslated';
  return null;
}

/**
 * Classify each requested id in one answer.
 *
 * `untranslated` when the answer is still `detectResidue(...).exact` against the EN;
 * `held` when it is translated but its body is one the layer-1s writer would refuse
 * (`validateBody`), with the problem codes as `reason`, or when it is still mostly English
 * (`detectResidue(...).warn`, reason `mostly-english ratio <r>`); otherwise `translated`.
 * The marker, Greek and reattach checks are the caller's (`rerequestModule`): they need the
 * guarded core's results.
 *
 * @param {{enText: string, responseText: string, ids: string[]}} args `responseText` is the
 *   post-processed answer (on-disk form), as `translateSegmentText` returns it
 * @returns {Array<{segmentId: string, outcome: 'translated'|'untranslated'|'held',
 *   body: string, reason: string|null}>} in `ids` order
 */
export function classifyAttempt({ enText, responseText, ids }) {
  const en = bodiesById(enText);
  const answer = bodiesById(responseText);
  return ids.map((segmentId) => {
    const body = answer.get(segmentId)?.[0];
    if (body === undefined) {
      // The guarded core refuses a response whose id set differs, so this is a caller bug.
      throw new Error(`classifyAttempt: the answer carries no ${segmentId}`);
    }
    const residue = detectResidue(en.get(segmentId)[0], body);
    if (residue.exact) {
      return { segmentId, outcome: 'untranslated', body, reason: null };
    }
    // Still mostly English (the same call's own `warn`: token overlap ≥ its threshold). Not an
    // untranslated answer — it does not count toward the two that flag — but never accepted
    // either: layer 1s is append-only, so a half answer written there could not be replaced.
    if (residue.warn) {
      const reason = `mostly-english ratio ${residue.ratio.toFixed(2)}`;
      return { segmentId, outcome: 'held', body, reason };
    }
    const problems = validateBody(body);
    if (problems.length > 0) {
      return { segmentId, outcome: 'held', body, reason: problems.join(', ') };
    }
    return { segmentId, outcome: 'translated', body, reason: null };
  });
}
