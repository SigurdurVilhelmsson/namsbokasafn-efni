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
 *      m68727). An empty IS body (`empty-is`) and an IS body equal to its EN body
 *      (`identical-to-en`) are skipped: editing either would be translating it, which only the MT
 *      API may do.
 *   2. For each kept segment, the rulings that are a CANDIDATE for at least one of its
 *      occurrences (isCandidate), and — only when there is one — every eligible ruling that
 *      matches it, satisfied ones included, as context (offeredRulings). A segment with no
 *      candidate is dropped and counted.
 *
 * The selection is deliberately over-inclusive (a sensed ruling is always a candidate, the
 * competitor test is the gate's LOOSE matcher): the model and the gate narrow it. Two rules make it
 * precise where over-inclusion would mislead rather than merely cost:
 *   - PHRASE PRECEDENCE: a ruling matches only where some English use of it lies outside every use
 *     of a LONGER ruling's phrase (`cell` inside `fuel cell`). A longer phrase is a different term,
 *     and offering the shorter ruling there invites a coined compound the gate cannot refuse
 *     (measured: `vetnisefnarafala` → `vetniseldsneytiskeri`, and `Vetnisrafalar` → `Vetnisker`).
 *     Every ruling given shadows, whatever its status, so this can only withhold, never offer.
 *   - MASKED COMPETITORS: the competitor test runs on the Icelandic with every word headed by the
 *     target blanked out, because 14 competitors' stems sit inside their own target
 *     (`hiti` in `hitastig`) and would otherwise flag every segment that is already right.
 */

import { visibleProse } from './tokens.js';
import { isChapterDir, scopeReasons } from './scope.js';
import { carriesTarget, containsTargetStem } from './gate.js';
import { usesHeadword, headwordSpans } from '../lib/chapter-term-check.js';
import { STEM_RE } from '../lib/mt-layers.js';

/** Why an occurrence is not offered. Closed, sorted. */
export const SKIP_REASONS = Object.freeze(['empty-is', 'identical-to-en', 'no-en', 'no-is']);

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
 * @typedef {{ 'empty-is': number, 'identical-to-en': number, 'no-en': number, 'no-is': number,
 *   skippedKeys: Array<{ key: string, reason: string }> }} Skipped
 */

/**
 * Pair one unit's English and Icelandic by occurrence key.
 *
 * `items` holds one entry per segment id that kept at least one occurrence, ordered by that
 * id's FIRST occurrence in the IS file (whether or not that occurrence was kept); each item's
 * occurrences ascend. `skippedKeys` lists the IS file's skipped occurrences in its order
 * (`no-en`, `empty-is`, `identical-to-en`), then the EN occurrences with no IS partner in the EN file's
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
    else if (r.body === '') skip(r.key, 'empty-is');
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

const isNonBlank = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * The gate's well-formedness test for a ruling (gate.js rulingIsWellFormed and
 * senseIsWellFormed, which it does not export): a target, English forms, kinds, and a sense
 * that is null or carries an id, otherSenses and a status. A ruling failing it is refused
 * `ruling-invalid` on every op, so offering it would only spend a request.
 */
const isWellFormed = (r) =>
  isNonBlank(r.is) &&
  Array.isArray(r.en) &&
  r.en.length > 0 &&
  r.en.every(isNonBlank) &&
  Array.isArray(r.kinds) &&
  (r.sense === null ||
    (typeof r.sense === 'object' &&
      isNonBlank(r.sense.id) &&
      Array.isArray(r.sense.otherSenses) &&
      typeof r.sense.status === 'string'));

/**
 * May `ruling` act in `chapterDir` at all? It is well formed as the gate judges it,
 * `matchable === true`, not `held`, the gate's scope check passes (scope.js scopeReasons:
 * a valid scope and scopeStatus, not merely proposed, admitting the chapter), and it has no
 * sense or a ruled one. Anything the gate would refuse on every op is ineligible, so a ruling
 * that bypassed Unit B's loader cannot reach the model either. Throws on a malformed
 * `chapterDir`, which would otherwise read as "eligible nowhere".
 * @param {object} ruling a ruling as Unit B compiles it
 * @param {string} chapterDir
 * @returns {boolean}
 */
export function isEligible(ruling, chapterDir) {
  assertChapterDir(chapterDir);
  return (
    ruling !== null &&
    typeof ruling === 'object' &&
    isWellFormed(ruling) &&
    ruling.matchable === true &&
    !ruling.kinds.includes('held') &&
    scopeReasons(ruling, chapterDir).length === 0 &&
    (ruling.sense === null || ruling.sense.status === 'ruled')
  );
}

const formsOf = (r) =>
  Array.isArray(r?.en) ? r.en.filter((f) => typeof f === 'string' && f.trim() !== '') : [];

/**
 * The forms of OTHER rulings in `pool` that are longer phrases containing one of `ruling`'s
 * forms as a whole word (`fuel cell` for `cell`). Longer means more characters, so a form equal
 * up to case never counts. A ruling never shadows itself: `cell notation (schematic)` must not
 * hide the same ruling's own long form.
 * @param {object} ruling
 * @param {ReadonlyArray<object>} pool
 * @returns {string[]}
 */
function longerPhrases(ruling, pool) {
  const mine = formsOf(ruling);
  const out = new Set();
  for (const other of pool) {
    if (other === ruling || other?.id === ruling.id) continue;
    for (const fL of formsOf(other)) {
      const contains = mine.some((fR) => [...fL].length > [...fR].length && usesHeadword(fR, fL));
      if (contains) out.add(fL);
    }
  }
  return [...out].sort(byCodeUnit);
}

/**
 * Does `ruling` match English visible prose `prose`? Some form used as a word, at a place no
 * `longer` phrase covers.
 */
const matchesProse = (ruling, prose, longer = []) => {
  const forms = formsOf(ruling);
  if (longer.length === 0) return forms.some((form) => usesHeadword(form, prose));
  const covers = longer.flatMap((fL) => headwordSpans(fL, prose));
  return forms.some((form) =>
    headwordSpans(form, prose).some(([s, e]) => !covers.some(([cs, ce]) => cs <= s && e <= ce))
  );
};

/**
 * Does some English form of `ruling` occur, as a word, in what a reader sees of `occ.en`
 * (tokens.js visibleProse: not inside `E[[sub:cell]]`, an id or a URL), outside the phrase of
 * every longer ruling in `pool` (phrase precedence; with no pool, matching is plain)?
 * @param {object} ruling
 * @param {{ en: string }} occ
 * @param {ReadonlyArray<object>} [pool] every ruling, for phrase precedence
 * @returns {boolean}
 */
export function matchesOccurrence(ruling, occ, pool = []) {
  return matchesProse(ruling, visibleProse(occ.en), longerPhrases(ruling, pool));
}

/** A word: letters (and their marks), hyphen-joined parts included — gate.js's WORD_RUN. */
const WORD_RUN = /\p{L}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*)*/gu;

