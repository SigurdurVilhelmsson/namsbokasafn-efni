/**
 * mathml-to-latex.js
 *
 * Convert MathML to LaTeX for equation preservation in the extract-inject pipeline.
 * Based on the conversion logic from cnxml-to-md.js
 */

/**
 * Convert MathML markup to LaTeX string.
 * @param {string} mathml - MathML content (with or without m: namespace prefix)
 * @returns {string} LaTeX representation
 */
export function convertMathMLToLatex(mathml) {
  // Remove namespace prefix for easier processing
  let latex = mathml.replace(/m:/g, '');

  // Handle fractions first (before removing tags)
  latex = latex.replace(/<mfrac>([\s\S]*?)<\/mfrac>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const num = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const den = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      return '\\frac{' + num + '}{' + den + '}';
    }
    return match;
  });

  // Handle superscripts
  latex = latex.replace(/<msup>([\s\S]*?)<\/msup>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const exp = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      return '{' + base + '}^{' + exp + '}';
    }
    return match;
  });

  // Handle subscripts
  latex = latex.replace(/<msub>([\s\S]*?)<\/msub>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const sub = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      return '{' + base + '}_{' + sub + '}';
    }
    return match;
  });

  // Handle subsup (both subscript and superscript)
  latex = latex.replace(/<msubsup>([\s\S]*?)<\/msubsup>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 3) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const sub = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      const sup = convertMathMLToLatex('<math>' + parts[2] + '</math>');
      return '{' + base + '}_{' + sub + '}^{' + sup + '}';
    }
    return match;
  });

  // Handle square roots
  latex = latex.replace(/<msqrt>([\s\S]*?)<\/msqrt>/g, (match, content) => {
    const inner = convertMathMLToLatex('<math>' + content + '</math>');
    return '\\sqrt{' + inner + '}';
  });

  // Handle mroot (nth root)
  latex = latex.replace(/<mroot>([\s\S]*?)<\/mroot>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const index = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      return '\\sqrt[' + index + ']{' + base + '}';
    }
    return match;
  });

  // Handle mover (overscript - often used for vectors, bars)
  latex = latex.replace(/<mover>([\s\S]*?)<\/mover>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const over = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      // Check for common overscripts
      if (over === '→' || over === '\\rightarrow') {
        return '\\vec{' + base + '}';
      } else if (over === '¯' || over === '−') {
        return '\\overline{' + base + '}';
      }
      return '\\overset{' + over + '}{' + base + '}';
    }
    return match;
  });

  // Handle munder (underscript)
  latex = latex.replace(/<munder>([\s\S]*?)<\/munder>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const under = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      return '\\underset{' + under + '}{' + base + '}';
    }
    return match;
  });

  // Handle munderover (both under and over scripts)
  latex = latex.replace(/<munderover>([\s\S]*?)<\/munderover>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 3) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const under = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      const over = convertMathMLToLatex('<math>' + parts[2] + '</math>');
      return '\\underset{' + under + '}{\\overset{' + over + '}{' + base + '}}';
    }
    return match;
  });

  // Handle mtable (matrices and aligned equations)
  latex = latex.replace(/<mtable[^>]*>([\s\S]*?)<\/mtable>/g, (match, content) => {
    const rows = [];
    const rowPattern = /<mtr>([\s\S]*?)<\/mtr>/g;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(content)) !== null) {
      const cells = [];
      const cellPattern = /<mtd[^>]*>([\s\S]*?)<\/mtd>/g;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
        cells.push(convertMathMLToLatex('<math>' + cellMatch[1] + '</math>'));
      }
      rows.push(cells.join(' & '));
    }
    // Use aligned environment for equation arrays
    return '\\begin{aligned}\n' + rows.join(' \\\\\n') + '\n\\end{aligned}';
  });

  // Handle menclose (for cancel, strikethrough, etc.)
  latex = latex.replace(
    /<menclose\s+notation="([^"]*)"[^>]*>([\s\S]*?)<\/menclose>/g,
    (match, notation, content) => {
      const inner = convertMathMLToLatex('<math>' + content + '</math>');
      if (notation === 'horizontalstrike') {
        return '\\sout{' + inner + '}';
      }
      return inner;
    }
  );

  // Standard conversions
  const conversions = [
    [/<math[^>]*>/g, ''],
    [/<\/math>/g, ''],
    [/<mrow>/g, '{'],
    [/<\/mrow>/g, '}'],
    [/<semantics>/g, ''],
    [/<\/semantics>/g, ''],
    [/<annotation[^>]*>[\s\S]*?<\/annotation>/g, ''],
    [/<mn[^>]*>([^<]+)<\/mn>/g, '$1'],
    [/<mi mathvariant="normal">([^<]+)<\/mi>/g, '\\mathrm{$1}'],
    [/<mi mathvariant="italic">([^<]+)<\/mi>/g, '$1'],
    [/<mi>([^<]+)<\/mi>/g, '$1'],
    [/<mtext[^>]*>([^<]+)<\/mtext>/g, '\\text{$1}'],
    [/<mstyle mathvariant="italic">([^<]+)<\/mstyle>/g, '$1'],
    [/<mstyle[^>]*>([\s\S]*?)<\/mstyle>/g, '$1'],

    // Operators
    [/<mo>×<\/mo>/g, '\\times '],
    [/<mo>−<\/mo>/g, '-'],
    [/<mo>\+<\/mo>/g, '+'],
    [/<mo>=<\/mo>/g, '='],
    [/<mo>⟶<\/mo>/g, '\\longrightarrow '],
    [/<mo stretchy="false">⟶<\/mo>/g, '\\longrightarrow '],
    [/<mo>→<\/mo>/g, '\\rightarrow '],
    [/<mo>←<\/mo>/g, '\\leftarrow '],
    [/<mo>⇌<\/mo>/g, '\\rightleftharpoons '],
    [/<mo stretchy="false">\(<\/mo>/g, '('],
    [/<mo stretchy="false">\)<\/mo>/g, ')'],
    [/<mo>\(<\/mo>/g, '('],
    [/<mo>\)<\/mo>/g, ')'],
    [/<mo>\[<\/mo>/g, '['],
    [/<mo>\]<\/mo>/g, ']'],
    [/<mo>±<\/mo>/g, '\\pm '],
    [/<mo>∓<\/mo>/g, '\\mp '],
    [/<mo>≈<\/mo>/g, '\\approx '],
    [/<mo>≤<\/mo>/g, '\\leq '],
    [/<mo>≥<\/mo>/g, '\\geq '],
    [/<mo>≠<\/mo>/g, '\\neq '],
    [/<mo>°<\/mo>/g, '^{\\circ}'],
    [/<mo>∞<\/mo>/g, '\\infty '],
    [/<mo>∑<\/mo>/g, '\\sum '],
    [/<mo>∏<\/mo>/g, '\\prod '],
    [/<mo>∫<\/mo>/g, '\\int '],
    [/<mo>∂<\/mo>/g, '\\partial '],
    [/<mo>Δ<\/mo>/g, '\\Delta '],
    [/<mo>·<\/mo>/g, '\\cdot '],
    [/<mo>…<\/mo>/g, '\\ldots '],
    [/<mo>([^<]+)<\/mo>/g, '$1'],

    // Spacing
    [/<mspace[^>]*width="0\.2em"[^>]*(?:\/>|><\/mspace>)/g, '\\, '],
    [/<mspace[^>]*width="0\.1em"[^>]*(?:\/>|><\/mspace>)/g, '\\, '],
    [/<mspace[^>]*(?:\/>|><\/mspace>)/g, '\\, '],

    // Cleanup
    [/<[^>]+>/g, ''],
    [/\s+/g, ' '],
    [/\{\s*\}/g, ''],
    [/\{\s+/g, '{'],
    [/\s+\}/g, '}'],
  ];

  for (const [pattern, replacement] of conversions) {
    latex = latex.replace(pattern, replacement);
  }

  return latex.trim();
}

