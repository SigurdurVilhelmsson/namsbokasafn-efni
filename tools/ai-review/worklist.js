/**
 * worklist.js — which segments the AI layer's term pass offers to the model, and with which
 * rulings (design: docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md, Unit U1).
 * Pure: parses and plain data in, a plain, deterministic work list out. No I/O, no clock, and
 * no import from server/.
 *
 * Inputs are parses from tools/lib/mt-layers.js: the English (`02-for-mt/<chdir>/<stem>-
 * segments.en.md` through `parseLayerFile`) and the Icelandic base (`readBase(…).parsed`).
 *
 * The steps, per unit:
 *   1. pairUnit — pair EN and IS by OCCURRENCE KEY (`segmentId`, then `segmentId#k`), never by
 *      id alone: a duplicated id's occurrences can differ (`[[MATH:20]]` / `[[MATH:21]]` in
 *      m68727). An IS body equal to its EN body is skipped (`identical-to-en`): editing it would
 *      be translating it, which only the MT API may do.
 *   2. For each kept segment, the rulings that are a CANDIDATE for at least one of its
 *      occurrences (isCandidate), and — only when there is one — every eligible ruling that
 *      matches it, satisfied ones included, as context (offeredRulings). A segment with no
 *      candidate is dropped and counted.
 *
 * The selection is deliberately over-inclusive (a sensed ruling is always a candidate, the
 * competitor test is the gate's LOOSE matcher): the model and the gate narrow it.
 */

import { visibleProse } from './tokens.js';
import { inScope, isChapterDir } from './scope.js';
import { carriesTarget, containsTargetStem } from './gate.js';
import { usesHeadword } from '../lib/chapter-term-check.js';

/** Why an occurrence is not offered. Closed, sorted. */
export const SKIP_REASONS = Object.freeze(['identical-to-en', 'no-en', 'no-is']);

/** Code-unit order: the same on every machine (localeCompare depends on the ICU locale). */
const byCodeUnit = (a, b) => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

const isParse = (v) => v !== null && typeof v === 'object' && Array.isArray(v.records);

function assertChapterDir(chapterDir) {
  if (!isChapterDir(chapterDir)) {
    throw new Error(
      `worklist: chapterDir must be chNN or appendices, got ${JSON.stringify(chapterDir)}`
    );
  }
}

/** A fresh skip tally: every reason present at 0, then `skippedKeys`. */
const emptySkipped = () => ({
  ...Object.fromEntries(SKIP_REASONS.map((r) => [r, 0])),
  skippedKeys: [],
});

/**
 * @typedef {{ occurrence: number, key: string, en: string, is: string }} Occurrence
 * @typedef {{ segmentId: string, occurrences: Occurrence[] }} PairedItem
 * @typedef {{ 'identical-to-en': number, 'no-en': number, 'no-is': number,
 *   skippedKeys: Array<{ key: string, reason: string }> }} Skipped
 */

/**
 * Pair one unit's English and Icelandic by occurrence key.
 *
 * `items` holds one entry per segment id that kept at least one occurrence, ordered by that
 * id's FIRST occurrence in the IS file (whether or not that occurrence was kept); each item's
 * occurrences ascend. `skippedKeys` lists the IS file's skipped occurrences in its order
 * (`no-en`, `identical-to-en`), then the EN occurrences with no IS partner in the EN file's
 * order (`no-is`). Bodies are compared byte for byte, unnormalised.
 *
 * @param {{ en: import('../lib/mt-layers.js').ParsedLayer,
 *   is: import('../lib/mt-layers.js').ParsedLayer }} args
 * @returns {{ items: PairedItem[], skipped: Skipped }}
 */
