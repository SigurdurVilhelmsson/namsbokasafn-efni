import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('getBookLicence genuinely READS book-config.json (behavioral, not a same-valued map)', () => {
  // A probe book that exists ONLY as a freshly-written file with a licence value
  // no hardcoded map would carry. A map-based getBookLicence would THROW for this
  // unknown slug; the real file-reading impl returns the written value. So this
  // test fails if getBookLicence ever stops reading book-config.json.
  const PROBE = '__licence-probe__';
  const probeDir = path.join(REPO_ROOT, 'books', PROBE);

  beforeAll(() => {
    fs.mkdirSync(probeDir, { recursive: true });
    fs.writeFileSync(
      path.join(probeDir, 'book-config.json'),
      JSON.stringify({ licence: { code: 'CC0 1.0', obtained: '1970-01-01' }, domain: 'test' }),
      'utf-8'
    );
  });
  afterAll(() => {
    fs.rmSync(probeDir, { recursive: true, force: true });
  });

  it('returns the licence written to a freshly-created book-config.json', () => {
    expect(getBookLicence(PROBE)).toEqual({ licence: 'CC0 1.0', obtained: '1970-01-01' });
  });

  it('throws for a book whose freshly-written config has malformed JSON', () => {
    // Fix 4's guard: a parse failure must fail-loud with a licence-mentioning
    // message, not a raw SyntaxError.
    const BAD = '__licence-malformed__';
    const badDir = path.join(REPO_ROOT, 'books', BAD);
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, 'book-config.json'), '{ this is not json', 'utf-8');
    try {
      expect(() => getBookLicence(BAD)).toThrow(/licence/i);
    } finally {
      fs.rmSync(badDir, { recursive: true, force: true });
    }
  });
});
