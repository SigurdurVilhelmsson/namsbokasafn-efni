import { describe, it, expect } from 'vitest';
import { getBookLicence, BOOK_LICENCES } from '../lib/book-licences.cjs';

describe('getBookLicence', () => {
  it('returns CC BY 4.0 with obtained date for efnafraedi-2e', () => {
    expect(getBookLicence('efnafraedi-2e')).toEqual({
      licence: 'CC BY 4.0',
      obtained: '2026-01-19',
    });
  });

  it('returns CC BY-NC-SA 4.0 for the two NC books', () => {
    expect(getBookLicence('edlisfraedi-2e').licence).toBe('CC BY-NC-SA 4.0');
    expect(getBookLicence('lifraen-efnafraedi').licence).toBe('CC BY-NC-SA 4.0');
  });

  it('throws on an unknown slug, naming the map file (deliberate licence-first onboarding)', () => {
    expect(() => getBookLicence('stjornufraedi')).toThrow(/book-licences\.cjs/);
    expect(() => getBookLicence('testbook')).toThrow(/book-licences\.cjs/);
  });

  it('covers exactly the five active pipeline books', () => {
    expect(Object.keys(BOOK_LICENCES).sort()).toEqual([
      'edlisfraedi-2e',
      'efnafraedi-2e',
      'liffraedi-2e',
      'lifraen-efnafraedi',
      'orverufraedi',
    ]);
  });
});
