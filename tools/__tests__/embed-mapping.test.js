import { describe, it, expect } from 'vitest';
import { renderEmbedHtml } from '../lib/embed-mapping.js';

const embedMap = {
  'https://www.openstax.org/l/diet_detective': {
    resolved: 'https://www.youtube.com/embed/xyz',
    kind: 'youtube',
    status: 'ok',
  },
  'https://www.openstax.org/l/locked': {
    resolved: 'https://locked.example/p',
    kind: 'other',
    status: 'blocked',
  },
};

describe('renderEmbedHtml', () => {
  it('emits a responsive lazy iframe to the RESOLVED url plus a fallback link', () => {
    const html = renderEmbedHtml({
      embedSrc: 'https://www.openstax.org/l/diet_detective',
      width: '660',
      height: '371.4',
      title: 'diet detective',
      embedMap,
    });
    expect(html).toContain('class="embed-responsive"');
    expect(html).toContain('src="https://www.youtube.com/embed/xyz"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('title="diet detective"');
    expect(html).toContain('class="embed-fallback"');
    expect(html).toContain('href="https://www.youtube.com/embed/xyz"');
    // never leak the un-framable /l/ redirector into an iframe
    expect(html).not.toContain('openstax.org/l/');
  });

  it('throws (fail loud) when the src is not in the mapping', () => {
    expect(() =>
      renderEmbedHtml({ embedSrc: 'https://www.openstax.org/l/unknown', embedMap })
    ).toThrow(/Unresolved embed/);
  });

  it('throws when the mapped target is blocked', () => {
    expect(() =>
      renderEmbedHtml({ embedSrc: 'https://www.openstax.org/l/locked', embedMap })
    ).toThrow(/Unresolved embed/);
  });
});
