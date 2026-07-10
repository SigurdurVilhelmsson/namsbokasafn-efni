import { describe, it, expect } from 'vitest';
import { renderList } from '../cnxml-render.js';

const makeList = (numberStyle) => ({
  id: null,
  attributes: { 'list-type': 'enumerated', 'number-style': numberStyle },
  content: '<item>first</item><item>second</item>',
});

describe('renderList number-style', () => {
  it('emits lower-alpha list-style-type for number-style="lower-alpha"', () => {
    const html = renderList(makeList('lower-alpha'), {});
    expect(html).toMatch(/list-style-type:\s*lower-alpha/);
  });
  it('emits upper-alpha list-style-type for number-style="upper-alpha"', () => {
    const html = renderList(makeList('upper-alpha'), {});
    expect(html).toMatch(/list-style-type:\s*upper-alpha/);
  });
  it('leaves a plain <ol> (decimal) for enumerated lists with no number-style', () => {
    const html = renderList({ id: null, attributes: { 'list-type': 'enumerated' }, content: '<item>x</item>' }, {});
    expect(html).not.toMatch(/list-style-type/);
    expect(html).toContain('<ol');
  });
});
