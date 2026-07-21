import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  assertLicenceContainment,
  mostRestrictive,
  RESTRICTIVENESS,
} = require('../lib/licence-containment.cjs');

const BY = 'CC BY 4.0';
const NCSA = 'CC BY-NC-SA 4.0';

describe('mostRestrictive', () => {
  it('returns CC BY for an all-CC-BY set', () => {
    expect(mostRestrictive([BY, BY])).toBe(BY);
  });
  it('returns CC BY-NC-SA when any member is NC-SA', () => {
    expect(mostRestrictive([BY, NCSA, BY])).toBe(NCSA);
  });
  it('throws on an unknown code', () => {
    expect(() => mostRestrictive(['MIT'])).toThrow(/Unknown licence/);
  });
  it('throws on an empty set', () => {
    expect(() => mostRestrictive([])).toThrow();
  });
  it('throws on an inherited Object.prototype key (not just any string)', () => {
    expect(() => mostRestrictive(['toString'])).toThrow(/Unknown licence/);
  });
});

describe('assertLicenceContainment', () => {
  it('permits an all-same aggregate', () => {
    expect(() => assertLicenceContainment([BY, BY], BY)).not.toThrow();
  });
  it('permits a CC BY book inside a CC BY-NC-SA aggregate', () => {
    expect(() => assertLicenceContainment([BY, NCSA], NCSA)).not.toThrow();
  });
  it('FORBIDS a CC BY-NC-SA book inside a CC BY aggregate', () => {
    expect(() => assertLicenceContainment([BY, NCSA], BY)).toThrow(/containment/i);
  });
});

describe('RESTRICTIVENESS', () => {
  it('ranks NC-SA above CC BY', () => {
    expect(RESTRICTIVENESS[NCSA]).toBeGreaterThan(RESTRICTIVENESS[BY]);
  });
});