/**
 * Split MathML content into top-level parts.
 * Used to extract numerator/denominator from fractions, etc.
 * @param {string} content - MathML content
 * @returns {Array<string>} Array of top-level content parts
 */
function splitMathParts(content) {
  content = content.trim();
  const parts = [];
  let depth = 0;
  let current = '';
  let inTag = false;
  let tagBuffer = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '<') {
      inTag = true;
      tagBuffer = '<';
    } else if (char === '>' && inTag) {
      inTag = false;
      tagBuffer += '>';
      if (tagBuffer.startsWith('</')) depth--;
      else if (!tagBuffer.endsWith('/>')) depth++;
      current += tagBuffer;
      tagBuffer = '';
      if (depth === 0 && current.trim()) {
        parts.push(current.trim());
        current = '';
      }
    } else if (inTag) {
      tagBuffer += char;
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Check if a string contains MathML.
 * @param {string} str - String to check
 * @returns {boolean} True if contains MathML
 */
export function containsMathML(str) {
  return /<m:math|<math/.test(str);
}

/**
 * Extract all MathML blocks from a string.
 * @param {string} str - String containing MathML
 * @returns {Array<string>} Array of MathML strings
 */
export function extractAllMathML(str) {
  const equations = [];
  const pattern = /<m:math[^>]*>[\s\S]*?<\/m:math>/g;
  let match;
  while ((match = pattern.exec(str)) !== null) {
    equations.push(match[0]);
  }
  return equations;
}

// =====================================================================
// NUMBER LOCALIZATION
// =====================================================================

/**
 * Detect the number notation format of a string from an <m:mn> element.
 *
 * Returns:
 *   'us'        – contains US-format numbers (period decimal, comma thousands)
 *   'is'        – contains Icelandic-format numbers (comma decimal, period thousands)
 *   'integer'   – plain integer(s) with no decimal or thousands punctuation
 *   'none'      – no numeric content detected
 *
 * Disambiguation of "digit.3digits" (e.g., 4.184):
 *   This pattern is ambiguous — it could be a US decimal (4.184) or an
 *   IS thousands number (4,184 in IS = 4184). We resolve this by requiring
 *   UNAMBIGUOUS evidence for IS format:
 *
 *   Unambiguous IS indicators:
 *     - Comma as decimal: digit,digit (not followed by exactly 3 digits)
 *       e.g., "2,54" or "4,18" — clearly IS decimal
 *     - Multiple period-groups: digit.3digits.3digits (e.g., "1.234.567")
 *     - Combined IS pattern: digit.3digits,digits (e.g., "1.234,56")
 *
 *   Unambiguous US indicators:
 *     - Period as decimal: digit.digit (where post-period is not exactly 3 digits)
 *       e.g., "2.5" or "4.18" — clearly US decimal
 *     - Comma as thousands: digit,3digits (e.g., "10,500")
 *     - Combined US pattern: digit,3digits.digits (e.g., "1,234.56")
 *
 *   Ambiguous (classified as US by default since source is always US):
 *     - "4.184" — single period+3digits, no comma context
 *
 * @param {string} str - Content of an <m:mn> element
 * @returns {'us'|'is'|'integer'|'none'}
 */
export function detectNumberFormat(str) {
  const s = str.trim();
  if (!s || !/\d/.test(s)) return 'none';

  const hasPeriod = /\d\.\d/.test(s);
  const hasComma = /\d,\d/.test(s);

  // No punctuation → integer
  if (!hasPeriod && !hasComma) return 'integer';

  // BOTH period and comma present → unambiguous classification
  if (hasPeriod && hasComma) {
    // US: comma-thousands + period-decimal  (e.g., "1,234.56")
    // IS: period-thousands + comma-decimal  (e.g., "1.234,56")
    const usPattern = /\d,\d{3}[^,]*\.\d/;  // comma-group then decimal point
    const isPattern = /\d\.\d{3}[^.]*,\d/;  // period-group then decimal comma
    if (usPattern.test(s)) return 'us';
    if (isPattern.test(s)) return 'is';
    // Fallback: treat as US
    return 'us';
  }

  // ONLY comma present
  if (hasComma && !hasPeriod) {
    // US thousands: digit,3digits at end (e.g., "10,500")
    if (/^\d{1,3}(,\d{3})+$/.test(s.replace(/^[−–+-]/, ''))) return 'us';
    // IS decimal: comma NOT followed by exactly 3 digits at end
    // e.g., "2,54" or "4,1842"
    return 'is';
  }

  // ONLY period present
  if (hasPeriod && !hasComma) {
    // Multiple period-groups → IS thousands (e.g., "1.234.567")
    if (/\d\.\d{3}\.\d{3}/.test(s)) return 'is';

    // Single period: check if it's an ambiguous "digit.3digits" pattern
    // If the decimal portion is NOT exactly 3 digits, it's unambiguously US
    // e.g., "2.5", "4.18", "3.1415" → US decimal
    const decimalMatch = s.match(/\d\.(\d+)$/);
    if (decimalMatch && decimalMatch[1].length !== 3) return 'us';

    // "digit.3digits" (e.g., "4.184") — ambiguous between:
    //   US decimal 4.184 and IS thousands 4.184 (= 4184)
    // Default to US since the OpenStax source always uses US format.
    // After localization this becomes "4,184" (IS decimal), which has
    // only-comma and will be classified as IS by the comma branch above.
    return 'us';
  }

  return 'integer';
}

/**
 * Scan all <m:mn> elements in a MathML string and classify the overall
 * number notation.
 *
 * @param {string} mathml - MathML string (with m: namespace prefix)
 * @returns {{format: 'us'|'is'|'integer'|'none'|'mixed', counts: {us: number, is: number, integer: number}, details: Array}}
 */
export function detectMathMLNumberFormat(mathml) {
  const counts = { us: 0, is: 0, integer: 0, localized: 0 };
  const details = [];

  const mnPattern = /<m:mn(\s[^>]*)?>([^<]+)<\/m:mn>/g;
  let match;
  while ((match = mnPattern.exec(mathml)) !== null) {
    const attrs = match[1] || '';
    const content = match[2];

    // Check for the data-localized marker (set by localizeNumbersInMathML)
    if (attrs.includes('data-localized="is"')) {
      counts.localized++;
      details.push({ content, format: 'localized', marker: true });
      continue;
    }

    const fmt = detectNumberFormat(content);
    if (fmt !== 'none') {
      counts[fmt] = (counts[fmt] || 0) + 1;
      if (fmt === 'us' || fmt === 'is') {
        details.push({ content, format: fmt });
      }
    }
  }

  // Also report <m:mtext> elements that contain numbers, but DO NOT count
  // them toward the overall format classification. mtext content mixes text
  // with numbers (e.g., "18,140 J") making format detection unreliable.
  // These are reported in details for informational purposes only.
  const mtextPattern = /<m:mtext(\s[^>]*)?>([^<]+)<\/m:mtext>/g;
  while ((match = mtextPattern.exec(mathml)) !== null) {
    const attrs = match[1] || '';
    const content = match[2];

    if (attrs.includes('data-localized="is"')) {
      details.push({ content, format: 'localized', marker: true, element: 'mtext' });
      continue;
    }

    // Only report numbers in mtext as informational details (not counted)
    if (/\d[.,]\d/.test(content)) {
      const fmt = detectNumberFormat(content);
      details.push({ content, format: fmt, element: 'mtext', informational: true });
    }
  }

  let format;
  if (counts.localized > 0 && counts.us === 0 && counts.is === 0) format = 'localized';
  else if (counts.us > 0 && counts.is > 0) format = 'mixed';
  else if (counts.us > 0) format = 'us';
  else if (counts.is > 0) format = 'is';
  else if (counts.localized > 0) format = 'localized';
  else if (counts.integer > 0) format = 'integer';
  else format = 'none';

  return { format, counts, details };
}

/**
 * Localize number formatting in MathML for Icelandic conventions.
 *
 * Icelandic uses comma as decimal separator and period for thousands:
 *   US: 2.54       → IS: 2,54
 *   US: 10,500     → IS: 10.500
 *
 * Applied to <m:mn> and <m:mtext> elements before rendering/conversion
 * so that both the SVG visual and the data-latex attribute reflect
 * Icelandic number format.
 *
 * IDEMPOTENCY GUARD: Uses a `data-localized="is"` attribute on converted
 * elements to prevent destructive double-application. Numbers like "4.184"
 * become "4,184" after localization, which is indistinguishable from US
 * thousands by pattern alone (the conversion is an involution for 3-digit
 * decimals). The attribute provides an unambiguous signal that conversion
 * has already been applied.
 *
 * Downstream compatibility:
 *   - convertMathMLToLatex: uses <mn[^>]*> to match with or without attributes
 *   - MathJax renderMathML: ignores unknown data-* attributes on MathML elements
 *
 * @param {string} mathml - MathML string (with m: namespace prefix)
 * @returns {string} MathML with localized number formatting
 */
export function localizeNumbersInMathML(mathml) {
  // Localize numbers in <m:mn> elements (decimal point + thousands separator)
  let result = mathml.replace(/<m:mn(\s[^>]*)?>([^<]+)<\/m:mn>/g, (_match, attrs, content) => {
    // Idempotency guard: skip elements already marked as localized
    if (attrs && attrs.includes('data-localized="is"')) {
      return _match;
    }
    const localized = localizeNumberFull(content);
    if (localized !== content) {
      // Content changed — mark as localized to prevent re-conversion
      return '<m:mn data-localized="is">' + localized + '</m:mn>';
    }
    return '<m:mn' + (attrs || '') + '>' + content + '</m:mn>';
  });

  // Localize decimal numbers in <m:mtext> elements
  // Only convert decimal points — commas in mtext may be textual punctuation
  result = result.replace(/<m:mtext(\s[^>]*)?>([^<]+)<\/m:mtext>/g, (_match, attrs, content) => {
    if (attrs && attrs.includes('data-localized="is"')) {
      return _match;
    }
    const localized = localizeDecimalPoint(content);
    if (localized !== content) {
      return '<m:mtext data-localized="is">' + localized + '</m:mtext>';
    }
    return '<m:mtext' + (attrs || '') + '>' + content + '</m:mtext>';
  });

  return result;
}

/**
 * Convert both decimal points and thousands separators.
 * For use in <mn> elements where commas are always thousands separators.
 */
function localizeNumberFull(str) {
  // Step 1: Protect thousands comma (digit,3digits not followed by digit) with placeholder
  let result = str.replace(/(\d),(\d{3})(?!\d)/g, '$1\u2800$2');
  // Step 2: Decimal point → comma
  result = result.replace(/(\d)\.(\d)/g, '$1,$2');
  // Step 3: Placeholder → period (Icelandic thousands separator)
  result = result.replace(/\u2800/g, '.');
  return result;
}

/**
 * Convert only decimal points (digit.digit → digit,digit).
 * Safe for text content where commas may be textual.
 */
function localizeDecimalPoint(str) {
  return str.replace(/(\d)\.(\d)/g, '$1,$2');
}

/**
 * Verify that localizeNumbersInMathML produced correct output by comparing
 * source (US) numbers against localized (IS) numbers.
 *
 * Returns an array of issues found. Empty array means all conversions are correct.
 *
 * @param {string} sourceMathml - Original MathML (US notation)
 * @param {string} localizedMathml - Localized MathML (should be IS notation)
 * @returns {Array<{type: string, source: string, localized: string, message: string}>}
 */
export function verifyLocalization(sourceMathml, localizedMathml) {
  const issues = [];

  // Extract <m:mn> values from both (handle optional attributes in localized)
  const sourceNumbers = [];
  const localizedNumbers = [];

  const srcPattern = /<m:mn(?:\s[^>]*)?>([^<]+)<\/m:mn>/g;
  const locPattern = /<m:mn(?:\s[^>]*)?>([^<]+)<\/m:mn>/g;
  let match;

  while ((match = srcPattern.exec(sourceMathml)) !== null) {
    sourceNumbers.push(match[1]);
  }
  while ((match = locPattern.exec(localizedMathml)) !== null) {
    localizedNumbers.push(match[1]);
  }

  if (sourceNumbers.length !== localizedNumbers.length) {
    issues.push({
      type: 'count-mismatch',
      source: `${sourceNumbers.length} numbers`,
      localized: `${localizedNumbers.length} numbers`,
      message: 'Different number of <m:mn> elements in source vs localized',
    });
    return issues;
  }

  for (let i = 0; i < sourceNumbers.length; i++) {
    const src = sourceNumbers[i];
    const loc = localizedNumbers[i];
    const srcFmt = detectNumberFormat(src);

    if (srcFmt === 'integer') {
      // Integers should not change
      if (src !== loc) {
        issues.push({
          type: 'integer-changed',
          source: src,
          localized: loc,
          message: `Plain integer "${src}" was unexpectedly changed to "${loc}"`,
        });
      }
      continue;
    }

    if (srcFmt === 'us') {
      // Verify conversion happened (source and localized should differ)
      if (src === loc) {
        issues.push({
          type: 'unconverted',
          source: src,
          localized: loc,
          message: `Number not converted: "${src}" unchanged after localization`,
        });
        continue;
      }

      // Verify numeric value is preserved:
      // Parse source as US, parse localized as IS (since we know conversion was US→IS)
      const srcVal = parseLocalizedNumber(src, 'us');
      const locVal = parseLocalizedNumber(loc, 'is');
      if (srcVal !== null && locVal !== null && Math.abs(srcVal - locVal) > 1e-10) {
        issues.push({
          type: 'value-changed',
          source: src,
          localized: loc,
          message: `Numeric value changed: "${src}" (${srcVal}) → "${loc}" parsed as IS (${locVal})`,
        });
      }
    }
  }

  return issues;
}

/**
 * Parse a number string in either US or IS format to a float.
 * @param {string} str - Number string
 * @param {'us'|'is'|'integer'|'none'} format - Detected format
 * @returns {number|null}
 */
function parseLocalizedNumber(str, format) {
  const s = str.trim().replace(/[−–]/g, '-'); // normalize minus signs
  try {
    if (format === 'integer' || format === 'none') {
      return parseFloat(s);
    } else if (format === 'us') {
      // Remove thousands commas, keep decimal point
      return parseFloat(s.replace(/,/g, ''));
    } else if (format === 'is') {
      // Remove thousands periods, convert decimal comma to point
      return parseFloat(s.replace(/\./g, '').replace(/,/g, '.'));
    }
  } catch {
    return null;
  }
  return null;
}
