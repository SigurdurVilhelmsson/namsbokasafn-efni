/**
 * Aho-Corasick term matcher — the C24 replacement for one primitive:
 * "first occurrence of English headword T in segment S".
 *
 * ┌─ THE INVARIANT ─────────────────────────────────────────────────────────┐
 * │ firstWholeWordOccurrence(headword, segment) = the EARLIEST position at   │
 * │ which the headword occurs WITH WHOLE-WORD BOUNDARIES.                    │
 * │ Filter to whole-word FIRST, then take the earliest.                      │
 * │ NEVER "all occurrences."                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * This exactly reproduces .exec() on wholeWordRegex([english]). The caller
 * (findTermsInSegments) then applies its own overlap tiler in `terms` order — a
 * term whose first whole-word occurrence overlaps a claimed span is DROPPED, even
 * if it recurs later unoverlapped. Do not "improve" that here.
 *
 * Aho-Corasick returns ALL occurrences, so the tempting next step — "try the next
 * one, it doesn't overlap" — silently breaks byte-identity with the old behaviour.
 */
const { AhoCorasick } = require('@monyone/aho-corasick');
const { foldString } = require('./caseFold');
const { isWholeWordAt } = require('./wordBoundary');

/**
 * @param {Array<{headwordId:number, english:string}>} entries
 * @returns {{ac: AhoCorasick|null, byKeyword: Map<string, number[]>, keywordCount: number}}
 */
function buildTermAutomaton(entries) {
  const byKeyword = new Map();
  for (const { headwordId, english } of entries) {
    // Mirror wholeWordRegex's filter(Boolean) (terminologyService.js, wholeWordRegex):
    // a falsy english yields /(?!)/ there — matches nothing — but an empty automaton
    // keyword matches ZERO-WIDTH AT EVERY POSITION. Whitespace-only must still be
    // INCLUDED: ' ' does match a lone space today. Two opposite answers, one line apart.
    if (!english) continue;
    const keyword = foldString(english);
    const ids = byKeyword.get(keyword);
    if (ids) ids.push(headwordId);
    else byKeyword.set(keyword, [headwordId]);
  }
  const keywords = [...byKeyword.keys()];
  return {
    ac: keywords.length > 0 ? new AhoCorasick(keywords) : null,
    byKeyword,
    keywordCount: keywords.length,
  };
}

/**
 * @returns {Map<number, {index:number, length:number}>} headwordId -> earliest
 *          whole-word occurrence. Absent key means "no match in this text".
 */
function findFirstOccurrences(automaton, text) {
  const first = new Map();
  if (!automaton.ac || !text) return first;

  // Length-stable fold => folded offsets ARE original offsets, no remapping.
  const hits = automaton.ac.matchInText(foldString(text));

  for (const hit of hits) {
    // FILTER FIRST. Reducing before filtering picks an interior hit and then
    // discards it, losing a later valid match.
    if (!isWholeWordAt(text, hit.begin, hit.end)) continue;
    const length = hit.end - hit.begin; // end is EXCLUSIVE (verified against v1.5.2)
    for (const headwordId of automaton.byKeyword.get(hit.keyword)) {
      const existing = first.get(headwordId);
      // Strictly-less: EARLIEST wins.
      // Hits arrive END-ascending. For a single keyword the length is constant, so
      // that is also BEGIN-ascending — this guard is therefore INERT in the common
      // case, and `<=` is an EQUIVALENT mutant, not the last-wins bug (measured).
      // It IS load-bearing when one headwordId reaches TWO keywords: 'b' + 'a b c'
      // over 'a b c' emits begin 2 before begin 0, and strictly-less recovers the 0.
      // The real last-wins bug is `>=`, or an unconditional set: either answers 37
      // instead of 0 on the invariant test above.
      if (existing === undefined || hit.begin < existing.index) {
        first.set(headwordId, { index: hit.begin, length });
      }
    }
  }
  return first;
}

module.exports = { buildTermAutomaton, findFirstOccurrences };
