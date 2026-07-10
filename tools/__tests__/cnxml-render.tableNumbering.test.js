import { describe, it, expect } from 'vitest';
import { hasUnnumberedClass, formatTableNumber } from '../cnxml-render.js';

describe('hasUnnumberedClass (class-word match)', () => {
  it('true for exact unnumbered', () => expect(hasUnnumberedClass('id="x" class="unnumbered"')).toBe(true));
  it('true for multi-class column-header unnumbered', () =>
    expect(hasUnnumberedClass('class="column-header unnumbered" id="y"')).toBe(true));
  it('false for a numbered table (top-titled)', () => expect(hasUnnumberedClass('class="top-titled"')).toBe(false));
  it('false when no class attr', () => expect(hasUnnumberedClass('id="z"')).toBe(false));
  it('false for a substring (unnumbered-foo)', () => expect(hasUnnumberedClass('class="unnumbered-foo"')).toBe(false));
});
describe('formatTableNumber', () => {
  it('chapter.n for a normal chapter', () => expect(formatTableNumber(12, null, 1)).toBe('12.1'));
  it('letter+n for appendix', () => expect(formatTableNumber('appendices', 'B', 3)).toBe('B3'));
  it('defensive appendices.n when no letter', () => expect(formatTableNumber('appendices', null, 1)).toBe('appendices.1'));
});