export function pairUnit({ en, is } = {}) {
  if (!isParse(en) || !isParse(is)) {
    throw new Error('worklist: pairUnit needs en and is as ParsedLayer (parseLayerFile/readBase)');
  }
  const enByKey = new Map(en.records.map((r) => [r.key, r.body]));
  const isKeys = new Set(is.records.map((r) => r.key));
  const skipped = emptySkipped();
  const skip = (key, reason) => {
    skipped[reason] += 1;
    skipped.skippedKeys.push({ key, reason });
  };

  const order = []; // segment ids, by first occurrence in the IS file
  const kept = new Map(); // segmentId → Occurrence[]
  for (const r of is.records) {
    if (!kept.has(r.segmentId)) {
      kept.set(r.segmentId, []);
      order.push(r.segmentId);
    }
    if (!enByKey.has(r.key)) skip(r.key, 'no-en');
    else if (enByKey.get(r.key) === r.body) skip(r.key, 'identical-to-en');
    else {
      kept.get(r.segmentId).push({
        occurrence: r.occurrence,
        key: r.key,
        en: enByKey.get(r.key),
        is: r.body,
      });
    }
  }
  for (const r of en.records) if (!isKeys.has(r.key)) skip(r.key, 'no-is');

  const items = order
    .filter((id) => kept.get(id).length > 0)
    .map((id) => ({
      segmentId: id,
      occurrences: [...kept.get(id)].sort((a, b) => a.occurrence - b.occurrence),
    }));
  return { items, skipped };
}

/**
 * May `ruling` act in `chapterDir` at all? `matchable === true`, not `held`, its scope admits
 * the chapter, its width is not merely proposed, and it has no sense or a ruled one. Fails
 * closed on anything malformed.
 * @param {object} ruling a ruling as Unit B compiles it
 * @param {string} chapterDir
 * @returns {boolean}
 */
export function isEligible(ruling, chapterDir) {
  return (
    ruling?.matchable === true &&
    Array.isArray(ruling.kinds) &&
    !ruling.kinds.includes('held') &&
    inScope(ruling.scope, chapterDir) &&
    ruling.scopeStatus !== 'proposed' &&
    (ruling.sense === null || ruling.sense?.status === 'ruled')
  );
}

/** Does `ruling` match English visible prose `prose`? Some form used as a word. */
const matchesProse = (ruling, prose) =>
  Array.isArray(ruling?.en) && ruling.en.some((form) => usesHeadword(form, prose));

/**
 * Does some English form of `ruling` occur, as a word, in what a reader sees of `occ.en`
 * (tokens.js visibleProse: not inside `E[[sub:cell]]`, an id or a URL)?
 * @param {object} ruling
 * @param {{ en: string }} occ
 * @returns {boolean}
 */
export function matchesOccurrence(ruling, occ) {
  return matchesProse(ruling, visibleProse(occ.en));
}

/**
 * Is a matching ruling a candidate for an occurrence's Icelandic? It has a sense (the model must
 * judge it), or the IS does not carry the target (gate.js carriesTarget, strict), or the IS holds
 * a competitor (gate.js containsTargetStem, loose). Assumes eligibility and a match.
 */
const needsReview = (ruling, isText) =>
  ruling.sense !== null ||
  !carriesTarget(isText, ruling.is) ||
  ruling.competitors.some((c) => containsTargetStem(isText, c));

/**
 * Is `ruling` a candidate for `occ` in `chapterDir`: eligible, matching, and in need of review
 * (sensed, target not carried, or a competitor present)?
 * @param {object} ruling
 * @param {{ en: string, is: string }} occ
 * @param {string} chapterDir
 * @returns {boolean}
 */
export function isCandidate(ruling, occ, chapterDir) {
  return (
    isEligible(ruling, chapterDir) && matchesOccurrence(ruling, occ) && needsReview(ruling, occ.is)
  );
}

/**
 * The offer for one item, over rulings ALREADY known eligible. Each occurrence's visible prose
 * is computed once. Returns sorted id lists and how many occurrences have a candidate.
 */
