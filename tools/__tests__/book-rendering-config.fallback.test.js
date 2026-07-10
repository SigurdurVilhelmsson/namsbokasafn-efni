import { describe, it, expect, vi } from 'vitest';
import { generateFallbackLabel } from '../lib/book-rendering-config.js';

describe('generateFallbackLabel fail-loud', () => {
  it('warns (fail-loud) when it Title-Cases an unmapped class', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const label = generateFallbackLabel('everyday', { book: 'liffraedi-2e' });
    expect(label).toBe('Everyday');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unmapped note.*everyday.*liffraedi-2e/i));
    warn.mockRestore();
  });
  it('still returns the Title-Cased label with no book context', () => {
    expect(generateFallbackLabel('scientific method')).toBe('Scientific Method');
  });
});
