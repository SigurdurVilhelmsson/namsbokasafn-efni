/**
 * gate.js — the code gate every AI edit operation passes before it may touch a segment
 * (design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit C;
 * 10-10 plan §3.3). Pure functions: strings and plain data in, verdicts out. No I/O, and no
 * import from server/.
 *
 * An operation, as the model returns it once the runner has mapped its segment label:
 *   { opId, category: 'term'|'agreement', rulingId, find, replace, reason }
 *
 * gateSegment applies term operations first and agreement operations second, each in input
 * order, each checked against the text AS THE OPERATIONS BEFORE IT LEFT IT. Checks:
 *   - the op is well-formed and its opId unique in the segment;
 *   - the ruling exists, is well-formed, matchable and not held; its scope admits the
 *     chapter and its width is not merely proposed (scope.js);
 *   - the English VISIBLE prose carries one of the ruling's English forms (usesHeadword,
 *     word-bounded; never on raw text, where it fires inside `E[[sub:cell]]`);
 *   - `find` occurs exactly once in the current text, wholly inside one editable span
 *     (tokens.js), starting and ending on a word boundary, overlapping no accepted op;
 *   - no forbidden token in `find` or `replace` (forbiddenTokenReasons);
 *   - size bounds per op and per segment (DEFAULT_LIMITS); `replace` differs from `find`;
 *   - term: `replace` contains the target, `find` does not, and the BARRED words are
 *     unchanged;
 *   - agreement: an accepted term op of the SAME ruling within agreementWindowWords words,
 *     the same word count, every changed word closed-class on both sides or an ending
 *     change on a shared stem, and no BARRED word on either side;
 *   - the marker multiset of the segment is unchanged.
 * Every rejection carries codes from the closed set REJECTION_CODES.
 *
 * gateOccurrences decides a duplicated segment id once for all its occurrences.
 */

import { tokenize, editableSpans, markerMultiset, visibleProse } from './tokens.js';
import { CLOSED_CLASS, BARRED, ELEMENT_SYMBOLS } from './lexicon.js';
import { isChapterDir, scopeReasons } from './scope.js';
import { usesHeadword, stemOf, containsStem, foldUmlaut } from '../lib/chapter-term-check.js';
import { greekLetters } from '../lib/mt-output-guards.js';

/**
 * The size bounds. Anchored on the compiled ruling set of 2026-10-11 (414 targets): the
 * longest target is 53 characters / 6 words (`kenningin um fráhrindingu rafeindapara í
 * gildishvolfi`), and targets by word count run 294 / 89 / 17 / 11 / 2 / 1 for 1…6 words.
 *   maxFind/ReplaceChars 72, maxFind/ReplaceWords 8 — the longest target, an inflectional
 *     ending and one disambiguating context word fit; a rewritten sentence does not.
 *   maxAcceptedOpsPerSegment 6 — two occurrences of a term with up to two forced agreements
 *     each; a longer list reads as a rewrite. Ops past it are refused and logged, not lost.
 *   maxChangedShare 0.5 with changedShareFloorChars 72 — at most half a segment's characters
 *     change (Σ max(|find|, |replace|) over accepted ops), except that changes up to one
 *     op-sized bound are always within share: a key-term or title segment that IS the term
 *     (`Kenning um gildistengi` → `Gildistengjakenning`) must stay fixable.
 *   agreementWindowWords 4 — words strictly between an agreement op and its term op: room
 *     for an article, a demonstrative and an adjective in the noun phrase, or the next
 *     clause's pronoun; the 10-10 plan says "within a few words".
 *   agreementMinStemLetters 3 — an ending change needs a shared stem of at least 3 letters,
 *     because the ending class admits single vowels: `í` → `á` (a preposition swap) shares
 *     no stem and must not pass as an inflection.
 */
export const DEFAULT_LIMITS = Object.freeze({
  maxFindChars: 72,
  maxReplaceChars: 72,
  maxFindWords: 8,
  maxReplaceWords: 8,
  maxAcceptedOpsPerSegment: 6,
  maxChangedShare: 0.5,
  changedShareFloorChars: 72,
  agreementWindowWords: 4,
  agreementMinStemLetters: 3,
});

