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

  it('pins the full BOOK_LICENCES map (F8; values reviewer-verified against the provenance doc)', () => {
    expect(BOOK_LICENCES).toEqual({
      'efnafraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-01-19' },
      'liffraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-03-11' },
      orverufraedi: { licence: 'CC BY 4.0', obtained: '2026-03-09' },
      'edlisfraedi-2e': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
      'lifraen-efnafraedi': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
    });
  });
});
