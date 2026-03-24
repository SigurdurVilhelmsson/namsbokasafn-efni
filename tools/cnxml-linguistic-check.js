/**
 * cnxml-linguistic-check.js — Compare text content between source and translated CNXML
 *
 * Complements cnxml-fidelity-check.js (which checks structural tag counts) by
 * checking whether the TEXT CONTENT was actually translated. Flags leaf-level
 * elements where the plain text is identical between source and translated,
 * indicating the text was likely never translated.
 *
 * Motivation: a bug in the extraction tool meant list items inside <note>
 * elements were never extracted for translation. The structural fidelity check
 * couldn't detect this because the tag counts matched (the untranslated English
 * lists were preserved as-is). This tool catches that class of bug.
 */

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_MIN_LENGTH = 15;
const LEAF_TAGS = ['para', 'item', 'caption'];

// ─── Pre-processing ─────────────────────────────────────────────────

/**
 * Strip metadata and MathML blocks from CNXML before extraction.
 * These contain content that is legitimately identical in both languages.
 */
function preprocess(cnxml) {
  let result = cnxml;
  // Strip <metadata>...</metadata> blocks
  result = result.replace(/<metadata[\s\S]*?<\/metadata>/g, '');
  // Strip <m:math>...</m:math> blocks
  result = result.replace(/<m:math[\s\S]*?<\/m:math>/g, '');
  return result;
}

// ─── Element Extraction ─────────────────────────────────────────────

/**
 * Extract leaf-level elements with id attributes from CNXML.
 * Returns a Map of id → { tag, text } where text is the plain text
 * content with all inner XML tags stripped.
 */
function extractLeafElements(cnxml) {
  const elements = new Map();

  for (const tag of LEAF_TAGS) {
    const regex = new RegExp(`<(${tag})\\s+[^>]*?id="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
    let match;
    while ((match = regex.exec(cnxml)) !== null) {
      const [, tagName, id, rawContent] = match;
      // Strip all inner XML tags to get plain text
      const text = rawContent.replace(/<[^>]+>/g, '').trim();
      elements.set(id, { tag: tagName, text });
    }
  }

  return elements;
}

// ─── Skip Rules ─────────────────────────────────────────────────────

/**
 * Determine whether a text string should be skipped (legitimate English).
 * Returns true if the text should NOT be flagged as untranslated.
 */
function shouldSkip(text, minLength) {
  // Too short
  if (text.length < minLength) return true;

  // Purely numeric, whitespace, or punctuation
  if (/^[\s\d\p{P}]*$/u.test(text)) return true;

  // URL patterns
  if (/^https?:\/\//.test(text)) return true;

  // DOI patterns
  if (/^10\.\d+\//.test(text)) return true;

  return false;
}

// ─── Core Function ──────────────────────────────────────────────────

/**
 * Compare text content between source and translated CNXML.
 * Returns array of { id, tag, text } for untranslated blocks.
 *
 * @param {string} sourceCnxml - Original English CNXML
 * @param {string} translatedCnxml - Translated CNXML
 * @param {object} options
 * @param {number} options.minLength - Minimum text length to check (default: 15)
 * @returns {Array<{id: string, tag: string, text: string}>}
 */
export function findUntranslatedText(sourceCnxml, translatedCnxml, options = {}) {
  const minLength = options.minLength ?? DEFAULT_MIN_LENGTH;

  // Pre-process: strip metadata and MathML
  const sourceClean = preprocess(sourceCnxml);
  const translatedClean = preprocess(translatedCnxml);

  // Extract leaf elements with IDs
  const sourceTexts = extractLeafElements(sourceClean);
  const translatedTexts = extractLeafElements(translatedClean);

  // Compare text for IDs present in both maps
  const flagged = [];

  for (const [id, sourceEntry] of sourceTexts) {
    const translatedEntry = translatedTexts.get(id);
    if (!translatedEntry) continue;

    // Skip if text should be excluded
    if (shouldSkip(sourceEntry.text, minLength)) continue;

    // Flag if text is identical
    if (sourceEntry.text === translatedEntry.text) {
      flagged.push({
        id,
        tag: sourceEntry.tag,
        text: sourceEntry.text,
      });
    }
  }

  return flagged;
}