/** The closed set of rejection codes, sorted. */
export const REJECTION_CODES = Object.freeze([
  'agreement-too-far', // no accepted same-ruling term op within agreementWindowWords
  'agreement-without-term', // no accepted term op of the same ruling in the segment
  'agreement-word-changed', // a changed word is neither closed-class nor an ending change
  'agreement-word-count', // find and replace differ in word count
  'barred-word', // agreement: a negation/number word present; term: their multiset changed
  'duplicate-divergent', // a duplicated id's occurrences disagreed on this op
  'duplicate-op-id', // two ops in one segment share an opId
  'element-symbol', // a word in find/replace equals an element symbol (Er, Og over-refuse)
  'en-headword-absent', // the English visible prose lacks every English form of the ruling
  'find-ambiguous', // find occurs more than once in the current text
  'find-not-editable', // find is not wholly inside one editable span
  'find-not-found', // find does not occur in the current text
  'find-not-word-aligned', // find starts or ends inside a word
  'forbidden-control', // a C0/C1 control character or DEL
  'forbidden-digit', // any number character, sub/superscript digits included
  'forbidden-greek', // a Greek letter or look-alike
  'forbidden-invisible', // soft hyphen, zero-width, bidi or other format character
  'forbidden-markup', // [ ] | & < > { } _ # \ ` and so the legacy {{ }} and __
  'forbidden-operator', // the operator set, ++ and any math symbol
  'forbidden-space', // a non-ASCII space, or a leading, trailing or doubled space
  'inner-capital', // a word with an uppercase letter after its first character
  'marker-multiset-changed', // the operation changed marker syntax
  'no-change', // replace equals find
  'not-nfc', // find or replace is not in Unicode NFC
  'op-invalid', // malformed operation
  'op-too-large', // over a per-op size bound
  'overlaps-accepted-op', // find overlaps a range an accepted op wrote
  'ruling-held', // the ruling's kinds include 'held'
  'ruling-invalid', // the ruling lacks a target, English forms or kinds
  'ruling-unknown', // no ruling with that id
  'ruling-unmatchable', // the ruling is marked matchable:false
  'scope-excluded', // the ruling's scope does not admit this chapter
  'scope-invalid', // the ruling's scope or scopeStatus is malformed
  'scope-unruled', // the ruling's width is only proposed
  'segment-change-share', // over the per-segment share of changed characters
  'segment-malformed', // the segment's markup is malformed; every op is refused
  'segment-op-limit', // over the per-segment count of accepted ops
  'term-target-already', // find already contains the target
  'term-target-missing', // replace does not contain the target
]);

// ── Token classes ─────────────────────────────────────────────────────────────────────

// Beyond the spec's `[ ] |`, `& < >` and legacy `{{ }} __`, single braces and underscores,
// `#`, backslash and backtick are refused too: none belongs in a term or an agreement.
const MARKUP = /[[\]|&<>{}_#\\`]/u;
const NUMBER = /\p{N}/u;
// The spec's operator set, explicitly, plus every Unicode math symbol and a few dot/prime
// operators the spec did not list.
const OPERATOR = /[=+\u2212\u2013×÷±/%‰°⇌→⟶←↔≤≥≈*^~$·⋅′″]|\p{Sm}/u;
const NON_ASCII_SPACE = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/u;
const INVISIBLE = /\p{Cf}/u;
const CONTROL = /\p{Cc}/u;
const LETTER_RUN = /\p{L}[\p{L}\p{M}]*/gu;
const UPPER = /[\p{Lu}\p{Lt}]/u;
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

/**
 * The forbidden-token codes for one `find` or `replace` string (empty when it is clean).
 * @param {string} s
 * @returns {string[]}
 */
export function forbiddenTokenReasons(s) {
  const reasons = new Set();
  if (MARKUP.test(s)) reasons.add('forbidden-markup');
  if (NUMBER.test(s)) reasons.add('forbidden-digit');
  if (greekLetters(s).length > 0) reasons.add('forbidden-greek');
  if (OPERATOR.test(s)) reasons.add('forbidden-operator');
  if (NON_ASCII_SPACE.test(s) || s !== s.trim() || s.includes('  ')) {
    reasons.add('forbidden-space');
  }
  if (INVISIBLE.test(s)) reasons.add('forbidden-invisible');
  if (CONTROL.test(s)) reasons.add('forbidden-control');
  if (s !== s.normalize('NFC')) reasons.add('not-nfc');
  for (const run of s.match(LETTER_RUN) ?? []) {
    const [, ...rest] = [...run];
    if (UPPER.test(rest.join(''))) reasons.add('inner-capital');
    if (ELEMENT_SYMBOLS.has(run)) reasons.add('element-symbol');
  }
  return [...reasons];
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const codePoints = (s) => [...s].length;
const wordCount = (s) => s.split(/\s+/u).filter(Boolean).length;
const isUpper = (ch) => ch !== ch.toLowerCase();
const sameList = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);

/** The spec's ending class, applied to a tail after a/ö folding. */
const ENDING = '[aeiouyáéíóúýöænrsmðj]{0,8}t{0,2}';
const ENDING_RE = new RegExp(`^${ENDING}$`, 'u');
const foldAo = (w) => w.replace(/ö/gu, 'a').replace(/Ö/gu, 'A');

const shortTargetRe = new Map();
/**
 * A target word too short for stemOf (under 4 letters, e.g. `ker`) must END a word,
 * optionally inflected: `hálfker`, `þurrkerjum`, `kerið` pass; `kerfi` (system) and the
 * compound-initial `kerspenna` do not. A substring test would accept `kerfi`.
 */
function shortWordFound(folded, word) {
  let re = shortTargetRe.get(word);
  if (!re) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    re = new RegExp(`${esc}${ENDING}(?![\\p{L}\\p{M}])`, 'u');
    shortTargetRe.set(word, re);
  }
  return re.test(folded);
}

