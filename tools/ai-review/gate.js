/**
 * gate.js — the code gate every AI edit operation passes before it may touch a segment
 * (design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit C;
 * 10-10 plan §3.3). Pure functions: strings and plain data in, verdicts out. No I/O, and no
 * import from server/.
 *
 * An operation, as the model returns it once the runner has mapped its segment label:
 *   { opId, category: 'term'|'term-sense'|'agreement', rulingId, sense?, find, replace, reason }
 * `sense` is the sense the model judged, and only a 'term-sense' op carries one (others leave
 * it undefined or null). A 'term-sense' op is a term op on a ruling restricted to one sense of
 * a homograph (Unit B's `sense`); it is its own category so the blind check can keep or drop
 * these edits on their own (10-10 plan 3.4).
 *
 * gateSegment applies term and term-sense operations first and agreement operations second,
 * each in input order, each checked against the text AS THE OPERATIONS BEFORE IT LEFT IT.
 * Checks:
 *   - the op is well-formed and its opId unique in the segment;
 *   - the ruling exists, is well-formed, matchable and not held; its scope admits the
 *     chapter and its width is not merely proposed (scope.js);
 *   - sense: a ruling with a sense takes edits only as 'term-sense' ops that declare its own
 *     sense id, and only once that sense is ruled; a 'term-sense' op on a ruling without one
 *     is refused. The gate checks the DECLARATION, never the judgement — whether the context
 *     really is that sense is the model's call, measured by the blind check;
 *   - the English VISIBLE prose carries one of the ruling's English forms (usesHeadword,
 *     word-bounded; never on raw text, where it fires inside `E[[sub:cell]]`), both sides
 *     hyphen-folded (tokens.js foldHyphens) as the work list matches them, so `fuel cell` is
 *     found in `Fuel-cell` and `electron-pair geometry` in "electron pair geometry";
 *   - `find` occurs exactly once in the current text, wholly inside one editable span
 *     (tokens.js), starting and ending on a word boundary AS A READER SEES IT (a label flush
 *     against a word continues it: tokens.js isWordAligned), overlapping no accepted op;
 *   - no forbidden token in `find` or `replace` (forbiddenTokenReasons);
 *   - size bounds per op and per segment (DEFAULT_LIMITS); `replace` differs from `find`;
 *   - term and term-sense: `replace` carries the target as the HEAD of a word (carriesTarget: `anóða` does
 *     not carry `nóða`), `find` does not already contain its stem (containsTargetStem), and
 *     the BARRED words are unchanged;
 *   - term and term-sense, no wider than the target (term-op-too-wide): split find and
 *     replace on whitespace, strip their longest common leading run of identical words and
 *     then their longest common trailing run (the two never overlap); what remains of
 *     replace may hold at most as many words as the ruling's target. The agreement rules
 *     bind only ops LABELLED agreement, so an agreement or a style swap folded into a term
 *     op (`Hvor kolefnisfrumeind er einnig eintengd` → `Hvort kolefnisatóm er einnig
 *     eintengt`) would land unchecked. What remains of find is NOT constrained beyond the
 *     size bounds, so a compound collapse (`Kenning um gildistengi` → `Gildistengjakenning`)
 *     stays fixable;
 *   - term and term-sense, no gendered quantifier beside the term (quantifier-agreement):
 *     neither of the last two whitespace tokens of the current text before find (a part word
 *     glued to find, `O-` in `tvær O-frumeindir`, is one), nor any word of the two common
 *     runs, may be a GENDERED_QUANTIFIER (lexicon.js) once its edge punctuation is stripped
 *     and it is lowercased. Such a word is BARRED, so no agreement op can make it follow the
 *     noun's new gender, and `tvær O-frumeindir` → `tvær O-atóm` would land. ⚠️ OVER-REFUSES
 *     by design: the gate knows no genders, so it also fires where the target's gender equals
 *     the replaced word's (`enginn straumur` → `enginn rafstraumur`, both masculine). ⚠️ Does
 *     NOT see a quantifier inside a marker token (`[[link:tvær`: the core keeps `link:`) nor a
 *     word outside the list (lexicon.js says which are left out);
 *   - agreement: an accepted term or term-sense op of the SAME ruling within
 *     agreementWindowWords words,
 *     the same word count, every changed word closed-class on both sides or an ending
 *     change on a shared stem, and no BARRED word on either side;
 *   - the marker multiset of the segment is unchanged.
 * Every rejection carries codes from the closed set REJECTION_CODES.
 *
 * gateOccurrences decides a duplicated segment id once for all its occurrences.
 */

