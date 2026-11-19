// G1.7: the MT tools word a study-freeze marker as the freeze (never to be cleared) and any other
// marker as "editing started". Wording only; mtRunDecision is pinned elsewhere.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lockKindOf, lockedBreakdown } from '../api-translate.js';
import { FREEZE_LOCK_BODY } from '../lib/mt-lock.cjs';

const dir = mkdtempSync(path.join(tmpdir(), 'lock-wording-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** An output path whose marker holds `body` (null: no marker). */
function unit(name, body) {
  const out = path.join(dir, `${name}-segments.is.md`);
  if (body !== null) writeFileSync(path.join(dir, `${name}-segments.locked`), body);
  return out;
}
const frozen = unit('a', FREEZE_LOCK_BODY);
const edited = unit('b', JSON.stringify({ lockedAt: '2026-08-22T00:00:00.000Z', reason: 'edit' }));

describe('lockKindOf', () => {
  it('names the exact freeze marker as freeze', () => {
    expect(lockKindOf(frozen)).toBe('freeze');
  });
  it('names any other marker as editing', () => {
    expect(lockKindOf(edited)).toBe('editing');
  });
});

describe('lockedBreakdown', () => {
  it('a freeze-only run names the freeze and not editing', () => {
    const t = lockedBreakdown([frozen, frozen]);
    expect([t.includes('2 study freeze (G1.7)'), t.includes('editing started')]).toEqual([
      true,
      false,
    ]);
  });
  it('an editing-only run keeps the editing wording and not the freeze', () => {
    const t = lockedBreakdown([edited]);
    expect([t.includes('1 editing started'), t.includes('freeze')]).toEqual([true, false]);
  });
  it('a mixed run names and counts both kinds', () => {
    const t = lockedBreakdown([frozen, edited, edited]);
    expect([t.includes('1 study freeze (G1.7)'), t.includes('2 editing started')]).toEqual([
      true,
      true,
    ]);
  });
});