/** `text` with every word headed by a word of `target` (gate.js carriesTarget) blanked. */
function maskTargetWords(text, target) {
  const words = String(target).split(/\s+/u).filter(Boolean);
  return text.replace(WORD_RUN, (w) =>
    words.some((tw) => carriesTarget(w, tw)) ? ' '.repeat(w.length) : w
  );
}

/**
 * Is a matching ruling a candidate for an occurrence's Icelandic? It has a sense (the model must
 * judge it), or the IS does not carry the target (gate.js carriesTarget, strict), or the IS holds
 * a competitor (gate.js containsTargetStem, loose) OUTSIDE the words that carry the target.
 * Assumes eligibility and a match.
 */
const needsReview = (ruling, isText) => {
  if (ruling.sense !== null || !carriesTarget(isText, ruling.is)) return true;
  if (ruling.competitors.length === 0) return false;
  const rest = maskTargetWords(isText, ruling.is);
  return ruling.competitors.some((c) => containsTargetStem(rest, c));
};

/**
 * Is `ruling` a candidate for `occ` in `chapterDir`: eligible, matching (with phrase precedence
 * over `pool`), and in need of review (sensed, target not carried, or a competitor present outside
 * the target's words)? Throws on a malformed `chapterDir`.
 * @param {object} ruling
 * @param {{ en: string, is: string }} occ
 * @param {string} chapterDir
 * @param {ReadonlyArray<object>} [pool] every ruling, for phrase precedence
 * @returns {boolean}
 */
export function isCandidate(ruling, occ, chapterDir, pool = []) {
  return (
    isEligible(ruling, chapterDir) &&
    matchesOccurrence(ruling, occ, pool) &&
    needsReview(ruling, occ.is)
  );
}

/**
 * The offer for one item, over rulings ALREADY known eligible. Each occurrence's visible prose
 * is computed once. Returns sorted id lists and how many occurrences have a candidate.
 */
function offerFor(item, eligible, longerById) {
  const candidates = new Set();
  const matching = new Set();
  let candidateOccurrences = 0;
  for (const occ of item.occurrences) {
    const prose = visibleProse(occ.en);
    let any = false;
    for (const ruling of eligible) {
      if (!matchesProse(ruling, prose, longerById.get(ruling.id))) continue;
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

/** Each eligible ruling's longer phrases, over the whole pool (phrase precedence). */
const longerTable = (eligible, pool) =>
  new Map(eligible.map((r) => [r.id, longerPhrases(r, pool)]));

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
  const eligible = rulings.filter((r) => isEligible(r, chapterDir));
  const { candidateIds, rulingIds } = offerFor(item, eligible, longerTable(eligible, rulings));
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
  const longerById = longerTable(eligible, rulings);
  const counts = {
    units: units.length,
    occurrences: 0,
    items: 0,
    candidateOccurrences: 0,
    pairs: 0,
    skipped: Object.fromEntries(SKIP_REASONS.map((r) => [r, 0])),
    noCandidate: 0,
  };

  // Stems key the requests and the records downstream (`<chapterDir>/<stem>/…`), so a stem
  // must be a unit stem and must not repeat.
  const stems = new Set();
  for (const unit of units) {
    if (typeof unit?.stem !== 'string' || !STEM_RE.test(unit.stem)) {
      throw new Error(`worklist: every unit needs a unit stem, got ${JSON.stringify(unit?.stem)}`);
    }
    if (stems.has(unit.stem)) throw new Error(`worklist: stem ${unit.stem} is repeated`);
    stems.add(unit.stem);
  }

  const built = units.map((unit) => {
    const { items: paired, skipped } = pairUnit({ en: unit.en, is: unit.is });
    counts.occurrences += unit.is.records.length;
    for (const r of SKIP_REASONS) counts.skipped[r] += skipped[r];
    const items = [];
    for (const item of paired) {
      const offer = offerFor(item, eligible, longerById);
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
