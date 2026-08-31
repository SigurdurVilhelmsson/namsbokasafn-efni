import { describe, it, expect } from 'vitest';
import { firstDirectChildTitle } from '../lib/cnxml-parser.js';

/**
 * §C82 L143/L144 — `firstDirectChildTitle` is the primitive the container-title
 * rule is stated in terms of: *a `<title>` that is a direct child of a container
 * is that container's own title, keyed on the container's own id.*
 *
 * The distinguishing case is the one the PREVIOUS test suite got wrong. An
 * earlier test named "a direct <title> child still becomes the example title"
 * passed for the wrong reason: its para was title-ONLY, which an unrelated guard
 * already rejected, so the direct-child branch was never what the assertion
 * bound. Organic's real shape has a BODY on that para. Every test below that
 * involves a sibling para therefore gives the para a body — that is the whole
 * point of the fixture, not incidental detail.
 */
describe('firstDirectChildTitle — depth', () => {
  it('finds a title that is a direct child', () => {
    expect(firstDirectChildTitle('<title>Real</title><para id="p">body</para>')?.inner).toBe(
      'Real'
    );
  });

  it('does NOT find a title nested inside a child element', () => {
    // Organic's paragraph sub-heading. Mistaking this for the container's own
    // title is the defect: all 102 organic example-title segments carried
    // "Strategy" (101) or "Solution" (1) — zero carried a real example title.
    expect(
      firstDirectChildTitle('<para id="p"><title>Strategy</title> body text</para>')
    ).toBeNull();
  });

  it('finds the direct-child title even when a BODY-BEARING para also has one', () => {
    // The exact organic shape, and the case the superseded test never bound.
    const content =
      '<title>Predicting the Number of Bonds</title>' +
      '<para id="p-1">How many hydrogen atoms?</para>' +
      '<para id="p-2"><title>Strategy</title> Identify the periodic group.</para>';
    expect(firstDirectChildTitle(content)?.inner).toBe('Predicting the Number of Bonds');
  });

  it('returns the FIRST direct-child title when the container has one', () => {
    expect(firstDirectChildTitle('<title>A</title><title>B</title>')?.inner).toBe('A');
  });

  it('returns null for content with no title at all', () => {
    expect(firstDirectChildTitle('<para id="p">body</para>')).toBeNull();
  });

  it('returns null for empty or missing content', () => {
    expect(firstDirectChildTitle('')).toBeNull();
    expect(firstDirectChildTitle(undefined)).toBeNull();
  });
});

describe('firstDirectChildTitle — §C115 open-tag hazards', () => {
  it('survives a bare > inside an attribute value', () => {
    // A raw `>` is legal in an attribute value and OpenStax ships one
    // (chemistry ch05/m68727: “Δ U > 0”). A `[^>]*` span truncates there,
    // leaving an unterminated attribute and a corrupted depth count.
    const content = '<media alt="Δ U > 0 always"><image src="x.png"/></media><title>After</title>';
    expect(firstDirectChildTitle(content)?.inner).toBe('After');
  });

  it('survives a bare > inside a SINGLE-quoted attribute value', () => {
    const content = "<media alt='a > b'><image src='x.png'/></media><title>After</title>";
    expect(firstDirectChildTitle(content)?.inner).toBe('After');
  });

  it('does not let a self-closing tag open a depth', () => {
    // A greedy attribute span eats the `/` of `<image …/>`, which would push
    // depth to 1 and hide every later direct-child title.
    expect(firstDirectChildTitle('<image src="x.png"/><title>After</title>')?.inner).toBe('After');
  });

  it('masks XML comments so a commented-out element opens no depth', () => {
    // §C90: organic ch28/m00309 opens a <media> with a dead commented <image>.
    expect(firstDirectChildTitle('<!-- <para id="dead"> --><title>After</title>')?.inner).toBe(
      'After'
    );
  });

  it('returns null rather than guessing when a title is unterminated', () => {
    expect(firstDirectChildTitle('<title>Unclosed')).toBeNull();
  });
});

describe('firstDirectChildTitle — what it returns', () => {
  it('reports the full <title>…</title> span so a caller can strip it', () => {
    const hit = firstDirectChildTitle('<title>Real</title><para id="p">body</para>');
    expect(hit.fullMatch).toBe('<title>Real</title>');
  });

  it('preserves inline markup inside the title verbatim', () => {
    // Organic's para titles carry <span class="red-text">; a container title may
    // carry <sub>/<sup>. The primitive must not flatten them — extractInlineText
    // is what turns them into [[…]] markers, one layer up.
    const hit = firstDirectChildTitle('<title>E<sub>a</sub> and rate</title>');
    expect(hit.inner).toBe('E<sub>a</sub> and rate');
  });

  it('offsets index into the ORIGINAL content, not the comment-masked copy', () => {
    // Masking replaces comments with equal-length spaces precisely so that the
    // returned spans are slices of the caller's own string.
    const content = '<!--x--><title>Real</title>';
    expect(content.includes(firstDirectChildTitle(content).fullMatch)).toBe(true);
  });
});
