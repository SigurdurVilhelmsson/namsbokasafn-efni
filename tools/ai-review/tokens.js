/**
 * tokens.js — a depth-aware tokenizer for segment text, for the code gate
 * (design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit C).
 *
 * The grammar mirrors `unwrapInventedMarkers` in tools/api-translate.js:
 *   - at `[[`, read a type token up to the first `:`, `|` or `]]`; a `[`, `]` or whitespace in
 *     the token means this `[[` is not an opener, and the scan re-anchors ONE character on
 *     (so `[[[i:A]]]` is a literal `[`, the marker `[[i:A]]`, and a literal `]`);
 *   - a typed marker's payload runs to the MATCHING `]]`, counting nested `[[` (so
 *     `[[i:[[link:…|…]]]]` closes two levels and `[[fn:pK[[sub:w]] …|id]]` is one token);
 *   - a bare `[[TYPE]]` (`[[BR]]`, `[[SPACE]]`) is a token too.
 * A display/tail split happens at the first `|` at depth 0 of the payload.
 *
 * ⚠️ An opener with no matching `]]`, and a `]]` that closes nothing, are reported as
 * `problems`, never guessed around: the gate refuses the whole segment on either.
 *
 * The projections, all pure:
 *   markerTokens   — every marker's exact text, at every depth;
 *   markerMultiset — the same, with EDITABLE display text masked as `…`, so a label edit the
 *                    gate allows does not read as a marker change while every byte of syntax,
 *                    every `|…` tail and every protected payload is still compared exactly;
 *   editableSpans  — the only places an operation may touch;
 *   visibleProse   — what a reader sees, for the headword check (`usesHeadword` on raw text
 *                    fires inside `E[[sub:cell]]` and inside ids);
 *   isWordAligned  — whether a range starts and ends on a word boundary in the RENDERED
 *                    text, where a label flush against a word continues that word.
 */

/**
 * Label types whose display text is editable (spec Unit C). Everything else — xref, MATH,
 * MEDIA, TABLE, BR, SPACE, sub, sup, span, sc, lb, rb, math, EQ and any unknown type — is
 * wholly protected. link and docref are editable only when they carry a `|` tail, because
 * without one the payload IS the target (a URL or `m68674#fs-id…`), not a label.
 */
export const EDITABLE_LABEL_TYPES = Object.freeze([
  'i',
  'b',
  'u',
  'em',
  'term',
  'fn',
  'link',
  'docref',
]);
/** i/b payloads with no word of 4+ letters are variables (`M`, `s`, `aq`, `sp`): protected. */
const VARIABLE_TYPES = new Set(['i', 'b']);
const TARGET_WITHOUT_TAIL = new Set(['link', 'docref']);
/** Dropped from visible prose with NO space: they attach to the word they follow (E_cell, H₂O). */
const ATTACHED_TYPES = new Set(['sub', 'sup']);
/** Visible prose keeps these markers' display text. */
const LABEL_TYPES = new Set([...EDITABLE_LABEL_TYPES, 'span', 'sc']);

/**
 * Protected stretches INSIDE plain text: MT-invented or legacy markup and things that are
 * not prose. An editable span never crosses one.
 *   <tag> / </tag>   — MT-invented `<lágvísir>`, `<subscript>` in alts
 *   ~x~ / ^x^         — legacy sub/superscript in alts and table summaries
 *   http(s)://…       — a bare URL
 *   ____              — a fill-in blank
 */
const PROTECTED_IN_TEXT =
  /<\/?[^<>\s][^<>]*>|~[^~\s]{1,20}~|\^[^^\s]{1,20}\^|https?:\/\/\S+|_{2,}/gu;
const URL_IN_TEXT = /https?:\/\/\S+/gu;
const TAG_OR_LEGACY = /<\/?[^<>\s][^<>]*>|~[^~\s]{1,20}~|\^[^^\s]{1,20}\^/gu;
const LONG_WORD = /(?:\p{L}\p{M}*){4,}/u;

