import { describe, it, expect } from 'vitest';
import { altElementId, readAlt } from '../lib/alt-segments.js';

describe('altElementId', () => {
  it('uses the media id when present', () => {
    expect(altElementId('CNX_Chem_01_02_Fig', 7)).toBe('CNX_Chem_01_02_Fig-alt');
  });

  it('falls back to the placeholder index when the media has no id', () => {
    expect(altElementId(null, 7)).toBe('media-7-alt');
  });

  it('treats an empty-string id as absent', () => {
    expect(altElementId('', 3)).toBe('media-3-alt');
  });

  it('namespaces the fallback by kind, so two counters cannot collide', () => {
    expect(altElementId(null, 1, 'media')).toBe('media-1-alt');
    expect(altElementId(null, 1, 'standalone')).toBe('standalone-1-alt');
    expect(altElementId(null, 1, 'media')).not.toBe(altElementId(null, 1, 'standalone'));
  });

  it('ignores kind entirely when the media has an id', () => {
    expect(altElementId('med-4', 1, 'standalone')).toBe('med-4-alt');
  });
});

describe('readAlt', () => {
  it('returns a legacy string unchanged', () => {
    expect(readAlt('A flask of blue liquid', () => 'NEVER')).toBe('A flask of blue liquid');
  });

  it('resolves the segment when the new shape is given', () => {
    const alt = { segmentId: 'm1:alt:fig-1-alt', text: 'English' };
    expect(readAlt(alt, (id) => (id === 'm1:alt:fig-1-alt' ? 'Íslenska' : undefined))).toBe(
      'Íslenska'
    );
  });

  it('falls back to the English text when the segment is missing', () => {
    const alt = { segmentId: 'm1:alt:fig-1-alt', text: 'English' };
    expect(readAlt(alt, () => undefined)).toBe('English');
  });

  it('falls back to the English text when no getSeg is supplied at all', () => {
    expect(readAlt({ segmentId: 'x', text: 'English' })).toBe('English');
  });

  it('returns empty string for null/undefined', () => {
    expect(readAlt(null, () => 'x')).toBe('');
    expect(readAlt(undefined, () => 'x')).toBe('');
  });

  it('returns empty string when the segment resolves to empty and there is no text', () => {
    expect(readAlt({ segmentId: 'x' }, () => '')).toBe('');
  });
});
