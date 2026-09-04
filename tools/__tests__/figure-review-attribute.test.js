import { describe, it, expect } from 'vitest';
import { figureReviewAttr } from '../cnxml-render.js';

// BOTH DIRECTIONS. A contract test that only checks the attribute APPEARS
// passes just as well against code that emits it unconditionally.
describe('figureReviewAttr', () => {
  it('emits nothing when the figure is approved (no badge for finished work)', () => {
    expect(figureReviewAttr('approved')).toBe('');
  });
  it('emits the attribute when the figure is still mt-preview', () => {
    expect(figureReviewAttr('mt-preview')).toBe(' data-figure-review="mt-preview"');
  });
  it('emits the attribute when the figure is flagged', () => {
    expect(figureReviewAttr('flagged')).toBe(' data-figure-review="flagged"');
  });
  it('emits nothing for an unknown state rather than inventing markup', () => {
    expect(figureReviewAttr('nonsense')).toBe('');
  });
});