/**
 * @typedef {{ start: number, end: number }} Range
 * @typedef {{ kind: 'text', start: number, end: number, text: string }} TextNode
 * @typedef {{
 *   kind: 'marker', type: string, start: number, end: number, text: string,
 *   form: 'bare'|'typed'|'invented',
 *   display: Range|null, tail: Range|null,
 *   children: Node[], tailChildren: Node[],
 * }} MarkerNode
 * @typedef {TextNode|MarkerNode} Node
 * @typedef {{ code: 'unterminated-marker'|'stray-closer', at: number }} Problem
 */

/**
 * Read a marker opener at `i`. Returns null when `[[` is not an opener here.
 * @param {string} s
 * @param {number} i
 * @param {number} end exclusive bound of the region being parsed
 */
function readMarker(s, i, end) {
  let j = i + 2;
  let sep = null;
  while (j < end) {
    if (s[j] === ':' || s[j] === '|') {
      sep = s[j];
      break;
    }
    if (j + 1 < end && s[j] === ']' && s[j + 1] === ']') {
      sep = ']]';
      break;
    }
    if (s[j] === '[' || s[j] === ']' || /\s/u.test(s[j])) break;
    j++;
  }
  const type = s.slice(i + 2, j);
  if (sep === null || type === '') return null;
  if (sep === ']]') return { type, form: 'bare', payload: null, close: j + 2 };
  let k = j + 1;
  let depth = 1;
  while (k < end) {
    if (k + 1 < end && s[k] === '[' && s[k + 1] === '[') {
      depth++;
      k += 2;
    } else if (k + 1 < end && s[k] === ']' && s[k + 1] === ']') {
      depth--;
      if (depth === 0) break;
      k += 2;
    } else k++;
  }
  if (depth !== 0) return { type, unterminated: true };
  return {
    type,
    form: sep === ':' ? 'typed' : 'invented',
    payload: { start: j + 1, end: k },
    close: k + 2,
  };
}

/** Index of the first `|` at depth 0 in s[a, b), or -1. */
function topLevelPipe(s, a, b) {
  let depth = 0;
  for (let k = a; k < b; k++) {
    if (k + 1 < b && s[k] === '[' && s[k + 1] === '[') {
      depth++;
      k++;
    } else if (k + 1 < b && s[k] === ']' && s[k + 1] === ']') {
      depth--;
      k++;
    } else if (depth === 0 && s[k] === '|') return k;
  }
  return -1;
}

/**
 * @param {string} s
 * @param {number} start
 * @param {number} end
 * @param {Problem[]} problems
 * @returns {Node[]}
 */
function parseRange(s, start, end, problems) {
  const nodes = [];
  let textStart = start;
  const flush = (to) => {
    if (to > textStart)
      nodes.push({ kind: 'text', start: textStart, end: to, text: s.slice(textStart, to) });
  };
  let i = start;
  while (i < end) {
    if (i + 1 < end && s[i] === '[' && s[i + 1] === '[') {
      const m = readMarker(s, i, end);
      if (m && !m.unterminated) {
        flush(i);
        nodes.push(makeMarker(s, i, m, problems));
        i = m.close;
        textStart = i;
        continue;
      }
      if (m?.unterminated) problems.push({ code: 'unterminated-marker', at: i });
      i += 1; // re-anchor one character on, as unwrapInventedMarkers does
      continue;
    }
    if (i + 1 < end && s[i] === ']' && s[i + 1] === ']') {
      problems.push({ code: 'stray-closer', at: i });
      i += 2;
      continue;
    }
    i++;
  }
  flush(end);
  return nodes;
}

function makeMarker(s, i, m, problems) {
  const node = {
    kind: 'marker',
    type: m.type,
    start: i,
    end: m.close,
    text: s.slice(i, m.close),
    form: m.form,
    display: null,
    tail: null,
    children: [],
    tailChildren: [],
  };
  if (!m.payload) return node;
  if (m.form === 'invented') {
    // `[[word|payload]]`: an MT invention the unwrap step should have removed. Parse it only
    // so nested markers are seen; none of it is ever editable.
    node.tail = m.payload;
    node.tailChildren = parseRange(s, m.payload.start, m.payload.end, problems);
    return node;
  }
  const pipe = topLevelPipe(s, m.payload.start, m.payload.end);
  node.display = { start: m.payload.start, end: pipe >= 0 ? pipe : m.payload.end };
  node.children = parseRange(s, node.display.start, node.display.end, problems);
  if (pipe >= 0) {
    node.tail = { start: pipe, end: m.payload.end };
    node.tailChildren = parseRange(s, pipe + 1, m.payload.end, problems);
  }
  return node;
}

