/**
 * chapter-term-plan — the PRE-BUY half of the per-chapter term checks.
 *
 * 🔴 WHY IT EXISTS. `chapter-term-check` compares a chapter's English against its
 * Icelandic, so it can only run AFTER the chapter has been bought, and it scores only
 * terms that already carry a glossary row. Chemistry ch07 paid for both limits: with no
 * row to anchor them, `resonance` came back as COVALENCE in 15 of 24 segments (a section
 * title among them) and `Lewis structure` in four different forms over 194 segments. Each
 * cost a paid re-buy. [USER] ruled 2026-09-19 that a 2–3,000 ISK re-MT for a few term
 * replacements is not sustainable, so the subset is settled BEFORE the money is spent.
 *
 * This module reads the chapter's English only (`02-for-mt`), costs 0 ISK and needs no
 * network. It DECIDES NOTHING: it ranks the terms the MT will have to guess at and says
 * which already have an approved Icelandic, for a human to rule on.
 *
 * ⚠️ A CANDIDATE IS A QUESTION, NOT A FINDING — the same caution `chapter-term-check`
 * carries. A frequent term with no row is often fine (the model renders most chemistry
 * correctly unprompted, per CLAUDE.md's §C73 rule); the point is that nobody looked.
 */

/**
 * `[[term:<label>|<id>]]` — the extractor's key-term marker (the id half is optional in
 * older vintages, so it is not required here).
 */
const TERM_MARKER_RE = /\[\[term:([^|\]]+)(?:\|[^\]]*)?\]\]/g;

/**
 * Function words and prose scaffolding. A candidate list is worthless if it is topped by
 * `of the`, and a bigram whose either half is one of these is scaffolding too.
 * ⚠️ Deliberately SMALL and generic: a chemistry word must never be filtered here, because
 * the blind spot this tool exists to close is exactly a subject term nobody wrote down.
 */
const FUNCTION_WORDS = new Set(
  (
    'a an the and or but if then than that this these those there here it its it s we you they ' +
    'he she i of in on at to for from by with without within into onto over under between among ' +
    'as is are was were be been being am do does did done have has had having can could should ' +
    'would will shall may might must not no nor only also very more most much many few less least ' +
    'each every both all any some such same other another one two three four five when while where ' +
    'which who whom whose what how why because so thus therefore however about above below after ' +
    'before during since until up down out off again further once per example shown figure see ' +
    'use used using note following above given let us its'
  ).split(' ')
);

/** Tokens that are not words at all: markers, numbers, single letters. */
const isWordToken = (t) => /^[A-Za-z][A-Za-z-]*$/.test(t) && t.length > 1;

/**
 * The chapter's own key terms, from the `[[term:…]]` markers the extractor emits.
 * These are what the BOOK defines, so they are the best candidates there are — no
 * frequency heuristic can beat an explicit marker.
 */
export function keyTermsIn(text) {
  const out = [];
  for (const m of text.matchAll(TERM_MARKER_RE)) {
    const label = (m[1] ?? '').trim();
    if (label) out.push(label);
  }
  return out;
}

/**
 * Words and two-word phrases a segment contains, as a SET — the unit is the segment, so a
 * term repeated ten times in one paragraph counts once. Adjacency means separated by one
 * space in the source, the same rule the server's census uses (`server/lib/sourceEnglish.js`),
 * so a phrase is never invented across a newline or a comma.
 */
export function phrasesIn(text) {
  const plain = text
    .replace(/\[\[[a-zA-Z]+:/g, ' ') // bracket-marker OPEN, prose kept
    .replace(/\]\]/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const out = new Set();
  const toks = [...plain.matchAll(/[A-Za-z][A-Za-z-]*/g)];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i][0];
    if (!isWordToken(w)) continue;
    const lower = w.toLowerCase();
    if (!FUNCTION_WORDS.has(lower)) out.add(w);
    const next = toks[i + 1];
    if (!next) continue;
    const adjacent = next.index === toks[i].index + w.length + 1 && plain[next.index - 1] === ' ';
    if (!adjacent || !isWordToken(next[0])) continue;
    const nl = next[0].toLowerCase();
    if (FUNCTION_WORDS.has(lower) || FUNCTION_WORDS.has(nl)) continue;
    out.add(`${w} ${next[0]}`);
  }
  return out;
}

