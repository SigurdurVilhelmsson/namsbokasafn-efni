import { describe, it, expect } from 'vitest';
import { assertNoMarkerResidue } from '../cnxml-inject.js';

describe('assertNoMarkerResidue hard-fails on [[TABLE:]]', () => {
  it('throws on surviving [[TABLE:id]]', () => {
    expect(() => assertNoMarkerResidue('<para>see [[TABLE:t1]] here</para>', 'mTest')).toThrow(
      /TABLE:t1/
    );
  });
  it('still tolerates [[MATH:]] and [[MEDIA:]]', () => {
    expect(() =>
      assertNoMarkerResidue('<para>[[MATH:3]] and [[MEDIA:1]]</para>', 'mTest')
    ).not.toThrow();
  });
  it('does not fire on legit nested chemistry brackets', () => {
    expect(() =>
      assertNoMarkerResidue('<para>concentration [[Ag(NH3)2]+]</para>', 'mTest')
    ).not.toThrow();
  });
});