/**
 * Tokenize segment text. Concatenating the top-level nodes' `text` reproduces the input.
 * @param {string} text
 * @returns {{ nodes: Node[], problems: Problem[] }}
 */
export function tokenize(text) {
  const s = String(text ?? '');
  const problems = [];
  const nodes = parseRange(s, 0, s.length, problems);
  return { nodes, problems };
}

/** Depth-first walk over every marker. */
function* markers(nodes) {
  for (const n of nodes) {
    if (n.kind !== 'marker') continue;
    yield n;
    yield* markers(n.children);
    yield* markers(n.tailChildren);
  }
}

/**
 * Every marker token's exact text, at every depth, in document order (outer before inner).
 * Includes the bare `[[BR]]` and `[[SPACE]]`.
 * @param {string} text
 * @returns {string[]}
 */
export function markerTokens(text) {
  return [...markers(tokenize(text).nodes)].map((m) => m.text);
}

/** Is this marker's display text editable (ignoring its ancestors)? */
function labelIsEditable(m) {
  if (m.form !== 'typed' || !m.display) return false;
  if (!EDITABLE_LABEL_TYPES.includes(m.type)) return false;
  if (TARGET_WITHOUT_TAIL.has(m.type) && !m.tail) return false;
  if (VARIABLE_TYPES.has(m.type)) {
    // The payload's OWN plain text, not a nested label's: `[[i:[[link:…]]]]` has none.
    const own = m.children
      .filter((c) => c.kind === 'text')
      .map((c) => c.text)
      .join(' ');
    if (!LONG_WORD.test(own)) return false;
  }
  return true;
}

/** Split one text node around PROTECTED_IN_TEXT into editable spans. */
function textSpans(node) {
  const spans = [];
  let at = 0;
  for (const m of node.text.matchAll(PROTECTED_IN_TEXT)) {
    if (m.index > at) spans.push([at, m.index]);
    at = m.index + m[0].length;
  }
  if (at < node.text.length) spans.push([at, node.text.length]);
  return spans.map(([a, b]) => ({
    start: node.start + a,
    end: node.start + b,
    text: node.text.slice(a, b),
  }));
}

function collectSpans(nodes, out) {
  for (const n of nodes) {
    if (n.kind === 'text') out.push(...textSpans(n));
    else if (labelIsEditable(n)) collectSpans(n.children, out);
  }
  return out;
}

/**
 * The stretches of `text` an operation may touch: plain prose outside markers, and the
 * display text of editable labels (see EDITABLE_LABEL_TYPES). Nothing inside a protected
 * marker is editable, however deeply nested. Offsets index into `text`.
 * @param {string} text
 * @returns {Array<{ start: number, end: number, text: string }>}
 */
export function editableSpans(text) {
  return collectSpans(tokenize(text).nodes, []);
}

/**
 * The marker multiset: one signature per marker at every depth, sorted. A signature is the
 * marker's exact text with every editable span inside it replaced by `…`.
 * @param {string} text
 * @returns {string[]}
 */
export function markerMultiset(text) {
  const s = String(text ?? '');
  const { nodes } = tokenize(s);
  const spans = collectSpans(nodes, []);
  const signature = (m) => {
    let out = '';
    let at = m.start;
    for (const sp of spans) {
      if (sp.start < m.start || sp.end > m.end) continue;
      out += s.slice(at, sp.start) + '…';
      at = sp.end;
    }
    return out + s.slice(at, m.end);
  };
  return [...markers(nodes)].map(signature).sort();
}

