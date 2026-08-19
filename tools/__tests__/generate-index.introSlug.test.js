import { describe, it, expect } from 'vitest';
import { buildPublicationMap } from '../generate-index.js';

/**
 * GI-1 — a chapter intro module's glossary terms must resolve to the chapter's
 * intro page, not to a null slug.
 *
 * MIGRATED 2026-08-19 (§C104). This used to exercise `buildTocMap`, which keyed
 * section pages by section number against the SISTER REPO's `toc.json` and
 * needed a `${chapter}.0` special case, because an intro page's toc entry has an
 * empty `number`. Slugs and titles now come from this repo's own rendered pages
 * keyed on `data-module-id`, which subsumes GI-1 outright: the intro page
 * carries the intro module's own id, so the lookup is direct and there is no
 * section-number indirection left to special-case.
 *
 * The behaviour this file has always protected is unchanged and still pinned:
 * an intro module resolves to the intro page, and the chapter rollup pages
 * (key-terms / summary / exercises) are never indexed.
 */

const page = (slug, moduleId, title) => ({
  slug,
  chapter: 4,
  html: `<article data-module-id="${moduleId}"><h1 id="title">${title}</h1></article>`,
});

// A whole chapter as it exists on disk under 05-publication/<track>/chapters/04/.
// Rollup pages carry no data-module-id; that is what keeps them out of the map.
const chapterPages = [
  page('4-0-introduction', 'm42000', 'Inngangur að kraftafræði'),
  page('4-1-throun', 'm42001', 'Þróun krafthugtaksins'),
  { slug: '4-key-terms', chapter: 4, html: '<h1 id="title">Lykilhugtök</h1>' },
  { slug: '4-summary', chapter: 4, html: '<h1 id="title">Samantekt</h1>' },
];

describe('GI-1 — intro resolution (§C104: now via the publication map)', () => {
  const m = buildPublicationMap(chapterPages);

  it('resolves an intro module to the intro page, not a null slug', () => {
    expect(m.get('m42000')).toMatchObject({
      slug: '4-0-introduction',
      title: 'Inngangur að kraftafræði',
    });
  });

  it('resolves an ordinary numbered section module to its own page', () => {
    expect(m.get('m42001')).toMatchObject({
      slug: '4-1-throun',
      title: 'Þróun krafthugtaksins',
      chapter: 4,
    });
  });

  it('does NOT index the chapter rollup pages (key-terms / summary)', () => {
    expect([...m.values()].some((v) => v.slug === '4-key-terms' || v.slug === '4-summary')).toBe(
      false
    );
  });

  it('needs no `${chapter}.0` indirection — the intro page is found by module id alone', () => {
    // The old path could only reach the intro page by synthesising the key
    // "4.0" from a module whose section field read "intro". Nothing here does.
    expect(m.size).toBe(2);
    expect([...m.keys()].sort()).toEqual(['m42000', 'm42001']);
  });
});