/**
 * Does `text` contain the ruled target? Every word of a multi-word target must be present
 * (stem match on folded text, as chapter-term-check does), not only its longest word.
 */
function hasTarget(text, target) {
  const folded = foldUmlaut(text.toLowerCase());
  const targetWords = target.toLowerCase().split(/\s+/u).filter(Boolean);
  return (
    targetWords.length > 0 &&
    targetWords.every((w) => {
      const stem = stemOf(w);
      return stem ? containsStem(folded, stem) : shortWordFound(folded, foldUmlaut(w));
    })
  );
}

const barredWords = (s) =>
  (s.match(LETTER_RUN) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => BARRED.has(w))
    .sort();

/** Split a whitespace word into leading punctuation, letter core, trailing punctuation. */
function edges(word) {
  const m = /^([^\p{L}]*)(.*?)([^\p{L}\p{M}]*)$/u.exec(word);
  return { pre: m[1], core: m[2], post: m[3] };
}

function isEndingChange(a, b, minStem) {
  const fa = [...foldAo(a)];
  const fb = [...foldAo(b)];
  let p = 0;
  while (p < fa.length && p < fb.length && fa[p] === fb[p]) p++;
  const stemLetters = (fa.slice(0, p).join('').match(/\p{L}/gu) ?? []).length;
  if (stemLetters < minStem) return false;
  return (
    ENDING_RE.test(fa.slice(p).join('').toLowerCase()) &&
    ENDING_RE.test(fb.slice(p).join('').toLowerCase())
  );
}

function wordChangeAllowed(a, b, minStem) {
  const A = edges(a);
  const B = edges(b);
  if (A.pre !== B.pre || A.post !== B.post || !A.core || !B.core) return false;
  if (isUpper(A.core[0]) !== isUpper(B.core[0])) return false;
  if (CLOSED_CLASS.has(A.core.toLowerCase()) && CLOSED_CLASS.has(B.core.toLowerCase())) {
    return true;
  }
  return isEndingChange(A.core, B.core, minStem);
}

function occurrencesOf(text, find) {
  const at = [];
  for (let i = text.indexOf(find); i !== -1; i = text.indexOf(find, i + 1)) at.push(i);
  return at;
}

function wordAligned(text, start, end) {
  const startOk = !WORD_CHAR.test(text[start]) || start === 0 || !WORD_CHAR.test(text[start - 1]);
  const endOk = !WORD_CHAR.test(text[end - 1]) || end === text.length || !WORD_CHAR.test(text[end]);
  return startOk && endOk;
}

