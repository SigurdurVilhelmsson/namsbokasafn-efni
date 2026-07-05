// tools/lib/math-label-substitute.js
import fs from 'fs';
import path from 'path';
import { collectMathTokens, bucketToken } from './math-label-inventory.js';

const FORBIDDEN_XML = /[<>&"']/;

/**
 * Build a lowercase-English → Icelandic map from the unified glossary, keeping
 * only approved terms with a non-empty Icelandic (the ~330 empty-Icelandic terms
 * must never substitute a blank).
 * @param {{terms?: Array<{english?:string,icelandic?:string,status?:string}>}} glossary
 * @returns {Map<string,string>}
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
  return map;
}

/**
 * Resolve one label to its rendered value per the locked precedence.
 * @param {string} label
 * @param {{overlay?:Record<string,string>, glossaryMap?:Map<string,string>}} ctx
 * @returns {{value:string, source:'overlay-translated'|'overlay-self'|'glossary'|'english'}}
 */
export function resolveLabel(label, { overlay = {}, glossaryMap = new Map() } = {}) {
  const ov = overlay[label];
  if (typeof ov === 'string' && ov.length > 0) {
    return ov === label
      ? { value: label, source: 'overlay-self' }
      : { value: ov, source: 'overlay-translated' };
  }
  const g = glossaryMap.get(label);
  if (typeof g === 'string' && g.trim()) return { value: g, source: 'glossary' };
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
    const trimmed = inner.trim();
    if (!trimmed) return full;
    const { value, source } = resolve(trimmed);
    if (source !== 'english' && FORBIDDEN_XML.test(value)) {
      throw new Error(
        `math-label substitution: value "${value}" for "${trimmed}" contains a forbidden XML character`
      );
    }
    if (value === trimmed) return full;
    return open + inner.replace(trimmed, value) + close;
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
 * @returns {{resolve:Function, overlay:Record<string,string>, glossaryMap:Map<string,string>}}
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
  const glossaryMap = buildGlossaryMap(glossary);
  return { resolve: buildResolver({ overlay, glossaryMap }), overlay, glossaryMap };
}
