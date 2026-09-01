// tools/lib/math-label-substitute.js
import fs from 'fs';
import path from 'path';
import {
  collectMathTokens,
  bucketToken,
  decodeEntities,
  DEFAULT_STOPLIST,
} from './math-label-inventory.js';
import { findGlossaryCollisions } from './glossary-collisions.js';

const FORBIDDEN_XML = /[<>&"']/;

/**
 * Build a lowercase-English → Icelandic map from the unified glossary, keeping
 * only approved terms with a non-empty Icelandic (the ~330 empty-Icelandic terms
 * must never substitute a blank).
 * @param {{terms?: Array<{english?:string,icelandic?:string,status?:string}>}} glossary
 * @returns {{map: Map<string,string>, collisions: {competitions: Array<object>, commaLists: Array<object>}}}
 */
export function buildGlossaryMap(glossary) {
  const map = new Map();
  const terms = glossary && Array.isArray(glossary.terms) ? glossary.terms : [];
  for (const t of terms) {
    if (t.status !== 'approved') continue;
    const en = (t.english || '').trim().toLowerCase();
    const is = (t.icelandic || '').trim();
    if (en && is) map.set(en, is);
  }
  // C18: the Map above resolves competing translations by last-write-wins,
  // silently. The behaviour is DELIBERATELY unchanged (this must not move a
  // rendered byte); what changes is that the competition is now reported.
  return { map, collisions: findGlossaryCollisions(terms, { approvedOnly: true }) };
}

/**
 * Resolve one label to its rendered value per the locked precedence.
 * @param {string} label
 * @param {{overlay?:Record<string,string>, glossaryMap?:Map<string,string>}} ctx
 * @returns {{value:string, source:'overlay-translated'|'overlay-self'|'glossary'|'english'}}
 */
export function resolveLabel(label, { overlay = {}, glossaryMap = new Map() } = {}) {
  // #1: pure alphabetic words (>=3 chars) fall back to their lowercase form so a
  // capitalized occurrence (Rate/Acid/Base) resolves like the lowercase key, while
  // formulae / element symbols (digits, mixed case, <3 chars) are never case-folded.
  const isWord = /^[A-Za-z][a-z]{2,}$/.test(label);
  const lower = label.toLowerCase();

  // overlay: exact key first (honors hand-added exact-case keys), then lowercase for words.
  let ovRaw = overlay[label];
  if (!(typeof ovRaw === 'string' && ovRaw.trim().length > 0) && isWord && lower !== label) {
    ovRaw = overlay[lower];
  }
  if (typeof ovRaw === 'string' && ovRaw.trim().length > 0) {
    // #4: trim before judging — a value equal to the label (or its lowercase) after
    // trimming is a self-map (renders English); otherwise the trimmed value is emitted
    // (a stray leading/trailing space never reaches the output).
    const v = ovRaw.trim();
    if (v === label || v === lower) return { value: label, source: 'overlay-self' };
    return { value: v, source: 'overlay-translated' };
  }
  // §C82 ③ — THE GLOSSARY IS A MAP OF WORDS, SO IT MAY NOT TRANSLATE A SYMBOL.
  // A token of ≤2 chars (unit and element symbols, variables: ln kg nm lb ft oz ne)
  // or one on DEFAULT_STOPLIST (math functions and units: log sin cos atm torr ppb)
  // is a symbol, and rendering it as prose corrupts the equation — `S = k ln W`
  // became `S = k náttúrlegur logri W` in committed CNXML before this guard.
  //
  // WHY HERE AND NOT AS A PER-BOOK MASK. These are exactly the tokens `bucketToken`
  // routes to 'other', so `mergeSkeleton` never offers them to a human and they can
  // never acquire a self-map in math-label-map.json the way `at`/`si`/`ppm` did.
  // The stoplist declares them "confirmed to STAY unchanged in Icelandic"; until now
  // nothing consulted that declaration at resolution time.
  //
  // The overlay is checked ABOVE and therefore still outranks this: a book that
  // means to localise a symbol says so explicitly. That is also what keeps `mol` →
  // `mól` working — 3 chars and deliberately off the stoplist, so it is a word here.
  const isSymbol = [...label].length <= 2 || DEFAULT_STOPLIST.has(lower);
  if (!isSymbol) {
    // glossary keys are lowercased in buildGlossaryMap; look up the lowercase form for words.
    const g = glossaryMap.get(isWord ? lower : label);
    if (typeof g === 'string' && g.trim()) return { value: g, source: 'glossary' };
  }
  return { value: label, source: 'english' };
}

/** Curry a resolver over a fixed overlay + glossary. */
export function buildResolver({ overlay = {}, glossaryMap = new Map() } = {}) {
  return (label) => resolveLabel(label, { overlay, glossaryMap });
}

// Matches a leaf <m:mtext>/<m:mi> node: open tag (with any attrs) + text with no
// child elements ([^<]*) + close tag. Nodes containing child elements never match.
const LEAF_MATH_TOKEN = /(<m:m(?:text|i)\b[^>]*>)([^<]*)(<\/m:m(?:text|i)>)/g;

/**
 * Byte-minimal substitution of exact-match English math labels → resolved value.
 * Only replaces when the trimmed node text exactly equals a label that resolves
 * to something other than itself; preserves surrounding whitespace and all other
 * bytes. Throws (OV-M2) if a resolved value carries a forbidden XML char.
 * @param {string} mathml
 * @param {(label:string)=>{value:string,source:string}} resolve
 * @returns {string}
 */
export function substituteMathLabels(mathml, resolve) {
  if (typeof mathml !== 'string') return mathml;
  return mathml.replace(LEAF_MATH_TOKEN, (full, open, inner, close) => {
    // #5: match on the DECODED, trimmed text so a token the inventory recorded
    // (collectMathTokens uses DOM textContent, which decodes entities) is found here
    // too. Replace the literal decoded core in the raw inner, preserving other bytes
    // (e.g. a trailing entity-encoded NBSP).
    const key = decodeEntities(inner).trim();
    if (!key) return full;
    const { value, source } = resolve(key);
    if (source !== 'english' && FORBIDDEN_XML.test(value)) {
      throw new Error(
        `math-label substitution: value "${value}" for "${key}" contains a forbidden XML character`
      );
    }
    if (value === key) return full;
    return open + inner.replace(key, value) + close;
  });
}

/**
 * Analysis pass (read-only): find bucket-1 labels absent from the overlay
 * (unmapped) and glossary fills that exceed 6 chars in a subscript slot.
 * @param {string} cnxml
 * @param {(label:string)=>{value:string,source:string}} resolve
 * @param {{overlay?:Record<string,string>}} opts
 * @returns {{unmapped:string[], longSubscriptFills:Array<{token:string,value:string,cp:number}>}}
 */
export function reportMathLabels(cnxml, resolve, { overlay = {} } = {}) {
  const agg = new Map(); // token -> { script:boolean }
  for (const { text, position } of collectMathTokens(cnxml)) {
    if (bucketToken(text) !== 'label') continue;
    if (!agg.has(text)) agg.set(text, { script: false });
    if (position === 'script') agg.get(text).script = true;
  }
  const unmapped = [];
  const longSubscriptFills = [];
  for (const [token, info] of agg) {
    if (!Object.prototype.hasOwnProperty.call(overlay, token)) {
      unmapped.push(token);
      continue;
    }
    const r = resolve(token);
    const cp = [...r.value].length;
    if (r.source === 'glossary' && info.script && cp > 6) {
      longSubscriptFills.push({ token, value: r.value, cp });
    }
  }
  return { unmapped, longSubscriptFills };
}

/**
 * Load a book's overlay + glossary and build the resolver. Reads
 * <bookDir>/math-label-map.json and <bookDir>/glossary/glossary-unified.json;
 * missing files degrade to empty (pending → English).
 * @param {string} bookDir  e.g. "books/efnafraedi-2e"
 * @returns {{resolve:Function, overlay:Record<string,string>, glossaryMap:Map<string,string>, collisions:Object}}
 */
export function loadMathLabelResolver(bookDir) {
  const overlayPath = path.join(bookDir, 'math-label-map.json');
  const glossaryPath = path.join(bookDir, 'glossary', 'glossary-unified.json');
  const overlay = fs.existsSync(overlayPath)
    ? JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
    : {};
  const glossary = fs.existsSync(glossaryPath)
    ? JSON.parse(fs.readFileSync(glossaryPath, 'utf8'))
    : { terms: [] };
  const { map: glossaryMap, collisions } = buildGlossaryMap(glossary);

  // buildGlossaryMap sees the glossary only. This is the first point that
  // holds BOTH the glossary and the overlay, so it is where a competition can
  // be told apart from one math-label-map.json overrides. Masking is computed
  // with resolveLabel's own rules, not a plain overlay lookup, or the
  // annotation would disagree with the resolution it describes.
  // NOTE: the key is already lowercased by buildGlossaryMap, so this answers
  // "would the overlay win for this key as stored" — an approximation that is
  // for REPORTING only and never gates behaviour.
  const annotated = {
    ...collisions,
    competitions: collisions.competitions.map((c) => ({
      ...c,
      masked: resolveLabel(c.english, { overlay, glossaryMap }).source.startsWith('overlay'),
    })),
  };

  return {
    resolve: buildResolver({ overlay, glossaryMap }),
    overlay,
    glossaryMap,
    collisions: annotated,
  };
}
