import { describe, it, expect } from 'vitest';
import { renderChildrenInDocumentOrder } from '../cnxml-render.js';

describe('renderChildrenInDocumentOrder — media-bearing list stays in order', () => {
  it('does NOT hoist a media-bearing list above its preceding paragraph', () => {
    const content =
      '<para id="p1">Intro paragraph.</para>' +
      '<list id="L1" list-type="enumerated" number-style="arabic">' +
      '<item>step<media id="m1" alt="x"><image src="a.jpg"/></media></item>' +
      '</list>';
    const html = renderChildrenInDocumentOrder(
      content,
      {},
      {
        excludeSections: true,
        sectionLevel: 2,
      }
    ).join('\n');
    expect(html.indexOf('id="L1"')).toBeGreaterThan(html.indexOf('id="p1"'));
  });
});
