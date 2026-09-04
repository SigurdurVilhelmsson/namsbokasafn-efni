/**
 * The join table render reads: books/<book>/02-structure/<chapterDir>/<mod>-manifest.json
 * → one termEnglish map PER MODULE.
 *
 * 🔴 PER-MODULE IS THE CORRECTNESS PROPERTY, NOT AN IMPLEMENTATION DETAIL.
 * `term-0000N` is OpenStax's own id and restarts in every module. A wrong-module
 * map does not MISS — it HITS with wrong values, which a hits/total counter
 * cannot see. Measured over ch03 of the two live books: a flat chapter merge
 * collides 31 of 79 (module, key) pairs and all 31 carry DIFFERENT English
 * (chemistry 11, organic 20). That is §C82 L144 — a populated slot holding the
 * wrong text is worse than an empty one.
 *
 * Corpus premises below were verified before this file was written:
 *   lifraen-efnafraedi/02-structure/ch11 → 13 manifests, all key-absent
 *   efnafraedi-2e/02-structure/ch99      → does not exist
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadChapterTermEnglish, classifyManifest } from '../lib/term-english-map.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('classifyManifest — the states a manifest can be in', () => {
  it('ok: termEnglish present and non-empty, moduleId agrees', () => {
    const r = classifyManifest('m68700', {
      moduleId: 'm68700',
      termEnglish: { 'term-00001': 'formula mass' },
    });
    expect(r.state).toBe('ok');
    expect(r.map['term-00001']).toBe('formula mass');
  });

  it('empty: the module legitimately has no terms — NOT the same as a stale manifest', () => {
    expect(classifyManifest('m68699', { moduleId: 'm68699', termEnglish: {} }).state).toBe('empty');
  });

  it('key-absent: a pre-Task-2 vintage — 510 of 523 manifests today', () => {
    const r = classifyManifest('m00130', { moduleId: 'm00130', segmentCount: 12 });
    expect(r.state).toBe('key-absent');
    expect(r.map).toBeNull();
  });

  it('🔴 moduleId-mismatch: the guard that stops a wrong-module map being joined', () => {
    const r = classifyManifest('m68704', {
      moduleId: 'm68703',
      termEnglish: { 'term-00001': 'concentration' },
    });
    expect(r.state).toBe('moduleId-mismatch');
    expect(r.map).toBeNull();
  });

  it('unreadable: a non-object payload is "nothing" in a shape a gate can walk past (§C21)', () => {
    // §C21's lesson: a committed file holding the four bytes `null` PARSED, so a
    // gate keyed on one representation of "nothing" was walked past by another.
    expect(classifyManifest('m68700', null).state).toBe('unreadable');
    expect(classifyManifest('m68700', []).state).toBe('unreadable');
  });
});

describe('loadChapterTermEnglish — against the real corpus', () => {
  it('loads a module map and keys it on the module', () => {
    const { byModule } = loadChapterTermEnglish('efnafraedi-2e', 'ch03');
    expect(Object.keys(byModule.get('m68700'))).toHaveLength(8);
    expect(byModule.get('m68700')['term-00001']).toBe('formula mass');
    expect(byModule.get('m68700')['fs-idp40901280']).toBe('Avogadro’s number (NA)');
  });

  it('🔴 the SAME key means different things in different modules — a flat merge is wrong', () => {
    const { byModule } = loadChapterTermEnglish('lifraen-efnafraedi', 'ch03');
    expect(byModule.get('m00032')['term-00001']).toBe('functional group');
    expect(byModule.get('m00033')['term-00001']).toBe('alkanes');
  });

  it('reports key-absent for an un-re-extracted chapter, and offers no map for it', () => {
    const { byModule, state } = loadChapterTermEnglish('lifraen-efnafraedi', 'ch11');
    const states = [...state.values()];
    expect(states.length).toBeGreaterThan(0); // control: the chapter was found
    expect(states.every((s) => s === 'key-absent')).toBe(true);
    expect(byModule.size).toBe(0);
  });

  it('a chapter that does not exist yields empty maps, not a throw', () => {
    const r = loadChapterTermEnglish('efnafraedi-2e', 'ch99');
    expect(r.byModule.size).toBe(0);
    expect(r.state.size).toBe(0);
  });
});

describe('cwd independence — the server renders with cwd=server/', () => {
  const originalCwd = process.cwd();
  afterAll(() => process.chdir(originalCwd));

  it('🔴 resolves against import.meta.url, not process.cwd()', () => {
    process.chdir(path.join(REPO_ROOT, 'server'));
    // PROVE THE CHDIR ACTUALLY MOVED. Without this the test is vacuous — it would
    // pass identically from the repo root, where a cwd-relative path also works.
    expect(fs.existsSync('books')).toBe(false);
    const { byModule } = loadChapterTermEnglish('efnafraedi-2e', 'ch03');
    expect(byModule.get('m68700')['term-00001']).toBe('formula mass');
  });
});