function offerFor(item, eligible) {
  const candidates = new Set();
  const matching = new Set();
  let candidateOccurrences = 0;
  for (const occ of item.occurrences) {
    const prose = visibleProse(occ.en);
    let any = false;
    for (const ruling of eligible) {
      if (!matchesProse(ruling, prose)) continue;
      matching.add(ruling.id);
      if (needsReview(ruling, occ.is)) {
        candidates.add(ruling.id);
        any = true;
      }
    }
    if (any) candidateOccurrences += 1;
  }
  if (candidates.size === 0) return { candidateIds: [], rulingIds: [], candidateOccurrences: 0 };
  return {
    candidateIds: [...candidates].sort(byCodeUnit),
    rulingIds: [...matching].sort(byCodeUnit),
    candidateOccurrences,
  };
}

/**
 * The rulings offered for one item. `candidateIds`: rulings that are a candidate for at least
 * one occurrence. `rulingIds`: every eligible ruling matching at least one occurrence, satisfied
 * ones included, so the model sees a longer ruling that already holds (`fuel cell → efnarafall`)
 * before it touches a shorter one — but only when `candidateIds` is non-empty; otherwise both
 * are empty. Both sorted.
 * @param {{ item: PairedItem, rulings: ReadonlyArray<object>, chapterDir: string }} args
 * @returns {{ candidateIds: string[], rulingIds: string[] }}
 */
export function offeredRulings({ item, rulings, chapterDir } = {}) {
  assertChapterDir(chapterDir);
  const { candidateIds, rulingIds } = offerFor(
    item,
    rulings.filter((r) => isEligible(r, chapterDir))
  );
  return { candidateIds, rulingIds };
}

/**
 * The work list for one chapter. Units keep their input order; within a unit, items keep
 * pairUnit's order, and an item with no candidate is dropped (`noCandidate`).
 *
 * `counts`:
 *   units                 — units in the chapter;
 *   occurrences           — EVERY IS occurrence read, skipped ones included;
 *   items                 — items kept (with at least one candidate);
 *   candidateOccurrences  — occurrences of kept items that have a candidate ruling;
 *   pairs                 — Σ candidateIds.length over kept items;
 *   skipped               — per SKIP_REASONS, summed over units;
 *   noCandidate           — paired items dropped for want of a candidate.
 *
 * @param {{ chapterDir: string,
 *   units: Array<{ stem: string, en: import('../lib/mt-layers.js').ParsedLayer,
 *     is: import('../lib/mt-layers.js').ParsedLayer }>,
 *   rulings: ReadonlyArray<object> }} args
 */
export function buildWorkList({ chapterDir, units, rulings } = {}) {
  assertChapterDir(chapterDir);
  if (!Array.isArray(units)) throw new Error('worklist: units must be an array');
  if (!Array.isArray(rulings)) throw new Error('worklist: rulings must be an array');
  const eligible = rulings.filter((r) => isEligible(r, chapterDir));
  const counts = {
    units: units.length,
    occurrences: 0,
    items: 0,
    candidateOccurrences: 0,
    pairs: 0,
    skipped: Object.fromEntries(SKIP_REASONS.map((r) => [r, 0])),
    noCandidate: 0,
  };

  const built = units.map((unit) => {
    if (typeof unit?.stem !== 'string' || unit.stem === '') {
      throw new Error('worklist: every unit needs a stem');
    }
    const { items: paired, skipped } = pairUnit({ en: unit.en, is: unit.is });
    counts.occurrences += unit.is.records.length;
    for (const r of SKIP_REASONS) counts.skipped[r] += skipped[r];
    const items = [];
    for (const item of paired) {
      const offer = offerFor(item, eligible);
      if (offer.candidateIds.length === 0) {
        counts.noCandidate += 1;
        continue;
      }
      counts.items += 1;
      counts.candidateOccurrences += offer.candidateOccurrences;
      counts.pairs += offer.candidateIds.length;
      items.push({
        segmentId: item.segmentId,
        occurrences: item.occurrences,
        candidateIds: offer.candidateIds,
        rulingIds: offer.rulingIds,
      });
    }
    return { stem: unit.stem, items, skipped };
  });

  return { chapterDir, units: built, counts };
}
