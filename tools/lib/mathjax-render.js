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

// Inline visually-hidden style (the standard sr-only clip technique). Inline so
// the assistive MathML is hidden without any external stylesheet — the rendered
// HTML is self-contained and needs no vefur CSS rule.
const VISUALLY_HIDDEN_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
  'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';

/**
 * Build a visually-hidden, screen-reader-only MathML sibling from source MathML.
 * The renderer's input IS MathML, so the accessible representation is free to
 * emit — we just decline to discard it. Returns '' when there is no parseable
 * <math>…</math>, so the visual SVG ships alone (degrade, don't crash).
 * @param {string} cleanMml - MathML with the m: namespace prefix already stripped
 * @param {boolean} displayMode - true for block equations
 * @returns {string} the <math …>…</math> string, or '' if no <math> present
 */
export function buildAssistiveMml(cleanMml, displayMode) {
  const mathMatch = cleanMml.match(/<math\b[\s\S]*?<\/math>/i);
  if (!mathMatch) return '';
  const inner = mathMatch[0];
  const attrs = [
    'class="assistive-mathml"',
    /\bxmlns=/.test(inner) ? '' : 'xmlns="http://www.w3.org/1998/Math/MathML"',
    displayMode && !/\bdisplay=/.test(inner) ? 'display="block"' : '',
    `style="${VISUALLY_HIDDEN_STYLE}"`,
  ]
    .filter(Boolean)
    .join(' ');
  return inner.replace(/^<math\b/i, `<math ${attrs}`);
}

/**
 * Render MathML to self-contained SVG string with assistive MathML sibling.
 * @param {string} mml - MathML markup (with or without m: namespace prefix)
 * @param {boolean} displayMode - True for block equations
 * @returns {string} SVG HTML string followed by visually-hidden <math> sibling
 */
export function renderMathML(mml, displayMode = true) {
  // Strip namespace prefix if present
  const cleanMml = mml.replace(/<(\/?)m:/g, '<$1');

  const node = doc.convert(cleanMml, { display: displayMode });
  let visual = adaptor.outerHTML(node);

  // Add crisp rendering attributes to prevent antialiasing
  visual = visual.replace(
    /<svg/,
    '<svg shape-rendering="geometricPrecision" text-rendering="geometricPrecision"'
  );

  // The SVG is purely visual; hide it from assistive tech (it is a nameless
  // role="img"). The accessible representation is the MathML sibling below.
  visual = visual.replace(/<mjx-container\b/, '<mjx-container aria-hidden="true"');

  return visual + buildAssistiveMml(cleanMml, displayMode);
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
