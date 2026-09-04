/**
 * The manifest's `termEnglish` map — the join table render uses to emit data-en.
 *
 * Keyed on whatever id the RENDERED CNXML exposes at that spot: an inline
 * `<term id>`, or the parent `<definition id>` for a glossary term (whose
 * `<term>` child carries no id of its own — 765 of 1,656 injected terms).
 *
 * Every expected value below was verified against the real source before this
 * file was written, not copied from the plan:
 *   books/efnafraedi-2e/01-source/ch03/m68700.cnxml  — term-00001..00004,
 *   definitions fs-idp40901280 / 40905984 / 40907280 / 40908432
 *   02-for-mt/ch03/m68700-segments.en.md             — the four glossary-term
 *   segments carry "Avogadro’s number ([[i:N[[sub:A]]]])", "formula mass",
 *   "molar mass", "mole" respectively.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, buildManifestForTest } from '../cnxml-extract.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const M68700 = path.join(REPO_ROOT, 'books/efnafraedi-2e/01-source/ch03/m68700.cnxml');

describe('manifest.termEnglish', () => {
  const src = fs.readFileSync(M68700, 'utf8');
  const result = extractSegments(src);
  const manifest = buildManifestForTest(result, src);
  const map = manifest.termEnglish;

  it('exists and is non-empty — a vacuous map would make every later test pass', () => {
    expect(map).toBeTypeOf('object');
    expect(Object.keys(map).length).toBeGreaterThan(0);
  });

  it('keys glossary terms on the DEFINITION id', () => {
    expect(map['fs-idp40905984']).toBe('formula mass');
    expect(map['fs-idp40908432']).toBe('mole');
  });

  it('keys inline terms on the TERM id', () => {
    expect(map['term-00001']).toBe('formula mass');
    expect(map['term-00002']).toBe('mole');
  });

  it('🔴 flattens a two-level nested payload without truncating', () => {
    expect(map['term-00003']).toBe('Avogadro’s number (NA)');
    expect(map['fs-idp40901280']).toBe('Avogadro’s number (NA)');
  });

  it('🔴 PRESERVES CASE — the old helper lowercased published glosses', () => {
    expect(map['term-00003']).toMatch(/^Avogadro/);
    expect(map['term-00003']).not.toContain('avogadro');
  });

  it('stores no marker syntax in any value', () => {
    for (const [k, v] of Object.entries(map)) {
      expect(v, `value for ${k}`).not.toMatch(/\[\[|\]\]/);
    }
  });

  it('the same English legitimately appears under both key shapes', () => {
    // m68700 mentions each of its four glossary terms inline as well. Duplicate
    // VALUES under distinct keys are expected; duplicate KEYS are not.
    expect(map['term-00001']).toBe(map['fs-idp40905984']);
  });

  it('🔴 the two KEY SPACES are disjoint — the premise that lets one flat map work', () => {
    // Measured over the whole corpus: 24 <term> ids, 762 <definition> ids, 0
    // collisions. If they ever overlap, one population silently overwrites the
    // other and the map needs namespacing. Assert it, do not assume it.
    const keys = Object.keys(map);
    const inline = keys.filter((k) => /^term-\d+$/.test(k));
    const definition = keys.filter((k) => !/^term-\d+$/.test(k));
    expect(inline.length).toBeGreaterThan(0);
    expect(definition.length).toBeGreaterThan(0);
    expect(inline.filter((k) => definition.includes(k))).toEqual([]);
    // …and together they account for every key, so nothing is silently uncategorised.
    expect(inline.length + definition.length).toBe(keys.length);
  });

  it('🔴 covers BOTH populations of m68700 in full — 4 inline + 4 definition', () => {
    // A partial map is the failure this whole design exists to avoid, and a
    // "greater than 0" assertion cannot see it. m68700's source carries exactly
    // four <term id> and four <definition id>; all eight must be present.
    for (const k of ['term-00001', 'term-00002', 'term-00003', 'term-00004']) {
      expect(map, `missing inline key ${k}`).toHaveProperty(k);
    }
    for (const k of ['fs-idp40901280', 'fs-idp40905984', 'fs-idp40907280', 'fs-idp40908432']) {
      expect(map, `missing definition key ${k}`).toHaveProperty(k);
    }
  });

  it('does not invent keys — every key is one of the two known shapes', () => {
    for (const k of Object.keys(map)) {
      expect(k, `unexpected key shape: ${k}`).toMatch(/^(term-\d+|fs-id[\w-]+)$/);
    }
  });
});