import {
  tokenize,
  editableSpans,
  markerMultiset,
  visibleProse,
  isWordAligned,
  foldHyphens,
} from './tokens.js';
import {
  CLOSED_CLASS,
  BARRED,
  ELEMENT_SYMBOLS,
  NEGATING_PREFIXES,
  isGenderedQuantifier,
} from './lexicon.js';
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
  'forbidden-invisible', // a format or default-ignorable character, or a blank (U+2800)
  'forbidden-markup', // [ ] | & < > { } _ # \ ` and so the legacy {{ }} and __
  'forbidden-operator', // the operator set, ++ and any math symbol
  'forbidden-script', // a letter outside the Latin script, or a combining mark
  'forbidden-space', // a non-ASCII space, or a leading, trailing or doubled space
  'inner-capital', // a word with an uppercase letter after its first character
  'marker-multiset-changed', // the operation changed marker syntax
  'no-change', // replace equals find
  'not-nfc', // find or replace is not in Unicode NFC
  'op-invalid', // malformed operation
  'op-too-large', // over a per-op size bound
  'overlaps-accepted-op', // find overlaps a range an accepted op wrote
  'quantifier-agreement', // term: a gendered quantifier just before find or kept in the op
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
  'sense-mismatch', // a term-sense op declared a sense other than the ruling's own
  'sense-not-applicable', // a term-sense op on a ruling that has no sense
  'sense-undeclared', // a term op on a ruling restricted to one sense (use term-sense)
  'sense-unruled', // the ruling's sense is only proposed
  'term-op-too-wide', // term: replace changes more words than the ruling's target has
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
// Every format character (soft hyphen, zero-width, bidi, BOM), every default-ignorable code
// point outside Cf (variation selectors, the combining grapheme joiner, the Hangul fillers),
// and the braille blank, which renders as nothing and is neither.
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]/u;
const CONTROL = /\p{Cc}/u;
// Icelandic is written in the Latin script, and NFC Icelandic needs no combining mark, so a
// letter of another script (a Cyrillic \u0430 is a homoglyph of a) or a leftover mark is refused.
const NON_LATIN = /[^\P{L}\p{Script=Latin}]|\p{M}/u;
const LETTER_RUN = /\p{L}[\p{L}\p{M}]*/gu;
const UPPER = /[\p{Lu}\p{Lt}]/u;

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
  if (NON_LATIN.test(s)) reasons.add('forbidden-script');
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
 * LOOSE: does `text` contain the ruled target's stem anywhere? Every word of a multi-word
 * target must be present (stem match on folded text, as chapter-term-check does), not only
 * its longest word. A 4+ letter stem may sit anywhere, prefixes and modifiers included, so
 * `anóða` contains `nóða`. Used only where a looser match REFUSES more: "find already holds
 * the target" (term-target-already).
 */
export function containsTargetStem(text, target) {
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

/** A word: letters (and their marks), hyphen-joined parts included (`Lewis-mynd`). */
const WORD_RUN = /\p{L}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*)*/gu;
const foldedWords = (s) => (s.match(WORD_RUN) ?? []).map((w) => foldUmlaut(w.toLowerCase()));
/**
 * The fewest letters a compound modifier in front of the target may have. Measured on the
 * 2026-10-11 ruling set and the chemistry IS corpus: a 1–2 letter "modifier" is a fragment
 * of a different word (`a`+`nóða` is anóða, anode; `s`+`ker` is sker; `a`+`tóm` is atóm),
 * while real modifiers have 3+ (`raf`, `ein`, `þurr`, `kopar`). Documented over-refusal:
 * the 2-letter `ál` (álkarbónat).
 */
