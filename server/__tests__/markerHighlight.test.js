import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { highlightMarkersInPlace } = require('../public/js/marker-highlight.js');

// Local escape mirroring htmlUtils.escapeHtml — used only to express the invariant.
const escapeHtml = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const stripTags = (html) => html.replace(/<[^>]*>/g, '');

describe('highlightMarkersInPlace — character preservation invariant', () => {
  const cases = [
    'plain text with no markers',
    // bracket family (the current pipeline's primary markers)
    'Vatn H[[sub:2]]O og Ca[[sup:2+]] jónir.',
    'Þetta er [[i:skáletrað]] og [[b:feitletrað]].',
    'Sjá [[xref:fs-idm222237232]] og [[xref:Mynd 5.2|CNX_Chem_05_02]].',
    'Smelltu [[link:hér|https://example.com]] og [[docref:m68674#fs-id123]].',
    'Tafla [[TABLE:tbl-1]] og stærðfræði [[MATH:1]] og mynd [[MEDIA:2]].',
    'Lína[[BR]]næsta og [[SPACE]] bil og [[SPACE:3]].',
    // brace family (term/footnote + legacy emphasis)
    'Hugtakið {{term}}atóm{{/term}} og {{fn}}skýring{{/fn}}.',
    'Legacy {{i}}skáletrað{{/i}} og {{b}}feitt{{/b}}.',
    // markdown family (kept for old-content tolerance)
    'Sýran er **feit** og __hugtak__ og ++undirstrik++.',
    'Vatn H~2~O og Ca^2+^ og {=áhersla=}.',
    'Sjá [tengill](#anchor) og [skjal](m123#frag) og [#CNX_Chem_05_02].',
    'Special <chars> & "quotes" \'apos\' með [[i:a<b & c]].',
  ];
  for (const input of cases) {
    it(`preserves all characters for: ${input.slice(0, 30)}`, () => {
      expect(stripTags(highlightMarkersInPlace(input))).toBe(escapeHtml(input));
    });
  }

  it('returns empty string for empty/null input', () => {
    expect(highlightMarkersInPlace('')).toBe('');
    expect(highlightMarkersInPlace(null)).toBe('');
  });
});

describe('highlightMarkersInPlace — marker detection', () => {
  it('wraps a [[MATH:N]] atom in a highlight span', () => {
    expect(highlightMarkersInPlace('x [[MATH:1]] y')).toContain('class="marker-hl');
  });

  it('highlights the bracket family ([[sub:]], [[i:]], [[xref:]])', () => {
    expect(highlightMarkersInPlace('H[[sub:2]]O')).toContain('marker-hl');
    expect(highlightMarkersInPlace('[[i:orð]]')).toContain('marker-hl');
    expect(highlightMarkersInPlace('[[xref:fs-id1]]')).toContain('marker-hl');
  });

  it('highlights brace markers ({{term}}, {{fn}})', () => {
    expect(highlightMarkersInPlace('{{term}}atóm{{/term}}')).toContain('marker-hl');
    expect(highlightMarkersInPlace('{{fn}}nóta{{/fn}}')).toContain('marker-hl');
  });

  it('adds no highlight span to plain text', () => {
    expect(highlightMarkersInPlace('engin merki hér')).not.toContain('marker-hl');
  });

  it('keeps inner text of a paired marker verbatim outside the delim spans', () => {
    const out = highlightMarkersInPlace('[[sub:2]]');
    expect(out).toContain('2');
    expect(out).toContain('marker-hl');
  });

  it('does not mangle a no-text [[xref:id]] (ordering: brackets before single-bracket rules)', () => {
    // [[xref:fs-id1]] must be treated as one marker, not split by a [..#..] rule
    const out = highlightMarkersInPlace('[[xref:fs-idm222]]');
    expect(stripTags(out)).toBe(escapeHtml('[[xref:fs-idm222]]'));
  });
});
