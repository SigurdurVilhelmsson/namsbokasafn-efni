/**
 * server/public/js/chapter-label.js — client-side chapter DISPLAY labels
 * (item 16 PR2, I14-R9). Display half of the item-14 appendices contract:
 * -1 | '-1' | 'appendices' → 'Viðaukar' (compact 'Við.'); integers →
 * 'Kafli N' (compact 'KN'); unrecognized input falls back to legacy
 * concatenation. Conversion half (dirs/argv) lives in server/lib/
 * chapterLabel.js — separate module, do not merge.
 *
 * Also carries the static adoption pins (structuralBackstopWiring style):
 * every swept view/JS file must include the helper and build labels
 * through it, never by raw concatenation.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { full, compact } = require('../public/js/chapter-label');

describe('full()', () => {
  it('maps every appendices dialect to Viðaukar', () => {
    expect(full(-1)).toBe('Viðaukar');
    expect(full('-1')).toBe('Viðaukar');
    expect(full('appendices')).toBe('Viðaukar');
  });

  it('renders numbered chapters as Kafli N (string or number)', () => {
    expect(full(5)).toBe('Kafli 5');
    expect(full('12')).toBe('Kafli 12');
    expect(full(0)).toBe('Kafli 0'); // ch00 front-matter is real
  });

  it('falls back to legacy concatenation on unrecognized input', () => {
    expect(full('x')).toBe('Kafli x');
  });
});

describe('compact()', () => {
  it('maps every appendices dialect to Við.', () => {
    expect(compact(-1)).toBe('Við.');
    expect(compact('-1')).toBe('Við.');
    expect(compact('appendices')).toBe('Við.');
  });

  it('renders numbered chapters as KN — no space, matching existing K5-style tags', () => {
    expect(compact(5)).toBe('K5');
    expect(compact('12')).toBe('K12');
  });

  it('falls back to legacy concatenation on unrecognized input', () => {
    expect(compact('x')).toBe('Kx');
  });
});

describe('UMD contract', () => {
  it('module is requirable from CJS and exports full + compact', () => {
    const mod = require('../public/js/chapter-label');
    expect(typeof mod.full).toBe('function');
    expect(typeof mod.compact).toBe('function');
  });
});