/** Words (tokens holding a letter or digit) strictly between two non-overlapping ranges. */
function wordsBetween(text, a, b) {
  const [x, y] = a.start < b.start ? [a, b] : [b, a];
  return text
    .slice(x.end, y.start)
    .split(/\s+/u)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

function rulingIsWellFormed(r) {
  return (
    typeof r.is === 'string' &&
    r.is.trim() !== '' &&
    Array.isArray(r.en) &&
    r.en.length > 0 &&
    r.en.every((f) => typeof f === 'string' && f.trim() !== '') &&
    Array.isArray(r.kinds)
  );
}

function opIsWellFormed(op) {
  return (
    op !== null &&
    typeof op === 'object' &&
    typeof op.opId === 'string' &&
    op.opId !== '' &&
    (op.category === 'term' || op.category === 'agreement') &&
    typeof op.rulingId === 'string' &&
    op.rulingId !== '' &&
    typeof op.find === 'string' &&
    op.find !== '' &&
    typeof op.replace === 'string'
  );
}

function rulingLookup(rulingsById) {
  if (rulingsById instanceof Map) return (id) => rulingsById.get(id);
  return (id) => (Object.hasOwn(rulingsById, id) ? rulingsById[id] : undefined);
}

function resolveLimits(limits) {
  const merged = { ...DEFAULT_LIMITS, ...(limits ?? {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (!(key in DEFAULT_LIMITS)) throw new TypeError(`gate: unknown limit "${key}"`);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`gate: limit "${key}" must be a non-negative number`);
    }
  }
  return merged;
}

function segmentIsMalformed(text) {
  return tokenize(text).problems.length > 0 || text.includes('\n') || /<!--\s*SEG:/u.test(text);
}

// ── One operation ────────────────────────────────────────────────────────────────────────

/**
 * The reasons one operation is refused against the current state; empty means accept.
 * @returns {{ reasons: string[], range?: { start: number, end: number } }}
 */
function checkOp(op, st) {
  const reasons = [];
  const { text, applied, limits } = st;

  // The ruling, its scope, and the English.
  const ruling = st.lookup(op.rulingId);
  const wellFormed = Boolean(ruling) && rulingIsWellFormed(ruling);
  if (!ruling) reasons.push('ruling-unknown');
  else {
    if (!wellFormed) reasons.push('ruling-invalid');
    if (ruling.matchable !== true) reasons.push('ruling-unmatchable');
    if (Array.isArray(ruling.kinds) && ruling.kinds.includes('held')) reasons.push('ruling-held');
    reasons.push(...scopeReasons(ruling, st.chapterDir));
    if (wellFormed && !ruling.en.some((form) => usesHeadword(form, st.enVisible))) {
      reasons.push('en-headword-absent');
    }
  }

  // The strings themselves.
  reasons.push(...forbiddenTokenReasons(op.find), ...forbiddenTokenReasons(op.replace));
  if (
    codePoints(op.find) > limits.maxFindChars ||
    codePoints(op.replace) > limits.maxReplaceChars ||
    wordCount(op.find) > limits.maxFindWords ||
    wordCount(op.replace) > limits.maxReplaceWords
  ) {
    reasons.push('op-too-large');
  }
  if (op.find === op.replace) reasons.push('no-change');

  // Where it lands.
  const at = occurrencesOf(text, op.find);
  let range = null;
  if (at.length === 0) reasons.push('find-not-found');
  else if (at.length > 1) reasons.push('find-ambiguous');
  else {
    range = { start: at[0], end: at[0] + op.find.length };
    const inOneSpan = editableSpans(text).some((s) => range.start >= s.start && range.end <= s.end);
    if (!inOneSpan) reasons.push('find-not-editable');
    if (!wordAligned(text, range.start, range.end)) reasons.push('find-not-word-aligned');
    if (applied.some((a) => range.start < a.end && a.start < range.end)) {
      reasons.push('overlaps-accepted-op');
    }
  }

  // What it may do.
  if (op.category === 'term') {
    if (wellFormed) {
      if (!hasTarget(op.replace, ruling.is)) reasons.push('term-target-missing');
      if (hasTarget(op.find, ruling.is)) reasons.push('term-target-already');
    }
    if (!sameList(barredWords(op.find), barredWords(op.replace))) reasons.push('barred-word');
  } else {
    if (barredWords(op.find).length > 0 || barredWords(op.replace).length > 0) {
      reasons.push('barred-word');
    }
    const fw = op.find.split(' ');
    const rw = op.replace.split(' ');
    if (fw.length !== rw.length) reasons.push('agreement-word-count');
    else if (
      fw.some((w, k) => w !== rw[k] && !wordChangeAllowed(w, rw[k], limits.agreementMinStemLetters))
    ) {
      reasons.push('agreement-word-changed');
    }
    const anchors = applied.filter((a) => a.category === 'term' && a.rulingId === op.rulingId);
    if (anchors.length === 0) reasons.push('agreement-without-term');
    else if (range && !reasons.includes('overlaps-accepted-op')) {
      const nearest = Math.min(...anchors.map((a) => wordsBetween(text, range, a)));
      if (nearest > limits.agreementWindowWords) reasons.push('agreement-too-far');
    }
  }

  if (reasons.length > 0) return { reasons: [...new Set(reasons)] };

  // The marker multiset, on the text the operation would leave.
  const after = text.slice(0, range.start) + op.replace + text.slice(range.end);
  if (
    tokenize(after).problems.length > 0 ||
    !sameList(markerMultiset(text), markerMultiset(after))
  ) {
    return { reasons: ['marker-multiset-changed'] };
  }

  // The per-segment budget.
  if (st.acceptedCount >= limits.maxAcceptedOpsPerSegment) return { reasons: ['segment-op-limit'] };
  const change = Math.max(codePoints(op.find), codePoints(op.replace));
  const allowed = Math.max(limits.changedShareFloorChars, limits.maxChangedShare * st.baseLength);
  if (st.changedChars + change > allowed) return { reasons: ['segment-change-share'] };

  return { reasons: [], range, after, change };
}

// ── Public API ───────────────────────────────────────────────────────────────────────────

/**
 * Gate the operations proposed for one segment occurrence.
 *
 * @param {object} args
 * @param {Array<object>} args.ops operations as the model returned them
 * @param {string} args.en the English segment body
 * @param {string} args.is the Icelandic segment body the operations edit
 * @param {string} args.chapterDir `chNN` or `appendices`
 * @param {Map<string, object>|Record<string, object>} args.rulingsById Unit B's rulings
 * @param {Partial<typeof DEFAULT_LIMITS>} [args.limits] overrides; an unknown key throws
 * @returns {{ accepted: object[], rejected: Array<{ op: object, reasons: string[] }>, after: string }}
 *   `accepted` in the order applied (term ops, then agreement ops); `rejected` in input
 *   order; `after` is `is` with every accepted operation applied.
 * @throws {TypeError} on malformed arguments — a caller bug fails the run, not one item.
 */
export function gateSegment({ ops, en, is, chapterDir, rulingsById, limits } = {}) {
  if (!Array.isArray(ops)) throw new TypeError('gateSegment: ops must be an array');
  if (typeof en !== 'string') throw new TypeError('gateSegment: en must be a string');
  if (typeof is !== 'string') throw new TypeError('gateSegment: is must be a string');
  if (!isChapterDir(chapterDir)) {
    throw new TypeError(`gateSegment: chapterDir must be chNN or appendices, got ${chapterDir}`);
  }
  if (!(rulingsById instanceof Map) && (rulingsById === null || typeof rulingsById !== 'object')) {
    throw new TypeError('gateSegment: rulingsById must be a Map or an object');
  }
  const resolved = resolveLimits(limits);

  const verdicts = new Map(); // input index → reasons
  const entries = ops.map((op, i) => ({ op, i }));
  const wellFormed = entries.filter((e) => {
    if (opIsWellFormed(e.op)) return true;
    verdicts.set(e.i, ['op-invalid']);
    return false;
  });
  const idCount = new Map();
  for (const e of wellFormed) idCount.set(e.op.opId, (idCount.get(e.op.opId) ?? 0) + 1);
  const live = wellFormed.filter((e) => {
    if (idCount.get(e.op.opId) === 1) return true;
    verdicts.set(e.i, ['duplicate-op-id']);
    return false;
  });

  const accepted = [];
  let text = is;
  if (segmentIsMalformed(is) || segmentIsMalformed(en)) {
    for (const e of live) verdicts.set(e.i, ['segment-malformed']);
  } else {
    const st = {
      text,
      applied: [],
      limits: resolved,
      lookup: rulingLookup(rulingsById),
      chapterDir,
      enVisible: visibleProse(en),
      acceptedCount: 0,
      changedChars: 0,
      baseLength: codePoints(is),
    };
    const order = [
      ...live.filter((e) => e.op.category === 'term'),
      ...live.filter((e) => e.op.category === 'agreement'),
    ];
    for (const e of order) {
      const verdict = checkOp(e.op, st);
      if (verdict.reasons.length > 0) {
        verdicts.set(e.i, verdict.reasons);
        continue;
      }
      // Apply: ranges after the edit shift by the length delta (none overlap, by the check).
      const delta = e.op.replace.length - e.op.find.length;
      for (const a of st.applied) {
        if (a.start >= verdict.range.end) {
          a.start += delta;
          a.end += delta;
        }
      }
      st.applied.push({
        start: verdict.range.start,
        end: verdict.range.start + e.op.replace.length,
        category: e.op.category,
        rulingId: e.op.rulingId,
      });
      st.text = verdict.after;
      st.acceptedCount += 1;
      st.changedChars += verdict.change;
      accepted.push(e.op);
    }
    text = st.text;
  }

  const rejected = [...verdicts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, reasons]) => ({ op: ops[i], reasons }));
  return { accepted, rejected, after: text };
}

