import { describe, it, expect } from 'vitest';
import { mtRunDecision } from '../api-translate.js';

// Pure decision helper: given (exists, force, locked), what does api-translate
// do with one module's MT output? A `.locked` marker (tools/lib/mt-lock.cjs)
// always wins — even over --force — because it means editing has begun and
// the MT baseline must never be clobbered again.
describe('api-translate lock decision', () => {
  it('locked module is skipped even with --force', () => {
    expect(mtRunDecision({ exists: true, force: true, locked: true })).toBe('locked-skip');
  });

  it('unlocked existing needs --force (accident guard preserved)', () => {
    expect(mtRunDecision({ exists: true, force: false, locked: false })).toBe('skip');
    expect(mtRunDecision({ exists: true, force: true, locked: false })).toBe('write');
  });

  it('unlocked absent is written', () => {
    expect(mtRunDecision({ exists: false, force: false, locked: false })).toBe('write');
  });
});
