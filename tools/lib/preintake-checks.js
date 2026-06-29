/**
 * preintake-checks.js — pure structural checks for the D2 pre-intake probe.
 * No I/O. Each check is tied to a proven pipeline failure mode.
 */

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
    unrecognizedInline: {}, // filled in Task 2
  };
}
