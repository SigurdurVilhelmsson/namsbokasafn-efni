/**
 * The per-segment operation budget (term-pass v2). The flat cap of 6 bit through the PROMPT,
 * not the gate: in the 2026-10-29 ch10 pilot the model stopped at 6 operations and flagged
 * `needs-rewrite` on 2–4 segments per effort (medium 4, high 3, xhigh 2), so the gate never
 * logged a `segment-op-limit`. Each of those segments had 5–12 English uses of its offered
 * rulings. The budget scales the cap's own rationale (6 = two uses × a term change and up to
 * two agreements) to the uses a segment actually has: max(6, 3 × uses).
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { segmentOpBudget, countEnUses, OPS_PER_EN_USE, DEFAULT_LIMITS } from '../ai-review/gate.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';
import { parseLayerFile } from '../lib/mt-layers.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const r = (id, en) => ({ id, en });

describe('countEnUses', () => {
  it('counts each word-bounded use of an offered ruling in the visible English', () => {
    expect(countEnUses({ en: 'An atom and another atom.', rulings: [r('atom', ['atom'])] })).toBe(
      2
    );
  });

  it('counts a satisfied or context ruling too (over-inclusion is intended)', () => {
    const rulings = [r('atom', ['atom']), r('temperature', ['temperature'])];
    expect(countEnUses({ en: 'The atom at a high temperature.', rulings })).toBe(2);
  });

  it('gives the longer ruling a phrase it covers (phrase precedence)', () => {
    const rulings = [r('cell', ['cell']), r('fuel-cell', ['fuel cell'])];
    // `cell` inside `fuel cell` is the longer ruling's use, not a second one.
    expect(countEnUses({ en: 'A fuel cell is a cell.', rulings })).toBe(2);
  });

  it('counts overlapping forms of one ruling at one place once', () => {
    const rulings = [r('crystalline-solid', ['crystalline solid', 'solid'])];
    expect(countEnUses({ en: 'A crystalline solid melts.', rulings })).toBe(1);
  });

  it('does not count a use a reader never sees (inside a sub marker)', () => {
    expect(countEnUses({ en: 'E[[sub:cell]] is measured.', rulings: [r('cell', ['cell'])] })).toBe(
      0
    );
  });

  it('folds hyphens as the work list does', () => {
    const rulings = [r('fuel-cell', ['fuel cell'])];
    expect(countEnUses({ en: 'Fuel-cell vehicles.', rulings })).toBe(1);
  });

  it('refuses malformed arguments (a caller bug fails the run)', () => {
    expect(() => countEnUses({ en: 3, rulings: [] })).toThrow(TypeError);
    expect(() => countEnUses({ en: '', rulings: null })).toThrow(TypeError);
    expect(() => countEnUses({ en: '', rulings: [{ id: 'x' }] })).toThrow(TypeError);
  });
});

describe('segmentOpBudget', () => {
  it('scales by three operations per English use', () => {
    expect(OPS_PER_EN_USE).toBe(3);
  });

  it('never goes below the flat cap of 6', () => {
    expect(DEFAULT_LIMITS.maxAcceptedOpsPerSegment).toBe(6);
    expect(segmentOpBudget({ en: 'No term here.', rulings: [r('atom', ['atom'])] })).toBe(6);
    expect(segmentOpBudget({ en: 'An atom.', rulings: [r('atom', ['atom'])] })).toBe(6);
    expect(segmentOpBudget({ en: 'An atom, an atom.', rulings: [r('atom', ['atom'])] })).toBe(6);
  });

  it('is 3 × uses above the floor', () => {
    expect(segmentOpBudget({ en: 'atom atom atom', rulings: [r('atom', ['atom'])] })).toBe(9);
  });

  // The pilot's worst case: five uses of `crystalline solid`, which every effort left unfixed
  // (flagged "too many changes … within the operation limit"). The request's own rulings.
  it('gives the pilot segment m68770:para:fs-idp156889184 a budget of 36 (12 uses)', () => {
    const set = loadRulingSet(
      'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json'
    );
    const file = path.join(REPO, 'books/efnafraedi-2e/02-for-mt/ch10/m68770-segments.en.md');
    const en = parseLayerFile(fs.readFileSync(file, 'utf8')).records.find(
      (x) => x.key === 'm68770:para:fs-idp156889184'
    ).body;
    const ids = [
      'amorphous',
      'amorphous-solid',
      'atom',
      'covalent-network-solid',
      'crystalline-solid',
      'molecular-solid',
      'temperature',
    ];
    const rulings = ids.map((id) => set.byId.get(id));
    expect(countEnUses({ en, rulings })).toBe(12);
    expect(segmentOpBudget({ en, rulings })).toBe(36);
  });
});
