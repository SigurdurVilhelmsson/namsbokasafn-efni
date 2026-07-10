import { describe, it, expect } from 'vitest';
import { processInlineContent } from '../cnxml-elements.js';
describe('processInlineContent — order-independent link', () => {
  it('renders window-first url link as <a>, not raw <link>', () => {
    const out = processInlineContent('<link window="new" url="http://x">x</link>', {});
    expect(out).toContain('<a ');
    expect(out).toContain('href="http://x"');
    expect(out).not.toContain('<link');
  });
});
