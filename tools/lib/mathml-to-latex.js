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
        return '\\cancel{' + inner + '}';
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
    [/<mn>([^<]+)<\/mn>/g, '$1'],
    [/<mi mathvariant="normal">([^<]+)<\/mi>/g, '\\mathrm{$1}'],
    [/<mi mathvariant="italic">([^<]+)<\/mi>/g, '$1'],
    [/<mi>([^<]+)<\/mi>/g, '$1'],
    [/<mtext>([^<]+)<\/mtext>/g, '\\text{$1}'],
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
