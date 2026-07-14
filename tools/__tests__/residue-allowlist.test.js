import { describe, it, expect } from 'vitest';
import { classifyResidue } from '../lib/residue-allowlist.js';

const allow = {
  entries: [
    {
      moduleId: 'm68729',
      segmentId: 'm68729:note-title:x',
      class: 'proper-noun',
      reason: 'chemist name',
    },
    { moduleId: 'm68750', segmentId: 'm68750:para:y', class: 'homograph-unit', reason: 'bar unit' },
  ],
};

describe('classifyResidue', () => {
  it('tolerates an exact-match entry with a valid class and reason', () => {
    const r = classifyResidue('m68729', 'm68729:note-title:x', allow);
    expect(r.tolerated).toBe(true);
    expect(r.class).toBe('proper-noun');
    expect(r.reason).toBe('chemist name');
  });
  it('does NOT tolerate an unlisted segment', () => {
    expect(classifyResidue('m68729', 'm68729:note-title:OTHER', allow).tolerated).toBe(false);
  });
  it('does NOT tolerate when moduleId drifts', () => {
    expect(classifyResidue('m99999', 'm68729:note-title:x', allow).tolerated).toBe(false);
  });
  it('does NOT tolerate an invalid class', () => {
    const bad = { entries: [{ moduleId: 'm1', segmentId: 's1', class: 'benign', reason: 'r' }] };
    expect(classifyResidue('m1', 's1', bad).tolerated).toBe(false);
  });
  it('does NOT tolerate a missing reason', () => {
    const bad = { entries: [{ moduleId: 'm1', segmentId: 's1', class: 'proper-noun' }] };
    expect(classifyResidue('m1', 's1', bad).tolerated).toBe(false);
  });
  it('is safe on an empty allowlist', () => {
    expect(classifyResidue('m1', 's1', { entries: [] }).tolerated).toBe(false);
  });
});
