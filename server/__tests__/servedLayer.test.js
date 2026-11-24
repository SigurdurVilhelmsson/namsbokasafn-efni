import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SERVED_LAYER_BY_BOOK, servedLayerFor, FABLE_LAYER } = require('../lib/servedLayer');

describe('servedLayer', () => {
  it('serves chemistry from the Fable layer', () => {
    expect(servedLayerFor('efnafraedi-2e')).toBe('fable');
  });

  it('serves any other book from the MT output', () => {
    expect(servedLayerFor('liffraedi-2e')).toBe('mt-output');
  });

  it('falls back to the MT output for unknown or non-string values without throwing', () => {
    for (const v of [undefined, null, 42, {}, '', '__proto__', 'toString']) {
      expect(servedLayerFor(v)).toBe('mt-output');
    }
  });

  it('exports the layer name as a constant', () => {
    expect(FABLE_LAYER).toBe('fable');
  });

  it('freezes the map', () => {
    expect(Object.isFrozen(SERVED_LAYER_BY_BOOK)).toBe(true);
  });

  it('holds exactly one book', () => {
    expect(Object.keys(SERVED_LAYER_BY_BOOK)).toEqual(['efnafraedi-2e']);
  });
});
