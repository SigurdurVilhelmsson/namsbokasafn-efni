import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { highlightTermsInHtml } = require('../public/js/term-highlight.js');

const countSpans = (html) => (html.match(/class="term-highlight/g) || []).length;

describe('highlightTermsInHtml — basic behaviour', () => {
  it('wraps a matched term in a clickable highlight span', () => {
    const out = highlightTermsInHtml('the mole is a unit', [
      { english: 'mole', headwordId: 7, status: 'approved' },
    ]);
    expect(out).toContain('class="term-highlight"');
    expect(out).toContain('data-term-id="7"');
    expect(out).toContain('showTermPopup(7, this)');
    expect(out).toContain('>mole</span>');
  });

  it('uses the "proposed" class for non-approved matches', () => {
    const out = highlightTermsInHtml('the mole is a unit', [
      { english: 'mole', headwordId: 7, status: 'proposed' },
    ]);
    expect(out).toContain('class="term-highlight proposed"');
  });

  it('highlights only the first occurrence of a term', () => {
    const out = highlightTermsInHtml('mole and another mole', [
      { english: 'mole', headwordId: 7, status: 'approved' },
    ]);
    expect(countSpans(out)).toBe(1);
  });

  it('matches the longest term first (molar mass before mass)', () => {
    const out = highlightTermsInHtml('compute the molar mass value', [
      { english: 'mass', headwordId: 1, status: 'approved' },
      { english: 'molar mass', headwordId: 2, status: 'approved' },
    ]);
    expect(out).toContain('data-term-id="2"');
    expect(out).toContain('>molar mass</span>');
    // "mass" should not be separately highlighted inside the longer match.
    expect(countSpans(out)).toBe(1);
  });

  it('respects whole-word boundaries (does not match inside a longer word)', () => {
    const out = highlightTermsInHtml('a massive molecule', [
      { english: 'mass', headwordId: 1, status: 'approved' },
    ]);
    expect(countSpans(out)).toBe(0);
  });

  it('returns input unchanged when there are no matches', () => {
    expect(highlightTermsInHtml('plain text', [])).toBe('plain text');
    expect(highlightTermsInHtml('', [{ english: 'x', headwordId: 1, status: 'approved' }])).toBe(
      ''
    );
  });
});

describe('highlightTermsInHtml — tag-aware splice guard (B-4)', () => {
  it('does not match a term that appears inside a tag/attribute (link-chip URL)', () => {
    // renderMarkdownPreview output: a [[link:]] chip whose title holds a full URL
    // that happens to contain the glossary headword "mole".
    const html =
      'Read <span class="link-chip" title="Hlekkur: https://x.org/mole">here</span> about the mole.';
    const out = highlightTermsInHtml(html, [
      { english: 'mole', headwordId: 7, status: 'approved' },
    ]);
    // The title attribute must be left byte-for-byte intact (no span spliced in).
    expect(out).toContain('title="Hlekkur: https://x.org/mole"');
    // Exactly the visible-text "mole" is highlighted — the URL one is not.
    expect(countSpans(out)).toBe(1);
    expect(out).toContain('about the <span class="term-highlight"');
  });

  it('does not match a term that equals a tag/attribute token (e.g. "link")', () => {
    const html = 'A <span class="link-chip" title="Hlekkur: #a">link</span> word.';
    const out = highlightTermsInHtml(html, [
      { english: 'link', headwordId: 9, status: 'approved' },
    ]);
    // class="link-chip" must be untouched; only the visible chip label "link" wraps.
    expect(out).toContain('class="link-chip"');
    expect(countSpans(out)).toBe(1);
    expect(out).toContain('>link</span></span>');
  });

  it('does not re-match attributes of a span injected by an earlier term', () => {
    // Highlight "data" first; a later "term" headword must not match inside the
    // injected data-term-id attribute.
    const html = 'data and term';
    const out = highlightTermsInHtml(html, [
      { english: 'data', headwordId: 1, status: 'approved' },
      { english: 'term', headwordId: 2, status: 'approved' },
    ]);
    // Both visible words highlighted; no extra span from matching "term" inside
    // "data-term-id".
    expect(countSpans(out)).toBe(2);
    expect(out).toContain('data-term-id="1"');
    expect(out).toContain('data-term-id="2"');
  });
});
