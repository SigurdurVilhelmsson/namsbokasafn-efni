/**
 * mathjax-render.js
 *
 * Server-side MathJax rendering: MathML → SVG and LaTeX → SVG.
 * Uses MathJax v4 with New Computer Modern fonts (native Icelandic support).
 */
import MathJax from '@mathjax/src/source';

// Initialize MathJax with component loader (sets up global namespace
// needed by dynamic font files).
await MathJax.init({
  loader: { load: ['input/mml', 'output/svg'] },
  svg: { fontCache: 'local' },
  'adaptors/liteDOM': { fontSize: 16 },
});

// Preload all dynamic font data so that synchronous convert() works.
// Without this, convert() throws "retry" errors for characters in
// dynamically-loaded ranges (including Latin accented characters).
await MathJax.startup.document.outputJax.font.loadDynamicFiles();

const adaptor = MathJax.startup.adaptor;
const doc = MathJax.startup.document;

/**
 * Render MathML to self-contained SVG string.
 * @param {string} mml - MathML markup (with or without m: namespace prefix)
 * @param {boolean} displayMode - True for block equations
 * @returns {string} SVG HTML string
 */
export function renderMathML(mml, displayMode = true) {
  // Strip namespace prefix if present
  const cleanMml = mml.replace(/<(\/?)m:/g, '<$1');

  const node = doc.convert(cleanMml, { display: displayMode });
  let svg = adaptor.outerHTML(node);

  // Add crisp rendering attributes to prevent antialiasing
  svg = svg.replace(
    /<svg/,
    '<svg shape-rendering="geometricPrecision" text-rendering="geometricPrecision"'
  );

  return svg;
}

/**
 * Render LaTeX to self-contained SVG string.
 * Note: Only used by archived tools. Requires input/tex loader.
 * @param {string} latex - LaTeX string
 * @param {boolean} displayMode - True for block equations
 * @returns {string} SVG HTML string
 */
export function renderLatex(latex, displayMode = true) {
  // LaTeX rendering requires input/tex which is not loaded by default.
  // This function is only used by archived tools and will throw if called
  // without loading the tex input jax.
  const node = doc.convert(latex, { display: displayMode });
  let svg = adaptor.outerHTML(node);

  // Add crisp rendering attributes to prevent antialiasing
  svg = svg.replace(
    /<svg/,
    '<svg shape-rendering="geometricPrecision" text-rendering="geometricPrecision"'
  );

  return svg;
}
