import { describe, it, expect } from 'vitest';
import { processInlineContent } from '../cnxml-elements.js';
const ctx = {};
describe('emphasis rendering (R4-4)', () => {
  it('nested bold-wrapping-italics pairs correctly (no raw <emphasis>)', () => {
    const out = processInlineContent(
      '<emphasis effect="bold"><emphasis effect="italics">x</emphasis></emphasis>', ctx);
    expect(out).toBe('<strong><em>x</em></strong>');
    expect(out).not.toContain('<emphasis');
  });
  it('effect-less <emphasis> defaults to italics', () => {
    expect(processInlineContent('<emphasis>y</emphasis>', ctx)).toBe('<em>y</em>');
  });
  it('class="emphasis-one" keeps its class on <em>', () => {
    expect(processInlineContent('<emphasis class="emphasis-one">H</emphasis>', ctx))
      .toBe('<em class="emphasis-one">H</em>');
  });
  it('simple effect="italics" is unchanged (<em>)', () => {
    expect(processInlineContent('<emphasis effect="italics">z</emphasis>', ctx)).toBe('<em>z</em>');
  });
  it('effect not first attribute still renders (order-independent)', () => {
    expect(processInlineContent('<emphasis id="a" effect="bold">b</emphasis>', ctx))
      .toBe('<strong>b</strong>');
  });
});