const MIN_MODIFIER_LETTERS = 3;

/**
 * Is `targetWord` the HEAD of `word`? Both are lowercase and umlaut-folded. `word` must be
 * `modifier + X`, where:
 *   - the modifier is empty, or has MIN_MODIFIER_LETTERS letters and is not a negating
 *     prefix (lexicon NEGATING_PREFIXES: `and`+`tengisvigrúm` is antibonding);
 *   - X and the target share a prefix at least as long as stemOf's stem (the whole target
 *     when it is under 4 letters, which has no stem), and BOTH remainders are in the
 *     ending class — X's is its inflection, the target's is what inflection replaced. The
 *     second condition is what refuses `varmamælir` (calorimeter) for `varmamæling` and
 *     `eintengi` for `tengill`: their shared stem is followed by `ng`/`ll`, which no
 *     inflection removes. A final `-ll` may lose its second l (`tengill` → `tengils`).
 * The common prefix is measured against the target WORD, not against stemOf's cut, so a
 * target whose dropped letters lie outside the ending class (`frumeind`, `varmamæling`)
 * still carries itself.
 */
function isHeadOf(word, targetWord) {
  const W = [...word];
  const T = [...targetWord];
  const stem = stemOf(targetWord);
  const need = stem ? [...stem].length : T.length;
  // A target word shorter than a modifier may be (`á` in `stig á Celsíus`, `eg` in `eg
  // svigrúm`) is never a compound head: `skr`+`á` is skrá, `línul`+`eg` is línuleg.
  const lastStart = T.length < MIN_MODIFIER_LETTERS ? 0 : W.length - need;
  for (let k = 0; k <= lastStart; k++) {
    if (k > 0) {
      const modifier = W.slice(0, k).join('').replace(/-+$/u, '');
      const letters = (modifier.match(/\p{L}/gu) ?? []).length;
      if (letters < MIN_MODIFIER_LETTERS || NEGATING_PREFIXES.has(modifier)) continue;
    }
    let c = 0;
    while (k + c < W.length && c < T.length && W[k + c] === T[c]) c++;
    if (c < need) continue;
    const wordRest = W.slice(k + c).join('');
    const targetRest = T.slice(c).join('');
    if (!ENDING_RE.test(wordRest)) continue;
    if (ENDING_RE.test(targetRest) || (targetRest === 'l' && targetWord.endsWith('ll'))) {
      return true;
    }
  }
  return false;
}

/**
 * STRICT: does `text` carry the ruled target as WORDS? Every word of the target must be the
 * head of some word of `text` (isHeadOf). This is the spec's stem match (stemOf, umlaut-
 * folded) narrowed to word positions: the English side is word-bounded (usesHeadword), and
 * now the Icelandic side is too. Used where a stricter match REFUSES more: "replace holds
 * the target" (term-target-missing).
 *
 * ⚠️ KNOWN RESIDUE, needs morphology the spec does not provide (measured on the 2026-10-11
 * ruling set's cross-ruling census, review round 1). Two classes pass:
 *   (a) a different word whose extra letters all sit in the ending class — `leysni`
 *       (solubility) for `leysir`, `rafneikvæðni` for `rafneikvæður`, `kerra` (cart) for
 *       `ker`, the modifier compounds `atómmassi` / `fjölatómajón` for `atóm` (`massi`,
 *       `ajón` are all ending-class letters), `uppleyst` for `leysir`;
 *   (b) a split whose 3+ letter "modifier" is not the word's real one — `fórnara`+`nóða`
 *       (really `fórnar`+`anóða`, sacrificial anode) under node, `gjafaa`+`tóm` under
 *       vacancy, `sveimh`+`raði` (really `hraði`, rate) under `röð`.
 * Telling these from real inflections and heads needs a lexicon of Icelandic words.
 */
