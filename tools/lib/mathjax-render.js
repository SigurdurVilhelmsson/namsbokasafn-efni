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

// Initialize MathJax once (reused across all calls)
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

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
