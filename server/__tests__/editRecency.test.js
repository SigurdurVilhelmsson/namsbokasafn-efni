/**
 * Canonical "newest saved content wins" comparator (item 13, Part 0).
 * One rule for preview, apply, and both approve guards. created_at is
 * SQLite CURRENT_TIMESTAMP TEXT (lexicographic == chronological); id
 * breaks same-second ties. id order alone is NOT recency: in-place
 * re-saves refresh created_at but keep the row id.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isNewer, pickLatest } = require('../lib/editRecency');

const e = (id, createdAt) => ({ id, created_at: createdAt });

describe('editRecency.isNewer', () => {
  it('later created_at wins regardless of id (in-place re-save case)', () => {
    expect(isNewer(e(1, '2026-07-17 10:05:00'), e(2, '2026-07-17 10:03:00'))).toBe(true);
    expect(isNewer(e(2, '2026-07-17 10:03:00'), e(1, '2026-07-17 10:05:00'))).toBe(false);
  });

  it('same-second tie falls back to higher id (F15 convention)', () => {
    expect(isNewer(e(2, '2026-07-17 12:00:00'), e(1, '2026-07-17 12:00:00'))).toBe(true);
    expect(isNewer(e(1, '2026-07-17 12:00:00'), e(2, '2026-07-17 12:00:00'))).toBe(false);
  });

  it('is a strict order: an edit is never newer than itself', () => {
    expect(isNewer(e(1, '2026-07-17 12:00:00'), e(1, '2026-07-17 12:00:00'))).toBe(false);
  });

  it('tolerates missing created_at (treated as oldest)', () => {
    expect(isNewer(e(2, '2026-07-17 12:00:00'), e(1, null))).toBe(true);
    expect(isNewer(e(1, null), e(2, '2026-07-17 12:00:00'))).toBe(false);
  });
});

describe('editRecency.pickLatest', () => {
  it('returns the newest of a list', () => {
    const winner = pickLatest([
      e(3, '2026-07-17 10:00:00'),
      e(1, '2026-07-17 10:05:00'),
      e(2, '2026-07-17 10:00:00'),
    ]);
    expect(winner.id).toBe(1);
  });

  it('returns null for an empty list', () => {
    expect(pickLatest([])).toBeNull();
  });
});
