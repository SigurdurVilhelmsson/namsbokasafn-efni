/**
 * cnxml-render-scanblocks.test.js — item 10 (RV-3): the shared numbering
 * pre-scan. One scanner, E7 semantics (attrs-anywhere capture →
 * hasUnnumberedClass WORD match → id extract), flag-not-filter so callers
 * can keep feeding the id registry unconditionally.
 */

import { describe, it, expect } from 'vitest';
import { scanBlocks } from '../cnxml-render.js';

describe('scanBlocks', () => {
  it('captures ids regardless of attribute order (attrs-anywhere)', () => {
    const cnxml =
      '<exercise type="conceptual" id="ex1"><para id="p">x</para></exercise>' +
      '<exercise id="ex2">y</exercise>';
    expect(scanBlocks(cnxml, 'exercise').map((b) => b.id)).toEqual(['ex1', 'ex2']);
  });

  it('flags multi-class unnumbered via word-match, does NOT filter', () => {
    const cnxml =
      '<figure id="f1" class="unnumbered scaled-down"/>' +
      '<figure id="f2" class="unnumbered-foo"/>' +
      '<figure id="f3"/>';
    const out = scanBlocks(cnxml, 'figure');
    expect(out.map((b) => [b.id, b.unnumbered])).toEqual([
      ['f1', true],
      ['f2', false], // near-miss substring is NOT unnumbered (word match)
      ['f3', false],
    ]);
  });

  it('drops id-less matches', () => {
    expect(
      scanBlocks('<equation class="unnumbered"/><equation id="e1"/>', 'equation').map((b) => b.id)
    ).toEqual(['e1']);
  });

  it('returns document-order match indexes usable for forward slicing', () => {
    const cnxml = 'AAA<example id="x"><title>T</title></example>';
    const [ex] = scanBlocks(cnxml, 'example');
    expect(ex.index).toBe(3);
    expect(cnxml.slice(ex.index)).toMatch(/^<example/);
  });

  it('does not cross tag-name word boundaries (figure vs figcaption-like)', () => {
    // \b guard: scanning "exercise" must not match "exercises" (hypothetical tag)
    const cnxml = '<exercises id="nope"/><exercise id="yes"/>';
    expect(scanBlocks(cnxml, 'exercise').map((b) => b.id)).toEqual(['yes']);
  });
});
