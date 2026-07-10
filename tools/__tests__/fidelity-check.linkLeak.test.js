import { describe, it, expect } from 'vitest';
import { findRawCnxmlLeaks } from '../cnxml-render-fidelity-check.js';
describe('findRawCnxmlLeaks link (order-independent)', () => {
  it('flags window-first link leaks', () => {
    const html = '<p>see <link window="new" url="http://x">x</link></p>';
    expect(findRawCnxmlLeaks(html).some((l) => l.pattern === 'link')).toBe(true);
  });
  it('does NOT flag a legitimate head stylesheet link', () => {
    const html = '<link rel="stylesheet" href="/styles/content.css">';
    expect(findRawCnxmlLeaks(html).some((l) => l.pattern === 'link')).toBe(false);
  });
});
