import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getBookRenderConfig } from '../lib/book-rendering-config.js';

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/book-config-golden.json', import.meta.url), 'utf-8')
);

describe('getBookRenderConfig golden equality (migration oracle)', () => {
  for (const slug of Object.keys(golden)) {
    it(`reproduces the pre-migration config for ${slug}`, () => {
      expect(getBookRenderConfig(slug)).toEqual(golden[slug]);
    });
  }
});

describe('book-config.json loader merge semantics', () => {
  it('shallow-merges file overrides over SHARED defaults', () => {
    const cfg = getBookRenderConfig('efnafraedi-2e');
    expect(cfg.noteTypeLabels['link-to-learning']).toBe('Tengill til náms'); // from SHARED
    expect(cfg.noteTypeLabels['green-chemistry']).toBe('Græn efnafræði'); // from file
  });

  it('keeps SHARED end-of-chapter sections (summary/glossary) after merge', () => {
    const cfg = getBookRenderConfig('liffraedi-2e');
    expect(cfg.endOfChapterSections.summary.titleIs).toBe('Samantekt');
    expect(cfg.endOfChapterSections.glossary.slug).toBe('key-terms');
  });

  it('throws for a book with no config file (fail-loud)', () => {
    expect(() => getBookRenderConfig('no-such-book-xyz')).toThrow(/no-such-book-xyz/);
  });

  it('excludes the non-render `licence` key from the render config (item 17)', () => {
    // licence is export/provenance metadata (getBookLicence) and vefur owns the
    // footer — it must NOT leak into efni's render config. Target a LICENSED
    // book (efnafraedi-2e carries a licence block); stjornufraedi would pass
    // this vacuously.
    const cfg = getBookRenderConfig('efnafraedi-2e');
    expect('licence' in cfg).toBe(false);
  });
});
