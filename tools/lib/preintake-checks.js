/**
 * preintake-checks.js — pure structural checks for the D2 pre-intake probe.
 * No I/O. Each check is tied to a proven pipeline failure mode.
 */

import { DOMParser } from '@xmldom/xmldom';

/** Inline tags the extractor converts to markers (everything else gets stripped). */
export const HANDLED_INLINE = new Set([
  'emphasis',
  'sub',
  'sup',
  'link',
  'term',
  'footnote',
  'newline',
  'space',
  'math', // <m:math> localName is 'math'
]);

/** Inline-only text containers whose direct element children must be handled inline. */
export const TEXT_CONTAINERS = ['para', 'title', 'caption', 'label', 'meaning'];

/** Note class values present in the CNXML (deduped); notes without a class are ignored. */
function extractNoteClasses(cnxml) {
  const out = new Set();
  const re = /<note\b[^>]*\bclass="([^"]+)"/g;
  let m;
  while ((m = re.exec(cnxml)) !== null) out.add(m[1]);
  return [...out];
}

/**
 * Direct element children of inline-only text containers whose localName is not
 * a handled inline tag — these get stripped by the extractor. DOM-scoped so
 * MathML internals (grandchildren under <m:math>) are never examined.
 */
function findUnrecognizedInline(cnxml) {
  const counts = {};
  let doc;
  try {
    // Silence the parser; a malformed file just yields no findings.
    doc = new DOMParser({ onError: () => {} }).parseFromString(cnxml, 'text/xml');
  } catch {
    return counts;
  }
  if (!doc || !doc.documentElement) return counts;

  for (const container of TEXT_CONTAINERS) {
    const nodes = doc.getElementsByTagName(container);
    for (let i = 0; i < nodes.length; i++) {
      for (let c = nodes[i].firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue; // element nodes only
        const name = c.localName || c.nodeName.replace(/^.*:/, '');
        if (!HANDLED_INLINE.has(name)) {
          counts[name] = (counts[name] || 0) + 1;
        }
      }
    }
  }
  return counts;
}

/**
 * Per-file structural findings.
 * @param {string} cnxml
 * @returns {{osEmbed:number, iframe:number, hasTerm:boolean, hasGlossary:boolean,
 *            noteClasses:string[], unrecognizedInline:Record<string,number>}}
 */
export function runFileChecks(cnxml) {
  const text = String(cnxml || '');
  return {
    osEmbed: (text.match(/class="os-embed"/g) || []).length,
    iframe: (text.match(/<iframe\b/g) || []).length,
    hasTerm: /<term\b/.test(text),
    hasGlossary: /<glossary\b/.test(text),
    noteClasses: extractNoteClasses(text),
    unrecognizedInline: findUnrecognizedInline(text),
  };
}
