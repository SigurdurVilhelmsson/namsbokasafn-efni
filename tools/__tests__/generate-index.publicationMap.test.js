import { describe, it, expect } from 'vitest';
import { buildPublicationMap } from '../generate-index.js';

/**
 * §C104 — index.json's section slugs and titles must come from THIS repo's own
 * rendered publication tree, keyed on `data-module-id`.
 *
 * They used to come from `../namsbokasafn-vefur/static/content/<book>/toc.json`
 * — the sister repo's gitignored build output, regenerated from the PREVIOUS
 * sync. That made the subject index structurally one sync behind every rename:
 * a corrected section title renamed the page here, while the index kept citing
 * the superseded slug until a later sync had already shipped the new one.
 */

/** A page as the loader hands it to the pure builder. */
const page = (slug, chapter, moduleId, title) => ({
  slug,
  chapter,
  html: `<html><head><title>20.3 ${title}</title></head><body>
    <article data-module-id="${moduleId}">
      <h1 id="title">${title}</h1>
    </article></body></html>`,
});

describe('buildPublicationMap — slug/title source of truth (§C104)', () => {
  it('indexes a section page by its data-module-id', () => {
    const m = buildPublicationMap([
      page(
        '20-3-aldehyd-keton-karboxylsyrur-og-estrar',
        20,
        'm68848',
        'Aldehýð, ketón, karboxýlsýrur og estrar'
      ),
    ]);
    expect(m.get('m68848')).toEqual({
      slug: '20-3-aldehyd-keton-karboxylsyrur-og-estrar',
      title: 'Aldehýð, ketón, karboxýlsýrur og estrar',
      chapter: 20,
    });
  });

  it('takes the title from <h1 id="title">, not the numbered <title> tag', () => {
    const m = buildPublicationMap([page('20-1-kolvetni', 20, 'm68846', 'Kolvetni')]);
    // The <title> tag carries a section number ("20.3 …"); the toc convention
    // this replaces carried the bare title, and <h1 id="title"> matches it.
    expect(m.get('m68846').title).toBe('Kolvetni');
  });

  it('indexes the chapter intro page by module id, with no `${chapter}.0` indirection', () => {
    const m = buildPublicationMap([page('20-0-introduction', 20, 'm68845', 'Inngangur')]);
    expect(m.get('m68845')).toMatchObject({ slug: '20-0-introduction', title: 'Inngangur' });
  });

  it('skips pages carrying no data-module-id (answer-key, exercises, summary)', () => {
    const m = buildPublicationMap([
      {
        slug: '20-summary',
        chapter: 20,
        html: '<html><body><h1 id="title">Samantekt</h1></body></html>',
      },
      {
        slug: '20-answer-key',
        chapter: 20,
        html: '<html><body><h1 id="title">Svör</h1></body></html>',
      },
    ]);
    expect(m.size).toBe(0);
  });

  it('is a pure function of the pages it is given — no external toc can leak in', () => {
    // The whole §C104 defect was that slug/title came from a file describing a
    // DIFFERENT vintage. Pin that the builder consults nothing but its input:
    // a page whose h1 and filename disagree with every other source still wins.
    const m = buildPublicationMap([
      page('a-slug-that-exists-nowhere-else', 20, 'm68848', 'Titill sem hvergi er til'),
    ]);
    expect(m.get('m68848')).toEqual({
      slug: 'a-slug-that-exists-nowhere-else',
      title: 'Titill sem hvergi er til',
      chapter: 20,
    });
  });

  it('fails loud when two pages claim the same module id', () => {
    // This is the §C9 duplicate-page condition. Resolving it silently is how a
    // superseded page kept being served; the tie-break must never be arbitrary.
    expect(() =>
      buildPublicationMap([
        page('20-3-aldehyd-ketonar-karboxylsyrur-og-estrar', 20, 'm68848', 'Gamalt'),
        page('20-3-aldehyd-keton-karboxylsyrur-og-estrar', 20, 'm68848', 'Nýtt'),
      ])
    ).toThrow(/m68848/);
  });
});
