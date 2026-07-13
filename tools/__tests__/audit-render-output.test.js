/**
 * Tests for audit-render-output.js — checkPlaceholderLeaks.
 *
 * Only checkPlaceholderLeaks is exported for testing; the rest of the tool
 * is a CLI script (reads real book directories, calls process.exit).
 */
import { describe, it, expect } from 'vitest';
import { checkPlaceholderLeaks } from '../audit-render-output.js';

describe('checkPlaceholderLeaks', () => {
  it('detects [[MATH:N]] placeholders', () => {
    const leaks = checkPlaceholderLeaks('<p>value [[MATH:1]] here</p>');
    expect(leaks).toEqual([{ type: 'MATH', value: '[[MATH:1]]' }]);
  });

  it('detects {{SEG:...}} placeholders', () => {
    const leaks = checkPlaceholderLeaks('<p>{{SEG:m1:para:p1}}</p>');
    expect(leaks.some((l) => l.type === 'SEG')).toBe(true);
  });

  it('detects B4 inline markers ([[term:]]/[[fn:]]/[[u:]]/[[em:]]) leaked into HTML', () => {
    const leaks = checkPlaceholderLeaks('<p>The [[term:viscosity|term-1]] of a fluid.</p>');
    expect(leaks).toEqual([{ type: 'INLINE-MARKER', value: '[[term:viscosity|term-1]]' }]);
  });

  it('does not flag clean HTML', () => {
    expect(checkPlaceholderLeaks('<p>Clean rendered content.</p>')).toEqual([]);
  });
});
