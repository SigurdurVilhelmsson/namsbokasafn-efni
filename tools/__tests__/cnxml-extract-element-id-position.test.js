import { describe, it, expect } from 'vitest';
import { elementIdPosition } from '../cnxml-extract.js';

describe('elementIdPosition', () => {
  it('returns the element definition offset, not an earlier target-id reference', () => {
    const src = `<para id="p1">see <link target-id="figZ"/></para><figure id="figZ"><media id="m"/></figure>`;
    const pos = elementIdPosition(src, 'figZ');
    // must point at the <figure id="figZ">, which is AFTER the <link target-id="figZ"/>
    expect(pos).toBe(src.indexOf('<figure id="figZ"'));
    expect(pos).toBeGreaterThan(src.indexOf('target-id="figZ"'));
  });

  it('returns -1 for an id that only appears as a target-id reference (no local definition)', () => {
    const src = `<para id="p1">see <link target-id="ghost" document="m999"/></para>`;
    expect(elementIdPosition(src, 'ghost')).toBe(-1);
  });

  it('returns the offset for a normally-defined id (never referenced)', () => {
    const src = `<para id="pA">a</para><note id="nB">b</note>`;
    expect(elementIdPosition(src, 'nB')).toBe(src.indexOf('<note id="nB"'));
  });

  it('is not fooled by an id that is a substring of another id', () => {
    const src = `<para id="p10">a</para><note id="p1">b</note>`;
    expect(elementIdPosition(src, 'p1')).toBe(src.indexOf('<note id="p1"'));
  });

  it('returns -1 for a falsy id (defensive)', () => {
    expect(elementIdPosition(`<para id="p1">a</para>`, '')).toBe(-1);
  });
});
