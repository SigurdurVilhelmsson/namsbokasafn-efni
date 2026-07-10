import { describe, it, expect, vi } from 'vitest';
import { generateFallbackLabel } from '../lib/book-rendering-config.js';

describe('generateFallbackLabel (pure)', () => {
  it('Title-Cases an unmapped class without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const label = generateFallbackLabel('everyday');
    expect(label).toBe('Everyday');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('still returns the Title-Cased label with a multi-word class', () => {
    expect(generateFallbackLabel('scientific method')).toBe('Scientific Method');
  });
});
