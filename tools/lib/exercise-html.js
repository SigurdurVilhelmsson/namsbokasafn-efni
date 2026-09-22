/**
 * exercise-html.js — reversible HTML⇄segments converter for os-embed exercise
 * fields (item 9 / D3). Pure, no I/O.
 *
 * Model: a field's HTML splits into a byte-exact SKELETON (block tags,
 * inter-tag whitespace, opaque content — everything MT must not touch, with
 * \x00SLOT_k\x00 sentinels — literal NUL-delimited, not space-delimited —
 * where text was) and RUNS (the translatable text, inline HTML mapped to the
 * proven-survival bracket dialect). fieldToHtml is
 * the exact inverse; under identity translation the round-trip is
 * byte-identical (tested over the entire live cache — the closed-inventory
 * proof). Anything outside the verified tag inventory throws: a future
 * exercise-bank refresh must surface, never silently strip.
 */

import { stripAltMarkers } from './alt-segments.js';

/** Tags handled as block structure (skeleton-side, attrs preserved verbatim). */
const STRUCTURAL_SRC = '<\\/?(?:p|br|ul|li|table|thead|tbody|tr|th|td|figure|figcaption)\\b[^>]*>';

/** Attr-free inline tags with deterministic marker inversion. */
const NAKED = { i: 'i', b: 'b', sub: 'sub', sup: 'sup' };
/** Inline tags preserved byte-exact via wrap anchors (arbitrary attrs). */
const WRAP_TAGS = new Set(['span', 'small', 'em', 'strong', 'i', 'b', 'sub', 'sup']);

const SLOT = (k) => `\x00SLOT_${k}\x00`;
const SLOT_RE = /\x00SLOT_(\d+)\x00/g;

/**
 * Escape literal '[' / ']' in source text so they can never be mistaken for
 * our own `[[type:...]]` marker delimiters (corpus find, item 9 T7: a literal
 * '[' immediately before an inline tag, e.g. "[<i>α</i>]", collided with the
 * marker it produced — "[[[i:α]]]" — and broke re-parsing). Escaped via the
 * same bracket-marker dialect (empty-body `[[lb:]]`/`[[rb:]]`) rather than an
 * out-of-band sentinel, since a sentinel outside that dialect is even less
 * likely to survive MT. NOTE: this proves the round-trip under *identity*
 * translation only — the content-bearing `[[i:...]]` family's proven ~100%
 * Málstaður survival does NOT transfer for free to the empty-body `[[lb:]]`/
 * `[[rb:]]` shape, which is new and API-unverified (cf. B4-D11, where an
 * assumed-safe bracket variant turned out opaque to the API). Probe survival
 * before the first real MT run that can hit these markers.
 */
function escapeLiteralBrackets(text) {
  // Single pass: chaining two .replace() calls would re-escape the '[[' the
  // first call just inserted.
  return text.replace(/[[\]]/g, (c) => (c === '[' ? '[[lb:]]' : '[[rb:]]'));
}

export class UnknownTagError extends Error {
  constructor(tag, context) {
    super(`unknown tag <${tag}> in exercise HTML near: ${context}`);
    this.name = 'UnknownTagError';
    this.tag = tag;
  }
}

export class MarkerError extends Error {
  constructor(message, context = '') {
    super(context ? `${message} near: ${context}` : message);
    this.name = 'MarkerError';
  }
}

/** Find the matching close tag for `name`, starting after its open tag. */
function matchClose(text, from, name) {
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(text)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      return { inner: text.slice(from, m.index), end: m.index + m[0].length, closeTag: m[0] };
    }
  }
  throw new UnknownTagError(name, `unclosed <${name}>: ${text.slice(from, from + 40)}`);
}