export function carriesTarget(text, target) {
  const targetWords = targetWordsOf(target);
  if (targetWords === null || targetWords.length === 0) return false;
  const words = foldedWords(text);
  return targetWords.every((t) => words.some((w) => isHeadOf(w, t)));
}

/** Punctuation a target word may carry at its edges: `(hverfiþungi)`. */
const EDGE_PUNCTUATION = /^[()[\]„“”"'‚‘’«»,.;:!?]+|[()[\]„“”"'‚‘’«»,.;:!?]+$/gu;
/**
 * The target's words, lowercase and umlaut-folded, or null when a whitespace token is not
 * one word once edge punctuation is stripped — a digit or symbol INSIDE a word (`t2g`,
 * `sp3-…`, `tengisvigrúm-2`). Such a target is matchable:false in Unit B's set; splitting
 * it on the digit would leave 1-letter "words" that any word ending in that letter carries,
 * so the matcher fails closed instead of trusting the flag.
 */
function targetWordsOf(target) {
  const out = [];
  for (const token of target.split(/\s+/u).filter(Boolean)) {
    const core = token.replace(EDGE_PUNCTUATION, '');
    const runs = core.match(WORD_RUN) ?? [];
    if (runs.length !== 1 || runs[0] !== core) return null;
    out.push(foldUmlaut(core.toLowerCase()));
  }
  return out;
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

const wsWords = (s) => s.split(/\s+/u).filter(Boolean);

/**
 * Compare `find` and `replace` as whitespace words: strip the longest common leading run of
 * identical words, then the longest common trailing run of what is left, so the two runs
 * never share a word of either side.
 * @returns {{ shared: string[], replaceMiddle: string[] }} `shared` is the words of both
 *   runs (identical on the two sides); `replaceMiddle` is what remains of `replace`.
 */
function commonRuns(find, replace) {
  const fw = wsWords(find);
  const rw = wsWords(replace);
  let lead = 0;
  while (lead < fw.length && lead < rw.length && fw[lead] === rw[lead]) lead++;
  const room = Math.min(fw.length, rw.length) - lead;
  let trail = 0;
  while (trail < room && fw[fw.length - 1 - trail] === rw[rw.length - 1 - trail]) trail++;
  return {
    shared: [...fw.slice(0, lead), ...fw.slice(fw.length - trail)],
    replaceMiddle: rw.slice(lead, rw.length - trail),
  };
}

/** Is a whitespace token, edge punctuation stripped (`(eina` → `eina`), a gendered quantifier? */
const isQuantifierToken = (token) => isGenderedQuantifier(edges(token).core);

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

/** Words (tokens holding a letter or digit) strictly between two non-overlapping ranges. */
function wordsBetween(text, a, b) {
  const [x, y] = a.start < b.start ? [a, b] : [b, a];
  return text
    .slice(x.end, y.start)
    .split(/\s+/u)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

// The categories, and the two that are term operations. Every site that branches on a
// category goes through these, so a new one cannot fall silently into the agreement branch.
const CATEGORIES = Object.freeze(['term', 'term-sense', 'agreement']);
const isTermOp = (category) => category === 'term' || category === 'term-sense';

// `sense` must be present: null means "no sense restriction"; absent or malformed is invalid
// (Unit B's loader refuses both, and the gate does not trust that it ran).
function senseIsWellFormed(sense) {
  return (
    sense === null ||
    (typeof sense === 'object' &&
      typeof sense.id === 'string' &&
      sense.id !== '' &&
      Array.isArray(sense.otherSenses) &&
      typeof sense.status === 'string')
  );
}

function rulingIsWellFormed(r) {
  return (
    typeof r.is === 'string' &&
    r.is.trim() !== '' &&
    Array.isArray(r.en) &&
    r.en.length > 0 &&
    r.en.every((f) => typeof f === 'string' && f.trim() !== '') &&
    Array.isArray(r.kinds) &&
    senseIsWellFormed(r.sense)
  );
}

/**
 * The sense reasons for one op on one well-formed ruling. Empty means admitted.
 * The ruling's status is reported whatever the op's category, so a log shows a held sense
 * even on an agreement op (which then also lacks its anchor).
 */
function senseReasons(op, ruling) {
  if (ruling.sense === null) return op.category === 'term-sense' ? ['sense-not-applicable'] : [];
  const reasons = [];
  if (ruling.sense.status !== 'ruled') reasons.push('sense-unruled');
  if (op.category === 'term') reasons.push('sense-undeclared');
  else if (op.category === 'term-sense' && op.sense !== ruling.sense.id) {
    reasons.push('sense-mismatch');
  }
  return reasons;
}

function opIsWellFormed(op) {
  return (
    op !== null &&
    typeof op === 'object' &&
    typeof op.opId === 'string' &&
    op.opId !== '' &&
    CATEGORIES.includes(op.category) &&
    (op.category === 'term-sense'
      ? typeof op.sense === 'string' && op.sense !== ''
      : op.sense === undefined || op.sense === null) &&
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
    if (wellFormed) reasons.push(...senseReasons(op, ruling));
    // Both sides folded, as the work list reads them: an offer it made must not be refused here.
    if (wellFormed && !ruling.en.some((form) => usesHeadword(foldHyphens(form), st.enFolded))) {
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
    // Alignment is a question about rendered prose, so it is asked only of a find inside
    // one editable span; any other find is already refused.
    if (!inOneSpan) reasons.push('find-not-editable');
    else if (!isWordAligned(text, range.start, range.end)) reasons.push('find-not-word-aligned');
    if (applied.some((a) => range.start < a.end && a.start < range.end)) {
      reasons.push('overlaps-accepted-op');
    }
  }

  // What it may do.
  if (isTermOp(op.category)) {
    if (wellFormed) {
      // The two lean opposite ways on purpose, each toward refusing (see their docs).
      if (!carriesTarget(op.replace, ruling.is)) reasons.push('term-target-missing');
      if (containsTargetStem(op.find, ruling.is)) reasons.push('term-target-already');
    }
    if (!sameList(barredWords(op.find), barredWords(op.replace))) reasons.push('barred-word');
    // Only ops LABELLED agreement meet the agreement rules, so whatever a term op changes
    // beyond its target escaped them. The find side is left free: a compound collapse
    // (`Kenning um gildistengi` → `Gildistengjakenning`) must stay fixable.
    const runs = commonRuns(op.find, op.replace);
    if (wellFormed && runs.replaceMiddle.length > wordCount(ruling.is)) {
      reasons.push('term-op-too-wide');
    }
    // A gendered quantifier is BARRED, so no agreement op can follow the noun's new gender.
    // The two tokens before find include a part word glued to it (`tvær O-` + `frumeindir`).
    const beforeFind = range ? wsWords(text.slice(0, range.start)).slice(-2) : [];
    if ([...beforeFind, ...runs.shared].some(isQuantifierToken)) {
      reasons.push('quantifier-agreement');
    }
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
    const anchors = applied.filter((a) => isTermOp(a.category) && a.rulingId === op.rulingId);
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
      enFolded: foldHyphens(visibleProse(en)),
      acceptedCount: 0,
      changedChars: 0,
      baseLength: codePoints(is),
    };
    const order = [
      ...live.filter((e) => isTermOp(e.op.category)),
      ...live.filter((e) => e.op.category === 'agreement'),
    ];
    // Every well-formed op is in exactly one of the two lists. A category admitted by
    // opIsWellFormed and placed in neither would vanish with no verdict at all.
    if (order.length !== live.length) {
      throw new Error('gateSegment: an op category is in neither the term nor the agreement pass');
    }
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
