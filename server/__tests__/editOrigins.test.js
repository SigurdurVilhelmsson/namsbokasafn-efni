/**
 * The write-path vocabulary (G1.1; spec §5.10 "one constant, pinned by a test"; plan Task 13,
 * decision 9).
 *
 * `origin` on a `segment_edits` row says which writer made it. The live values are the three
 * writers PR1 has; the reserved ones are names later work will use, kept apart so that
 * `propagation` (today's repetition route) and `propagated` (a later term pass) are never merged.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { EDIT_ORIGINS, RESERVED_EDIT_ORIGINS } = require('../lib/editOrigins');

describe('the write-path vocabulary (spec §5.10)', () => {
  it('the live origins are the three PR1 writers', () => {
    expect([...EDIT_ORIGINS]).toEqual(['editor-save', 'propagation', 're-attach']);
  });

  it('the reserved origins are kept for later writers', () => {
    expect([...RESERVED_EDIT_ORIGINS]).toEqual(['note-apply', 'propagated', 'ai-pass']);
  });

  it('no origin is both live and reserved, so propagation and propagated are never merged', () => {
    expect(EDIT_ORIGINS.filter((o) => RESERVED_EDIT_ORIGINS.includes(o))).toEqual([]);
    expect(EDIT_ORIGINS).toContain('propagation');
    expect(RESERVED_EDIT_ORIGINS).toContain('propagated');
  });

  it('both lists are frozen', () => {
    expect(Object.isFrozen(EDIT_ORIGINS)).toBe(true);
    expect(Object.isFrozen(RESERVED_EDIT_ORIGINS)).toBe(true);
    expect(() => EDIT_ORIGINS.push('x')).toThrow(TypeError);
    expect(EDIT_ORIGINS).toHaveLength(3);
  });
});