function visibleNodes(nodes) {
  return nodes
    .map((n) => {
      if (n.kind === 'text') {
        return n.text.replace(URL_IN_TEXT, ' ').replace(TAG_OR_LEGACY, '');
      }
      if (n.form !== 'typed') return ' ';
      if (ATTACHED_TYPES.has(n.type)) return '';
      if (TARGET_WITHOUT_TAIL.has(n.type)) return n.tail ? visibleNodes(n.children) : ' ';
      if (LABEL_TYPES.has(n.type)) return visibleNodes(n.children);
      return ' '; // xref, MATH, MEDIA, TABLE, EQ, math, lb, rb, unknown
    })
    .join('');
}

/**
 * What a reader sees, for headword checks: label display text kept; sub/sup payloads,
 * `|…` tails, ids, URLs, MATH/MEDIA/TABLE, xref and unlabelled targets dropped; whitespace
 * collapsed. sub/sup vanish without a space (they attach to their word), so a dropped
 * payload can only HIDE a headword, never manufacture one by splitting a word.
 * @param {string} text
 * @returns {string}
 */
export function visibleProse(text) {
  return visibleNodes(tokenize(text).nodes).replace(/\s+/gu, ' ').trim();
}

/** Bare markers that render as a break or a space: a word boundary. */
const BOUNDARY_MARKERS = new Set(['BR', 'SPACE']);
/** Stand-in for a marker that renders as something opaque (a formula, a figure, a
 * cross-reference label, an unlabelled link): treated as part of a word, so a find flush
 * against one is refused rather than guessed about. */
const OPAQUE = 'X';
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

/**
 * The text as a reader sees it, one entry per code point: text-node characters, label
 * display text and sub/sup payloads at their offsets in `text`; `|…` tails and marker
 * syntax dropped; BR/SPACE as a space and every other marker as one opaque stand-in
 * (offset -1). Unlike visibleProse it keeps sub/sup payloads: there the question is what
 * touches a word, not what the word says.
 * @returns {Array<{ ch: string, at: number }>}
 */
function renderedChars(nodes, out) {
  for (const n of nodes) {
    if (n.kind === 'text') {
      let at = n.start;
      for (const ch of n.text) {
        out.push({ ch, at });
        at += ch.length;
      }
    } else if (n.form === 'bare' && BOUNDARY_MARKERS.has(n.type)) {
      out.push({ ch: ' ', at: -1 });
    } else if (
      n.form === 'typed' &&
      (LABEL_TYPES.has(n.type) || ATTACHED_TYPES.has(n.type)) &&
      !(TARGET_WITHOUT_TAIL.has(n.type) && !n.tail)
    ) {
      renderedChars(n.children, out);
    } else {
      out.push({ ch: OPAQUE, at: -1 });
    }
  }
  return out;
}

/**
 * Does `text[start, end)` start and end on a word boundary AS A READER SEES THE TEXT?
 * A label flush against a word renders as one word — `Natríum[[i:atóm]]` reads
 * "Natríumatóm" — so the raw `[` or `]` beside a range is no boundary, in either
 * direction: neither `Natríum` nor the payload `atóm` is a whole word there.
 * Fails closed (false) on a range that is invalid or does not start and end on a
 * rendered character (i.e. starts or ends in marker syntax or a tail).
 * @param {string} text
 * @param {number} start inclusive offset into `text`
 * @param {number} end exclusive offset into `text`
 * @returns {boolean}
 */
export function isWordAligned(text, start, end) {
  const s = String(text ?? '');
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > s.length) {
    return false;
  }
  if (start >= end) return false;
  const r = renderedChars(tokenize(s).nodes, []);
  const first = r.findIndex((e) => e.at === start);
  const last = r.findIndex((e) => e.at >= 0 && e.at <= end - 1 && end - 1 < e.at + e.ch.length);
  if (first < 0 || last < first) return false;
  const isWord = (e) => e !== undefined && WORD_CHAR.test(e.ch);
  const startOk = !isWord(r[first]) || !isWord(r[first - 1]);
  const endOk = !isWord(r[last]) || !isWord(r[last + 1]);
  return startOk && endOk;
}