/** Convert one text run's inline HTML to marker text (recursive). */
function convertRun(text, state) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) {
      out += escapeLiteralBrackets(text.slice(i));
      break;
    }
    out += escapeLiteralBrackets(text.slice(i, lt));
    const tagMatch = /^<([a-zA-Z][\w-]*)\b([^>]*)>/.exec(text.slice(lt));
    if (!tagMatch) throw new UnknownTagError('<', text.slice(lt, lt + 40));
    const openTag = tagMatch[0];
    const name = tagMatch[1].toLowerCase();
    const attrs = tagMatch[2];

    if (name === 'img') {
      // Opaque: store the literal tag (corpus imgs are never self-closed —
      // emitting the stored literal is what keeps round-trips byte-exact).
      const n = state.nextOpaque++;
      state.opaques[n] = openTag;
      out += `[[MEDIA:${n}]]`;
      i = lt + openTag.length;
      continue;
    }
    if (name in NAKED && attrs.trim() === '') {
      const { inner, end } = matchClose(text, lt + openTag.length, name);
      out += `[[${NAKED[name]}:${convertRun(inner, state)}]]`;
      i = end;
      continue;
    }
    if (WRAP_TAGS.has(name)) {
      const { inner, end, closeTag } = matchClose(text, lt + openTag.length, name);
      if (!inner.trim()) {
        // Empty span/small (the 170 data-math spans): nothing to translate —
        // the whole element is opaque, byte-exact.
        const n = state.nextOpaque++;
        state.opaques[n] = text.slice(lt, end);
        out += `[[MEDIA:${n}]]`;
      } else {
        const n = state.nextWrap++;
        state.wraps[n] = { open: openTag, close: closeTag };
        out += `[[em:${convertRun(inner, state)}|${n}]]`;
      }
      i = end;
      continue;
    }
    throw new UnknownTagError(name, text.slice(lt, lt + 60));
  }
  return out;
}

/**
 * Split one exercise field's HTML into skeleton + translatable runs.
 * @param {string} html
 * @returns {{skeleton: string, runs: string[], opaques: Record<string,string>,
 *            wraps: Record<string,{open:string,close:string}>}}
 */
export function htmlToField(html) {
  const state = { opaques: {}, wraps: {}, nextOpaque: 0, nextWrap: 0 };
  let skeleton = '';
  const runs = [];

  const pushRun = (text) => {
    if (!text) return;
    if (!text.trim()) {
      skeleton += text; // whitespace between block tags stays structural
      return;
    }
    // Hoist edge whitespace into the skeleton so MT sees clean segments.
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    const core = text.slice(lead.length, text.length - trail.length);
    skeleton += lead + SLOT(runs.length) + trail;
    runs.push(convertRun(core, state));
  };

  const re = new RegExp(STRUCTURAL_SRC, 'gi');
  let last = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    pushRun(html.slice(last, m.index));
    skeleton += m[0];
    last = m.index + m[0].length;
  }
  pushRun(html.slice(last));

  return { skeleton, runs, opaques: state.opaques, wraps: state.wraps };
}

/** Scan for the `]]` matching an already-consumed `[[type:`, nesting-aware. */
function scanMarkerEnd(s, from) {
  let depth = 1;
  let i = from;
  while (i < s.length) {
    if (s.startsWith('[[', i)) {
      depth++;
      i += 2;
    } else if (s.startsWith(']]', i)) {
      depth--;
      if (depth === 0) return i;
      i += 2;
    } else {
      i++;
    }
  }
  throw new MarkerError('unterminated marker', s.slice(Math.max(0, from - 10), from + 30));
}

/**
 * Invert one (possibly translated) run's markers back to HTML.
 * @param {string} run
 * @param {ReturnType<typeof htmlToField>} field
 * @param {{opaques: Set<string>, wraps: Set<string>}} consumed - accumulates
 *   which field.opaques/field.wraps ids this run (and its nested runs)
 *   resolved, so fieldToHtml can assert every id was consumed EXACTLY once
 *   across the whole field (MT-deleted or MT-duplicated markers, item 9/D3
 *   final review C1).
 */
