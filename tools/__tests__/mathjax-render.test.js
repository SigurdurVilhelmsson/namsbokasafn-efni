import { describe, it, expect } from 'vitest';
import { renderMathML, buildAssistiveMml, resetMathJaxIds } from '../lib/mathjax-render.js';

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

  it('buildAssistiveMml only wraps the FIRST <math> when two adjacent blocks are given (lazy-regex contract)', () => {
    // Two adjacent <math> blocks — a greedy [\s\S]* would span from the opening
    // <math of the first to the closing </math> of the second, producing an
    // `inner` that includes BOTH blocks. The replace only rewrites the first
    // <math tag, so the output leaks the raw second block and contains the
    // malformed interior sequence </math><math>.
    // The lazy [\s\S]*? stops at the FIRST </math>, so `inner` = first block
    // only. The second block's content is never included in the return value.
    const MML_A = '<math><mi>A</mi></math>';
    const MML_B = '<math><mi>B</mi></math>';
    const result = buildAssistiveMml(MML_A + MML_B, false);
    // With lazy: the result is the first block only, wrapped with assistive attrs.
    expect(result).toContain('class="assistive-mathml"');
    expect(result).toContain('<mi>A</mi>');
    // The second block's content must NOT be leaked into the output.
    expect(result).not.toContain('<mi>B</mi>');
    // No malformed interior sequence (greedy would produce this).
    expect(result).not.toContain('</math><math>');
  });
});

describe('resetMathJaxIds', () => {
  const mml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
  const firstId = (s) => (s.match(/id="(MJX-\d+)-/) || [])[1];

  it('makes two independent pages produce identical MJX-N id ranges', () => {
    resetMathJaxIds();
    const page1 = [renderMathML(mml), renderMathML(mml)].map(firstId);
    resetMathJaxIds();
    const page2 = [renderMathML(mml), renderMathML(mml)].map(firstId);
    expect(page2).toEqual(page1); // deterministic per page
    expect(new Set(page1).size).toBe(page1.length); // unique within a page
  });

  it('without a reset the counter keeps climbing (proves the reset does work)', () => {
    resetMathJaxIds();
    const a = firstId(renderMathML(mml));
    const b = firstId(renderMathML(mml));
    expect(a).not.toBe(b);
  });
});