/**
 * Gate the operations for EVERY occurrence of a duplicated segment id, and accept an
 * operation only if it is accepted in all of them. An op accepted in some occurrences and
 * not others is rejected in every occurrence with `duplicate-divergent` first (followed by
 * that occurrence's own reasons, if it had any). An op rejected in every occurrence keeps
 * its own reasons — it did not diverge.
 *
 * Dropping a divergent op changes the text the others see (an agreement op may have been
 * accepted only beside it), so every occurrence is re-gated without it, to a fixpoint. At
 * the end each occurrence has been gated against the same surviving op set, and every
 * surviving op is accepted in all occurrences or in none.
 *
 * @param {object} args as gateSegment, except:
 * @param {string[]} args.isOccurrences the Icelandic body of each occurrence, in file order
 * @param {string|string[]} args.en one English body, or one per occurrence (EN occurrences
 *   can differ in MATH numbering)
 * @returns {{ accepted: object[], occurrences: Array<ReturnType<typeof gateSegment>> }}
 */
export function gateOccurrences({ ops, en, isOccurrences, chapterDir, rulingsById, limits } = {}) {
  if (!Array.isArray(isOccurrences) || isOccurrences.length === 0) {
    throw new TypeError('gateOccurrences: isOccurrences must be a non-empty array');
  }
  if (!Array.isArray(ops)) throw new TypeError('gateOccurrences: ops must be an array');
  const ens = Array.isArray(en) ? en : isOccurrences.map(() => en);
  if (ens.length !== isOccurrences.length) {
    throw new TypeError('gateOccurrences: en must be a string or one per occurrence');
  }
  const run = (live) =>
    isOccurrences.map((is, k) =>
      gateSegment({ ops: live, en: ens[k], is, chapterDir, rulingsById, limits })
    );

  if (isOccurrences.length === 1) {
    const [only] = run(ops);
    return { accepted: only.accepted, occurrences: [only] };
  }

  const divergent = new Map(); // op → reasons per occurrence
  let live = ops.slice();
  for (;;) {
    const results = run(live);
    const acceptedSets = results.map((r) => new Set(r.accepted));
    const diverging = live.filter((op) => {
      const n = acceptedSets.filter((s) => s.has(op)).length;
      return n > 0 && n < results.length;
    });
    if (diverging.length === 0) {
      const occurrences = results.map((r, k) => ({
        accepted: r.accepted,
        rejected: ops.flatMap((op) => {
          if (acceptedSets[k].has(op)) return [];
          if (divergent.has(op)) return [{ op, reasons: divergent.get(op)[k] }];
          const hit = r.rejected.find((x) => x.op === op);
          return hit ? [hit] : [];
        }),
        after: r.after,
      }));
      return { accepted: results[0].accepted, occurrences };
    }
    for (const op of diverging) {
      divergent.set(
        op,
        results.map((r) => {
          const hit = r.rejected.find((x) => x.op === op);
          return ['duplicate-divergent', ...(hit ? hit.reasons : [])];
        })
      );
    }
    live = live.filter((op) => !divergent.has(op));
  }
}
