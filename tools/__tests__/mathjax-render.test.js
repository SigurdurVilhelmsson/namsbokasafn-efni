import { describe, it, expect } from 'vitest';
import { renderMathML, buildAssistiveMml } from '../lib/mathjax-render.js';

// E = mc^2 in m:-prefixed MathML, as the pipeline passes it in.
const MML =
  '<m:math><m:mrow><m:mi>E</m:mi><m:mo>=</m:mo><m:mi>m</m:mi>' +
  '<m:msup><m:mi>c</m:mi><m:mn>2</m:mn></m:msup></m:mrow></m:math>';

describe('renderMathML — assistive MathML sibling', () => {
  it('appends exactly one assistive <math> sibling (block)', () => {
    const out = renderMathML(MML, true);
    const count = (out.match(/<math\b[^>]*class="assistive-mathml"/g) || []).length;
    expect(count).toBe(1);
  });

  it('marks the visual mjx-container aria-hidden so AT skips the SVG', () => {
    const out = renderMathML(MML, true);
    expect(out).toMatch(/<mjx-container\b[^>]*aria-hidden="true"/);
  });

  it('hides the assistive <math> with an inline style (no external CSS needed)', () => {
    const out = renderMathML(MML, true);
    const tag = out.match(/<math\b[^>]*class="assistive-mathml"[^>]*>/)[0];
    expect(tag).toMatch(/style="[^"]*position:absolute/);
    expect(tag).toMatch(/clip:rect/);
  });

  it('applies to inline math too (display=false)', () => {
    const out = renderMathML(MML, false);
    expect(out).toMatch(/class="assistive-mathml"/);
    expect(out).toMatch(/<mjx-container\b[^>]*aria-hidden="true"/);
  });

  it('preserves the source MathML content in the sibling', () => {
    const out = renderMathML(MML, true);
    const math = out.match(/<math\b[^>]*class="assistive-mathml"[\s\S]*?<\/math>/)[0];
    expect(math).toContain('<msup>');
    expect(math).toContain('<mn>2</mn>');
  });

  it('tags block math display="block" on the assistive node', () => {
    const tag = renderMathML(MML, true).match(/<math\b[^>]*class="assistive-mathml"[^>]*>/)[0];
    expect(tag).toMatch(/display="block"/);
  });

  it('buildAssistiveMml returns "" when there is no <math> (degrade to SVG-only)', () => {
    expect(buildAssistiveMml('plain text, no math here', false)).toBe('');
  });
});
