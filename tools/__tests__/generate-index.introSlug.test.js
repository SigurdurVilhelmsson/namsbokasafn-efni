import { describe, it, expect } from 'vitest';
import { buildTocMap } from '../generate-index.js';

const toc = {
  chapters: [
    {
      number: 4,
      title: 'Kraftar',
      sections: [
        {
          number: '',
          title: 'Inngangur að kraftafræði',
          file: '4-0-introduction.html',
          type: 'introduction',
        },
        { number: '4.1', title: 'Þróun krafthugtaksins', file: '4-1-throun.html' },
        { number: '', title: 'Lykilhugtök', file: '4-key-terms.html', type: 'glossary' },
        { number: '', title: 'Samantekt', file: '4-summary.html', type: 'summary' },
      ],
    },
  ],
};

describe('buildTocMap — intro resolution (GI-1)', () => {
  const m = buildTocMap(toc);
  it('indexes numbered sections by number', () => {
    expect(m.get('4.1')).toMatchObject({
      slug: '4-1-throun',
      title: 'Þróun krafthugtaksins',
      chapter: 4,
    });
  });
  it('indexes the intro page under `${chapter}.0`', () => {
    expect(m.get('4.0')).toMatchObject({
      slug: '4-0-introduction',
      title: 'Inngangur að kraftafræði',
    });
  });
  it('does NOT index empty-number non-intro pages (key-terms/summary)', () => {
    expect([...m.values()].some((v) => v.slug === '4-key-terms' || v.slug === '4-summary')).toBe(
      false
    );
  });
  it('an intro module (section "intro", chapter 4) resolves to the intro slug via 4.0', () => {
    const section = 'intro',
      chapter = 4;
    const key = section === 'intro' ? `${chapter}.0` : section; // mirrors the assignment-site normalization
    expect(m.get(key)?.slug).toBe('4-0-introduction');
  });
});
