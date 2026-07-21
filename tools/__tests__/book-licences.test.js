import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getBookLicence } = require('../lib/book-licences.cjs');
const mod = require('../lib/book-licences.cjs');

const REPO_ROOT = path.resolve(__dirname, '../..');

// Provenance §1 allowlist — the ONLY books that carry a licence. Editing a value
// here without editing the provenance doc + book-config is the mistake this pins.
const EXPECTED = {
  'efnafraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-01-19' },
  'liffraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-03-11' },
  orverufraedi: { licence: 'CC BY 4.0', obtained: '2026-03-09' },
  'edlisfraedi-2e': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
  'lifraen-efnafraedi': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
  '__e2e-fixture__': { licence: 'CC BY 4.0', obtained: '2026-01-01' },
};

describe('getBookLicence — sourced from book-config.json', () => {
  for (const [slug, expected] of Object.entries(EXPECTED)) {
    it(`returns the provenance-pinned licence for ${slug}`, () => {
      expect(getBookLicence(slug)).toEqual(expected);
    });

    it(`sources ${slug} from its book-config.json (not a hardcoded map)`, () => {
      const cfg = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'books', slug, 'book-config.json'), 'utf-8')
      );
      expect(getBookLicence(slug)).toEqual({
        licence: cfg.licence.code,
        obtained: cfg.licence.obtained,
      });
    });
  }

  it('throws for a book whose config has no licence block (fail-loud)', () => {
    expect(() => getBookLicence('stjornufraedi')).toThrow(/licence/i);
    expect(() => getBookLicence('testbook')).toThrow(/licence/i);
  });

  it('throws for a slug with no book-config.json at all', () => {
    expect(() => getBookLicence('no-such-book')).toThrow();
  });

  it('no longer exports the inline BOOK_LICENCES map (single source is book-config)', () => {
    expect(mod.BOOK_LICENCES).toBeUndefined();
  });
});
