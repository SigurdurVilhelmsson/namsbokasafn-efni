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
      // Strictly-less: EARLIEST wins, and the reduction is INDEPENDENT OF THE ORDER
      // matchInText emits hits in. That order is END-ascending, so begins can arrive
      // out of order: keywords 'b' + 'a b c' over 'a b c' emit begin 2 BEFORE begin 0.
      // Only strictly-less recovers the 0 — pinned by 'recovers the earliest span when
      // one headword reaches two keywords'.
      //
      // ⚠️ Do NOT simplify to `if (existing === undefined)`. That is first-emitted-wins,
      // not earliest, and it answers 2 instead of 0 on exactly that test.
      // The last-wins bugs are `>=` and an unconditional set; both answer 37 instead
      // of 0 on the invariant test above.
      //
      // `<=` agrees on every input the CURRENT wiring can produce (one english per
      // headword => one keyword => constant length => begins ascending), but it is not
      // unqualifiedly equivalent: on TIED begins the two differ — 'a' + 'a b' over
      // 'a b' gives {0,1} under `<` and {0,3} under `<=`. Ties need one headword with
      // two keywords, which this module's contract excludes. (Production's multi-FORM
      // path — Icelandic inflections — sorts longest-first and would answer {0,3}; it
      // keeps its regex and does not come through here.)
      if (existing === undefined || hit.begin < existing.index) {
        first.set(headwordId, { index: hit.begin, length });
      }
    }
  }
  return first;
}

module.exports = { buildTermAutomaton, findFirstOccurrences };
