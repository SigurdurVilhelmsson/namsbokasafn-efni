/**
 * exercise-html.js — reversible HTML⇄segments converter for os-embed exercise
 * fields (item 9 / D3). Pure, no I/O.
 *
 * Model: a field's HTML splits into a byte-exact SKELETON (block tags,
 * inter-tag whitespace, opaque content — everything MT must not touch, with
 *  SLOT_k  sentinels where text was) and RUNS (the translatable text,
 * inline HTML mapped to the proven-survival bracket dialect). fieldToHtml is
 * the exact inverse; under identity translation the round-trip is
 * byte-identical (tested over the entire live cache — the closed-inventory
 * proof). Anything outside the verified tag inventory throws: a future
 * exercise-bank refresh must surface, never silently strip.
 */

/** Tags handled as block structure (skeleton-side, attrs preserved verbatim). */
const STRUCTURAL_SRC = '<\\/?(?:p|br|ul|li|table|thead|tbody|tr|th|td|figure|figcaption)\\b[^>]*>';

/** Attr-free inline tags with deterministic marker inversion. */
const NAKED = { i: 'i', b: 'b', sub: 'sub', sup: 'sup' };
/** Inline tags preserved byte-exact via wrap anchors (arbitrary attrs). */
const WRAP_TAGS = new Set(['span', 'small', 'em', 'strong', 'i', 'b', 'sub', 'sup']);

const SLOT = (k) => `\x00SLOT_${k}\x00`;
const SLOT_RE = /\x00SLOT_(\d+)\x00/g;

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
      out += text.slice(i);
      break;
    }
    out += text.slice(i, lt);
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

/** Invert one (possibly translated) run's markers back to HTML. */
function invertRun(run, field) {
  let out = '';
  let i = 0;
  while (i < run.length) {
    const start = run.indexOf('[[', i);
    if (start === -1) {
      out += run.slice(i);
      break;
    }
    out += run.slice(i, start);
    const head = /^\[\[(i|b|sub|sup|em|MEDIA):/.exec(run.slice(start));
    if (!head) throw new MarkerError('stray [[ in run', run.slice(start, start + 30));
    const type = head[1];
    const bodyStart = start + head[0].length;
    const end = scanMarkerEnd(run, bodyStart);
    const body = run.slice(bodyStart, end);
    if (type === 'MEDIA') {
      const lit = field.opaques[body];
      if (lit === undefined)
        throw new MarkerError(`unknown MEDIA id ${body}`, run.slice(start, start + 30));
      out += lit;
    } else if (type === 'em') {
      const pm = body.match(/^([\s\S]*)\|(\d+)$/);
      if (!pm) throw new MarkerError('em marker missing |n anchor', run.slice(start, start + 30));
      const wrap = field.wraps[pm[2]];
      if (!wrap) throw new MarkerError(`unknown wrap id ${pm[2]}`, run.slice(start, start + 30));
      out += wrap.open + invertRun(pm[1], field) + wrap.close;
    } else {
      out += `<${type}>${invertRun(body, field)}</${type}>`;
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
  const html = field.skeleton.replace(SLOT_RE, (_, k) => invertRun(runs[Number(k)], field));
  if (html.includes('\x00')) throw new MarkerError('unresolved slot sentinel in skeleton');
  return html;
}