function invertRun(run, field, consumed) {
  let out = '';
  let i = 0;
  while (i < run.length) {
    const start = run.indexOf('[[', i);
    if (start === -1) {
      out += run.slice(i);
      break;
    }
    out += run.slice(i, start);
    const head = /^\[\[(i|b|sub|sup|em|MEDIA|lb|rb):/.exec(run.slice(start));
    if (!head) throw new MarkerError('stray [[ in run', run.slice(start, start + 30));
    const type = head[1];
    const bodyStart = start + head[0].length;
    const end = scanMarkerEnd(run, bodyStart);
    const body = run.slice(bodyStart, end);
    if (type === 'MEDIA') {
      const lit = field.opaques[body];
      if (lit === undefined)
        throw new MarkerError(`unknown MEDIA id ${body}`, run.slice(start, start + 30));
      if (consumed.opaques.has(body))
        throw new MarkerError(`duplicated MEDIA id ${body}`, run.slice(start, start + 30));
      consumed.opaques.add(body);
      out += lit;
    } else if (type === 'em') {
      const pm = body.match(/^([\s\S]*)\|(\d+)$/);
      if (!pm) throw new MarkerError('em marker missing |n anchor', run.slice(start, start + 30));
      const wrap = field.wraps[pm[2]];
      if (!wrap) throw new MarkerError(`unknown wrap id ${pm[2]}`, run.slice(start, start + 30));
      if (consumed.wraps.has(pm[2]))
        throw new MarkerError(`duplicated wrap id ${pm[2]}`, run.slice(start, start + 30));
      consumed.wraps.add(pm[2]);
      out += wrap.open + invertRun(pm[1], field, consumed) + wrap.close;
    } else if (type === 'lb') {
      // Defined empty (escapeLiteralBrackets never emits a body) — a
      // non-empty body means MT moved text inside the escape marker, which
      // would otherwise vanish silently on inversion (final review C1b).
      if (body !== '')
        throw new MarkerError(
          `non-empty [[lb:...]] body (MT moved text into an escape marker)`,
          run.slice(start, start + 30)
        );
      out += '[';
    } else if (type === 'rb') {
      if (body !== '')
        throw new MarkerError(
          `non-empty [[rb:...]] body (MT moved text into an escape marker)`,
          run.slice(start, start + 30)
        );
      out += ']';
    } else {
      out += `<${type}>${invertRun(body, field, consumed)}</${type}>`;
    }
    i = end + 2;
  }
  return out;
}

/**
 * Rebuild a field's HTML from its skeleton and (possibly translated) runs.
 * @param {ReturnType<typeof htmlToField>} field
 * @param {string[]} [runs] - translated runs; defaults to the originals
 * @returns {string}
 */
export function fieldToHtml(field, runs = field.runs) {
  if (runs.length !== field.runs.length) {
    throw new MarkerError(`run count mismatch: ${runs.length} !== ${field.runs.length}`);
  }
  const consumed = { opaques: new Set(), wraps: new Set() };
  const html = field.skeleton.replace(SLOT_RE, (_, k) =>
    invertRun(runs[Number(k)], field, consumed)
  );
  if (html.includes('\x00')) throw new MarkerError('unresolved slot sentinel in skeleton');

  // Marker-conservation check (final review C1a): the skeleton is an oracle
  // for exactly which opaque/wrap ids this field's runs must resolve. A
  // missing id means MT dropped the marker (silently losing an <img> or a
  // wrapped span); the duplicate case is already caught above, mid-scan.
  const missingOpaques = Object.keys(field.opaques).filter((id) => !consumed.opaques.has(id));
  const missingWraps = Object.keys(field.wraps).filter((id) => !consumed.wraps.has(id));
  if (missingOpaques.length || missingWraps.length) {
    const parts = [];
    if (missingOpaques.length)
      parts.push(`opaque id(s) [${missingOpaques.join(', ')}] never consumed`);
    if (missingWraps.length) parts.push(`wrap id(s) [${missingWraps.join(', ')}] never consumed`);
    throw new MarkerError(`marker conservation violated: ${parts.join('; ')}`);
  }
  return html;
}

// ─── §C126 #3 / §C123 — <img> alt text ───────────────────────────────
//
// An <img> is an OPAQUE literal (field.opaques[n] ↔ [[MEDIA:n]]), so its alt
// rode the skeleton byte-for-byte and was never extracted: 2,375 organic alts
// shipped in English to screen-reader users. The alt is now a segment of its
// own, keyed on the opaque index n. These two functions are the ONE predicate
// exercise-extract (emit) and exercise-assemble (write back) share, so the two
// sides cannot disagree about which images carry an alt segment.

/**
 * One attribute at a time, from where the previous one ended (sticky), so an
 * `alt=` sitting INSIDE another attribute's value can never be read as one.
 * Value forms: double-quoted (2), single-quoted (3), unquoted (4), or none.
 */
const IMG_ATTR = /\s+([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

/**
 * Locate an <img> literal's alt VALUE (the bytes between its quotes).
 * @param {string} literal - one opaque literal
 * @returns {{start: number, end: number, value: string}|null} null when the
 *   literal is not an <img> or carries no alt attribute
 * @throws {MarkerError} on an alt that is not double-quoted — every corpus alt
 *   is (2,380 of 2,380), and a refresh that changes that must surface rather
 *   than silently lose the alt (this module's closed-inventory contract)
 */
function imgAltSpan(literal) {
  const head = /^<img\b/i.exec(literal);
  if (!head) return null;
  IMG_ATTR.lastIndex = head[0].length;
  let m;
  while ((m = IMG_ATTR.exec(literal)) !== null) {
    if (m[1].toLowerCase() !== 'alt') continue;
    if (m[2] === undefined) {
      throw new MarkerError('unsupported <img> alt form (not double-quoted)', literal.slice(0, 80));
    }
    const end = m.index + m[0].length - 1; // the closing quote
    return { start: end - m[2].length, end, value: m[2] };
  }
  return null;
}

/** `&` first, or the `&` inside a just-written `&quot;` is re-escaped. Mirrors cnxml-inject's escapeAttr. */
const escapeAttrValue = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The <img> alts in one field that carry a translatable segment, in [[MEDIA:n]]
 * order. A blank alt carries nothing. Edge whitespace is hoisted out of `core`
 * (as pushRun hoists it out of a run) so MT sees a clean segment and the
 * identity round-trip stays byte-exact.
 * @param {{opaques: Record<string, string>}} field
 * @returns {{n: string, lead: string, core: string, trail: string}[]}
 */
export function fieldImgAlts(field) {
  return Object.keys(field.opaques)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((n) => {
      const span = imgAltSpan(field.opaques[n]);
      if (!span || !span.value.trim()) return [];
      const lead = span.value.match(/^\s*/)[0];
      const trail = span.value.match(/\s*$/)[0];
      return [
        { n, lead, core: span.value.slice(lead.length, span.value.length - trail.length), trail },
      ];
    });
}

/**
 * Write a translated alt core back into its <img> literal, keeping the source's
 * edge whitespace. An alt is an attribute value, so it may not hold markup in
 * any form — invented brackets or tags are stripped here, at the one writer,
 * whichever reader produced the text (§C169/§C176). Never invents an alt, and a
 * translation that is blank once stripped leaves the source literal as it was.
 * @param {string} literal - the <img> opaque literal
 * @param {string} core - translated alt text
 * @returns {string}
 */
export function withImgAlt(literal, core) {
  const span = imgAltSpan(literal);
  if (!span || !span.value.trim()) return literal;
  const clean = stripAltMarkers(core).trim();
  if (!clean) return literal;
  const lead = span.value.match(/^\s*/)[0];
  const trail = span.value.match(/\s*$/)[0];
  return (
    literal.slice(0, span.start) + lead + escapeAttrValue(clean) + trail + literal.slice(span.end)
  );
}

/**
 * The segment id of one field's image alt — the single construction point
 * exercise-extract (emit) and exercise-assemble (look up) share.
 *
 * TYPE `alt`, as module alts are (`{module}:alt:{elementId}`), so every
 * consumer that already understands an alt segment understands this one. The
 * elementId names the field (`stimulus` | `stem-{qid}` | `sol-{qid}`) and the
 * opaque index n of the [[MEDIA:n]] the image sits at: unique per exercise,
 * fixed by the read-only source, and `[\w-]` only, which both segment parsers
 * require.
 * @param {string} nickname - e.g. '01-04-OC-P04'
 * @param {string} fieldKey - skeleton field key: 'stimulus' | 'stem:{qid}' | 'sol:{qid}'
 * @param {string|number} n - opaque index
 * @returns {string}
 */
export function altSegId(nickname, fieldKey, n) {
  return `${nickname}:alt:${fieldKey.replace(':', '-')}-m${n}`;
}
