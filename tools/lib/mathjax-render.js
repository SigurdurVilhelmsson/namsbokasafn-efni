/**
 * mathjax-render.js
 *
 * Server-side MathJax rendering: MathML → SVG and LaTeX → SVG.
 * Replaces the lossy MathML → LaTeX → KaTeX pipeline.
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { MathML } from 'mathjax-full/js/input/mathml.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

// Helvetica character widths in em units (from standard Helvetica AFM data).
// MathJax's liteAdaptor estimates all characters at 0.6em, which over-allocates
// space for Helvetica text in <mtext> elements by ~25%. This table provides
// accurate per-character widths for the monkey-patched nodeSize() below.
const HELVETICA_WIDTHS = {
  // Lowercase
  a: 0.556,
  b: 0.556,
  c: 0.5,
  d: 0.556,
  e: 0.556,
  f: 0.278,
  g: 0.556,
  h: 0.556,
  i: 0.222,
  j: 0.222,
  k: 0.5,
  l: 0.222,
  m: 0.833,
  n: 0.556,
  o: 0.556,
  p: 0.556,
  q: 0.556,
  r: 0.333,
  s: 0.5,
  t: 0.278,
  u: 0.556,
  v: 0.5,
  w: 0.722,
  x: 0.5,
  y: 0.5,
  z: 0.5,
  // Uppercase
  A: 0.667,
  B: 0.667,
  C: 0.722,
  D: 0.722,
  E: 0.667,
  F: 0.611,
  G: 0.778,
  H: 0.722,
  I: 0.278,
  J: 0.5,
  K: 0.667,
  L: 0.556,
  M: 0.833,
  N: 0.722,
  O: 0.778,
  P: 0.667,
  Q: 0.778,
  R: 0.722,
  S: 0.667,
  T: 0.611,
  U: 0.722,
  V: 0.667,
  W: 0.944,
  X: 0.667,
  Y: 0.667,
  Z: 0.611,
  // Digits (tabular — all identical)
  0: 0.556,
  1: 0.556,
  2: 0.556,
  3: 0.556,
  4: 0.556,
  5: 0.556,
  6: 0.556,
  7: 0.556,
  8: 0.556,
  9: 0.556,
  // Icelandic lowercase
  á: 0.556,
  é: 0.556,
  í: 0.222,
  ó: 0.556,
  ú: 0.556,
  ý: 0.5,
  ð: 0.556,
  þ: 0.556,
  æ: 0.889,
  ö: 0.556,
  // Icelandic uppercase
  Á: 0.667,
  É: 0.667,
  Í: 0.278,
  Ó: 0.778,
  Ú: 0.722,
  Ý: 0.667,
  Ð: 0.722,
  Þ: 0.667,
  Æ: 1.0,
  Ö: 0.778,
  // Punctuation and operators
  ' ': 0.278,
  ',': 0.278,
  '.': 0.278,
  ':': 0.278,
  ';': 0.278,
  '(': 0.333,
  ')': 0.333,
  '=': 0.584,
  '+': 0.584,
  '-': 0.333,
  '/': 0.278,
  '×': 0.584,
};

// Initialize MathJax once (reused across all calls)
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

// Override nodeSize() to use accurate Helvetica metrics instead of the
// default 0.6em-per-character estimate.  Only affects -explicitFont text
// nodes (our <mtext> content); TeX math symbols use pre-computed metrics.
const origNodeSize = adaptor.nodeSize.bind(adaptor);
adaptor.nodeSize = function (node, em = 1, local = null) {
  const text = adaptor.textContent(node);
  if (!text) return origNodeSize(node, em, local);
  let width = 0;
  for (const char of text) {
    width += HELVETICA_WIDTHS[char] ?? 0.55;
  }
  return [width, 0.8];
};

const mathmlInput = new MathML();
const svgOutput = new SVG({
  fontCache: 'local',
  internalSpeechTitles: false,
  scale: 1,
  minScale: 0.5,
  mtextInheritFont: true,
  mtextFont: 'Helvetica, Arial, sans-serif',
  merrorInheritFont: false,
  mathmlSpacing: false,
  skipAttributes: {},
  exFactor: 0.5,
  displayAlign: 'center',
  displayIndent: '0',
});
const mathmlDoc = mathjax.document('', {
  InputJax: mathmlInput,
  OutputJax: svgOutput,
});

const texInput = new TeX({ packages: AllPackages });
const svgOutputTex = new SVG({
  fontCache: 'local',
  internalSpeechTitles: false,
  scale: 1,
  minScale: 0.5,
  mtextInheritFont: true,
  mtextFont: 'Helvetica, Arial, sans-serif',
  merrorInheritFont: false,
  mathmlSpacing: false,
  skipAttributes: {},
  exFactor: 0.5,
  displayAlign: 'center',
  displayIndent: '0',
});
const texDoc = mathjax.document('', {
  InputJax: texInput,
  OutputJax: svgOutputTex,
});

/**
 * Render MathML to self-contained SVG string.
 * @param {string} mml - MathML markup (with or without m: namespace prefix)
 * @param {boolean} displayMode - True for block equations
 * @returns {string} SVG HTML string
 */
export function renderMathML(mml, displayMode = true) {
  // Strip namespace prefix if present
  const cleanMml = mml.replace(/<(\/?)m:/g, '<$1');

  const node = mathmlDoc.convert(cleanMml, { display: displayMode });
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
 * Used by cnxml-extract-chapter-resources.js which has LaTeX strings,
 * not raw MathML.
 * @param {string} latex - LaTeX string
 * @param {boolean} displayMode - True for block equations
 * @returns {string} SVG HTML string
 */
export function renderLatex(latex, displayMode = true) {
  const node = texDoc.convert(latex, { display: displayMode });
  let svg = adaptor.outerHTML(node);

  // Add crisp rendering attributes to prevent antialiasing
  svg = svg.replace(
    /<svg/,
    '<svg shape-rendering="geometricPrecision" text-rendering="geometricPrecision"'
  );

  return svg;
}