/**
 * The counting key: case-folded, and de-pluralised on the LAST word so `Lewis structures`
 * and `Lewis structure` are one candidate rather than two half-sized ones.
 * ⚠️ Conservative on purpose — a word of 3 letters or fewer, or one ending in `ss`, keeps
 * its `s` (`gas` must not become `ga`). The surface form reported is the commonest one
 * actually seen, so a de-pluralised key never invents a spelling.
 */
export function candidateKey(s) {
  const parts = s.toLowerCase().split(' ');
  const last = parts[parts.length - 1];
  if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss')) {
    // ⚠️ `-es` comes off ONLY where English adds it — after s, x, z, ch, sh (`gases`,
    // `boxes`, `branches`). Applying it generally turns `structures` into `structur`,
    // which then matches nothing and HALVES the term's segment count (measured: Lewis
    // structure 96 of 194 before this).
    const stem = last.slice(0, -2);
    parts[parts.length - 1] =
      last.endsWith('es') && stem.length > 2 && /(?:s|x|z|ch|sh)$/.test(stem)
        ? stem
        : last.slice(0, -1);
  }
  return parts.join(' ');
}
const key = candidateKey;

/**
 * Rank the terms this chapter will ask the MT to render, and say which already have an
 * approved Icelandic.
 *
 * @param {object} o
 * @param {Map<string,string>} o.en   segment id → English text (`02-for-mt`)
 * @param {Array} o.terms             approved glossary terms, as the MT leg loads them
 * @param {number} [o.minSegments]    a term must appear in at least this many segments
 * @returns {Array<{term, segments, hasRow, icelandic, fromKeyTerm, subsumed}>} ranked, most
 *   segments first. `subsumed` marks a one-word candidate that is only a PIECE of a longer
 *   candidate (`structure` inside `Lewis structure`) — real, but not a term to rule on.
 */
export function chapterTermCandidates({ en, terms = [], minSegments = 5 }) {
  /** @type {Map<string, {surfaces: Map<string, number>, segments: number, fromKeyTerm: boolean}>} */
  const seen = new Map();
  const bump = (surface, fromKeyTerm) => {
    const k = key(surface);
    let row = seen.get(k);
    if (!row) {
      row = { surfaces: new Map(), segments: 0, fromKeyTerm: false };
      seen.set(k, row);
    }
    row.segments++;
    row.fromKeyTerm = row.fromKeyTerm || fromKeyTerm;
    // ⚠️ The COMMONEST surface, not the first seen: a term that opens a section title
    // would otherwise be reported capitalised for the whole chapter.
    row.surfaces.set(surface, (row.surfaces.get(surface) ?? 0) + 1);
  };
  const commonest = (surfaces) =>
    [...surfaces.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  for (const text of en.values()) {
    const inSegment = new Map(); // key → surface, so one segment counts a term once
    for (const t of keyTermsIn(text)) inSegment.set(key(t), { surface: t, keyTerm: true });
    for (const p of phrasesIn(text)) {
      if (!inSegment.has(key(p))) inSegment.set(key(p), { surface: p, keyTerm: false });
    }
    for (const { surface, keyTerm } of inSegment.values()) bump(surface, keyTerm);
  }

  // The glossary as the MT leg sees it: `sourceWord` → `targetWord`.
  const rows = new Map();
  for (const t of terms) {
    const eng = t.sourceWord ?? t.english;
    const ice = t.targetWord ?? t.icelandic;
    if (eng && ice && !rows.has(key(eng))) rows.set(key(eng), ice);
  }

  const kept = [...seen.entries()].filter(([, r]) => r.segments >= minSegments);

  // 🔴 A one-word candidate that only ever appears INSIDE a longer candidate is a
  // fragment, not a term: ch07's list was topped by `structure` (341) and `Lewis` (231),
  // both pieces of `Lewis structure`. They are flagged rather than dropped, because the
  // judgement is the reader's — and a word the BOOK marks up as a key term is never a
  // fragment, which is what keeps `resonance` in the list.
  const multiWordParts = new Set();
  for (const [k] of kept) {
    if (!k.includes(' ')) continue;
    for (const part of k.split(' ')) multiWordParts.add(part);
  }

  return kept
    .map(([k, r]) => ({
      term: commonest(r.surfaces),
      segments: r.segments,
      hasRow: rows.has(k),
      icelandic: rows.get(k) ?? null,
      fromKeyTerm: r.fromKeyTerm,
      subsumed: !k.includes(' ') && !r.fromKeyTerm && multiWordParts.has(k),
    }))
    .sort((a, b) => b.segments - a.segments || a.term.localeCompare(b.term));
}
