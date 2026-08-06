import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const terms = JSON.parse(
  readFileSync(new URL('./fixtures/c24-terms.json', import.meta.url), 'utf-8')
);
const segments = JSON.parse(
  readFileSync(new URL('./fixtures/c24-segments.json', import.meta.url), 'utf-8')
);

// The fixture is an ORACLE INPUT. If it loses these properties the golden keeps
// passing while covering nothing. Each assertion names the production fact it
// mirrors (spec §4.10 / §4.11).
describe('c24 fixture realism', () => {
  const allTr = terms.headwords.flatMap((h) => h.translations);

  it('is fallback-heavy for a chemistry book, as production is (709 vs ~28194)', () => {
    const chem = allTr.filter((t) => t.subjects.includes('chemistry')).length;
    expect(chem / allTr.length).toBeLessThan(0.15);
  });

  it('contains within-subject collisions, which are 95.9% of real collisions', () => {
    const collisions = terms.headwords.filter((h) => {
      const bySubject = new Map();
      for (const t of h.translations) {
        for (const s of t.subjects) bySubject.set(s, (bySubject.get(s) || 0) + 1);
      }
      return [...bySubject.values()].some((n) => n > 1);
    });
    expect(collisions.length).toBeGreaterThanOrEqual(5);
  });

  it('contains a cross-subject-only collision, which the tier partition resolves', () => {
    const cross = terms.headwords.filter((h) => {
      if (h.translations.length < 2) return false;
      const subs = new Set(h.translations.flatMap((t) => t.subjects));
      return subs.size === h.translations.length;
    });
    expect(cross.length).toBeGreaterThanOrEqual(1);
  });

  it('contains a 72-form inflection list, production’s measured maximum', () => {
    expect(Math.max(...allTr.map((t) => (t.inflections || []).length))).toBe(72);
  });

  it('contains the mól / "mól (m)" shape the audit counterexample needs', () => {
    expect(
      allTr.some((t) => (t.inflections || []).some((f) => f.includes('(') && f.includes(' ')))
    ).toBe(true);
  });

  it('contains short abbreviation headwords, which dominate real collisions', () => {
    expect(terms.headwords.filter((h) => h.english.length <= 2).length).toBeGreaterThanOrEqual(3);
  });

  it('contains proposed rows, so the approved-beats-proposed tiebreak is exercised', () => {
    // Production has ZERO proposed, so this path is otherwise never covered anywhere.
    expect(allTr.some((t) => t.status === 'proposed')).toBe(true);
    expect(allTr.some((t) => t.status === 'approved')).toBe(true);
  });

  it('has multi-segment input, which nothing in the suite exercises today', () => {
    expect(segments.length).toBeGreaterThanOrEqual(20);
  });

  it('has segments whose EN actually contains fixture headwords', () => {
    const words = new Set(terms.headwords.map((h) => h.english.toLowerCase()));
    const hit = segments.filter((s) =>
      [...words].some((w) => s.enContent.toLowerCase().includes(w))
    );
    expect(hit.length).toBeGreaterThanOrEqual(10);
  });
});
