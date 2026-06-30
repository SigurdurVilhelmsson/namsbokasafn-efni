/**
 * cnxml-render-fidelity-check.test.js — A3 acceptance.
 *
 * The plan's acceptance for the render-stage structural check: "a deliberately-
 * broken render (dropped figure, bold<->italic swap, injected NUL) fails the
 * check; clean render passes." These tests feed fixtures straight into the pure
 * checkChapter() (never through the disk driver), so they prove the detection
 * logic independent of any committed baseline or 05-publication state.
 */

import { describe, it, expect } from 'vitest';
import { checkChapter, htmlShapeHistogram } from '../cnxml-render-fidelity-check.js';

// A minimal but representative "chapter": one injected CNXML module + one
// produced HTML page. Counts reconcile: 1 figure/image, 1 em, 1 strong,
// 1 equation (m:math -> mjx-container).
const CNXML = `<document xmlns:m="http://www.w3.org/1998/Math/MathML"><content>
  <figure id="F"><media><image src="fig.svg"/></media></figure>
  <para>Texti með <emphasis effect="italics">skáletri</emphasis> og <emphasis effect="bold">feitletri</emphasis>.</para>
  <equation id="Q" class="unnumbered"><m:math><m:mi>x</m:mi></m:math></equation>
</content></document>`;

const HTML = `<article class="cnx-module">
  <figure id="F"><img src="fig.svg" alt="mynd"/></figure>
  <p>Texti með <em>skáletri</em> og <strong>feitletri</strong>.</p>
  <div id="Q" class="equation unnumbered"><span class="mathjax-display"><mjx-container jax="SVG"></mjx-container></span></div>
</article>`;

// Baseline captured from the clean HTML (by construction the clean render passes).
const BASELINE = htmlShapeHistogram(HTML);

function chapter(html) {
  return { cnxml: [CNXML], html: [html] };
}

describe('render-fidelity check — clean render', () => {
  it('produces no findings for a clean, consistent chapter', () => {
    expect(checkChapter(chapter(HTML), BASELINE)).toEqual([]);
  });
});

describe('render-fidelity check — dropped figure', () => {
  it('flags a dropped <figure>/<img> (shape-drift + cross-stage drop)', () => {
    const broken = HTML.replace(/<figure[\s\S]*?<\/figure>\s*/, '');
    const findings = checkChapter(chapter(broken), BASELINE);
    // shape-drift on the figure and img buckets
    expect(
      findings.some((f) => f.type === 'shape-drift' && f.bucket === 'figure' && f.delta === -1)
    ).toBe(true);
    expect(
      findings.some((f) => f.type === 'shape-drift' && f.bucket === 'img' && f.delta === -1)
    ).toBe(true);
    // and the baseline-free cross-stage invariant catches the image drop too
    expect(findings.some((f) => f.type === 'cross-stage-drop' && f.unit === 'image')).toBe(true);
  });
});

describe('render-fidelity check — bold<->italic swap', () => {
  it('flags an <em> rendered as <strong> (em down, strong up)', () => {
    const broken = HTML.replace('<em>skáletri</em>', '<strong>skáletri</strong>');
    const findings = checkChapter(chapter(broken), BASELINE);
    expect(
      findings.some((f) => f.type === 'shape-drift' && f.bucket === 'em' && f.delta === -1)
    ).toBe(true);
    expect(
      findings.some((f) => f.type === 'shape-drift' && f.bucket === 'strong' && f.delta === 1)
    ).toBe(true);
  });
});

describe('render-fidelity check — injected control char', () => {
  it('flags a NUL byte in produced HTML', () => {
    const broken = HTML.replace('feitletri', 'feit\x00letri');
    const findings = checkChapter(chapter(broken), BASELINE);
    const cc = findings.find((f) => f.type === 'control-char' && f.where === 'produced-html');
    expect(cc).toBeTruthy();
    expect(cc.codes).toContain('0x00');
  });
});

describe('render-fidelity check — dropped equation (the bug class A3 targets)', () => {
  it('flags a dropped equation via the cross-stage math invariant', () => {
    // m:math present in CNXML, mjx-container missing in HTML (the exercise
    // direct-child <equation> drop just fixed in renderExercise).
    const broken = HTML.replace(/<div id="Q"[\s\S]*?<\/div>\s*/, '');
    const findings = checkChapter(chapter(broken), BASELINE);
    expect(
      findings.some((f) => f.type === 'cross-stage-drop' && f.unit === 'math' && f.dropped === 1)
    ).toBe(true);
  });
});

import { identityDiffChapter } from '../cnxml-render-fidelity-check.js';

const M = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>';
const ASSIST = '<math class="assistive-mathml"><mi>x</mi></math>';

describe('fidelity check — identity diff (rollup-masking immune)', () => {
  it('flags an equation present in CNXML but absent from every HTML page', () => {
    const cnxml = [`<content><equation>${M}</equation><equation>${M}</equation></content>`];
    const html = [`<mjx-container></mjx-container>${ASSIST}`]; // only 1 of 2 rendered
    expect(identityDiffChapter({ cnxml, html }).lostCount).toBe(1);
  });

  it('does NOT flag an equation re-presented in a rollup page (no false drop)', () => {
    const cnxml = [`<content><equation>${M}</equation></content>`];
    const html = [
      `<mjx-container></mjx-container>${ASSIST}`,
      `<mjx-container></mjx-container>${ASSIST}`,
    ];
    expect(identityDiffChapter({ cnxml, html }).lostCount).toBe(0);
  });

  it('reports 0 when every equation is present', () => {
    const cnxml = [`<content><equation>${M}</equation></content>`];
    expect(identityDiffChapter({ cnxml, html: [`${ASSIST}`] }).lostCount).toBe(0);
  });
});
