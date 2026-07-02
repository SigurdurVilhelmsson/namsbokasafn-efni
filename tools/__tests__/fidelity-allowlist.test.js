import { describe, it, expect } from 'vitest';
import { classifyDiff } from '../lib/fidelity-allowlist.js';

const AL = {
  entries: [
    {
      moduleId: 'm1',
      tag: 'emphasis',
      diff: -1,
      class: 'benign',
      reason: 'checker counting artifact',
    },
    {
      moduleId: 'm2',
      tag: 'para',
      diff: -7,
      class: 'known-loss-deferred',
      reason: 'nested para/list',
      pointer: 'Track C',
    },
  ],
};

describe('classifyDiff', () => {
  it('returns benign with reason on an exact benign match', () => {
    expect(classifyDiff('m1', 'emphasis', -1, AL)).toEqual({
      status: 'benign',
      reason: 'checker counting artifact',
    });
  });
  it('returns known-loss-deferred with reason+pointer', () => {
    expect(classifyDiff('m2', 'para', -7, AL)).toEqual({
      status: 'known-loss-deferred',
      reason: 'nested para/list',
      pointer: 'Track C',
    });
  });
  it('is unexplained when the diff value drifted (fail-loud)', () => {
    expect(classifyDiff('m2', 'para', -8, AL).status).toBe('unexplained');
  });
  it('is unexplained for an unlisted module/tag', () => {
    expect(classifyDiff('m9', 'sub', -1, AL).status).toBe('unexplained');
  });
  it('is unexplained when a matched entry has an invalid class (typo → fail-loud, never silently escapes counting)', () => {
    const bad = {
      entries: [{ moduleId: 'm3', tag: 'sub', diff: -1, class: 'beneign', reason: 'typo' }],
    };
    expect(classifyDiff('m3', 'sub', -1, bad).status).toBe('unexplained');
  });
  it('is unexplained when a known-loss-deferred entry has no pointer (a real loss must stay tracked, not silently green)', () => {
    const noPtr = {
      entries: [
        { moduleId: 'm4', tag: 'para', diff: -3, class: 'known-loss-deferred', reason: 'nested' },
      ],
    };
    expect(classifyDiff('m4', 'para', -3, noPtr).status).toBe('unexplained');
  });
});
