/**
 * cnxml-render.appendixIdMapFailLoud.test.js — R4-12.
 *
 * buildAppendixIdMap() had a bare `catch {` around buildModuleSections(book,
 * 'appendices') that treated EVERY error as "book has no appendices" and
 * returned empty maps. buildModuleSections() throws fs ENOENT (from
 * readdirSync on the missing appendices structure dir) for that legitimate
 * case, but it also throws SyntaxError from JSON.parse on a corrupt
 * *-structure.json — which the bare catch swallowed too, silently killing
 * all chapter→appendix links while the render exited 0 (violates fail-loud).
 *
 * Fix: only the ENOENT case returns the empty-maps fallback; anything else
 * rethrows.
 *
 * Mocking note: the brief's primary approach (vi.mock of
 * ../lib/module-sections.js, importOriginal + vi.fn(actual.fn)) was tried
 * first and reproducibly misbehaves in this repo's Vitest 4.1.10 — any error
 * thrown by a vi.mock-factory-produced mock is reported as an unhandled test
 * failure whenever the throw crosses into another already-transformed
 * module (buildAppendixIdMap in cnxml-render.js), even when that error is
 * correctly caught internally (the ENOENT case) or correctly propagated to
 * and matched by expect().toThrow() (the corrupt case). This reproduced with
 * a minimal throwaway two-module repro, independent of cnxml-render.js's
 * size/complexity, and is unrelated to this fix's correctness — no
 * `vi.mock()` call exists anywhere else in this repo's test suite (checked).
 * Using the brief's documented fallback instead: real fs fixtures, no
 * mocking — see docs/plans (R4-12 report) for the full repro notes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildAppendixIdMap } from '../cnxml-render.js';

// Same intrinsic REPO_ROOT derivation tools/lib/module-sections.js itself
// uses, so this fixture path resolves identically to how the code under
// test resolves it (never process.cwd() — see project memory).
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const CORRUPT_BOOK = '__r412-corrupt-fixture__';
const corruptBookDir = path.join(REPO_ROOT, 'books', CORRUPT_BOOK);
const corruptAppendicesStructDir = path.join(corruptBookDir, '02-structure', 'appendices');

describe('buildAppendixIdMap error handling (R4-12)', () => {
  it('returns empty maps when the book has no appendices (ENOENT)', () => {
    // No fixture needed: this book slug genuinely does not exist on disk, so
    // buildModuleSections()'s readdirSync throws a real ENOENT.
    const { idMap, moduleLetters } = buildAppendixIdMap('__r412-nonexistent-book__', 'mt-preview');
    expect(idMap.size).toBe(0);
    expect(moduleLetters.size).toBe(0);
  });

  describe('with a corrupt appendices structure file', () => {
    beforeAll(() => {
      fs.mkdirSync(corruptAppendicesStructDir, { recursive: true });
      fs.writeFileSync(
        path.join(corruptAppendicesStructDir, 'appendices-a-corrupt-structure.json'),
        '{ this is not valid json !!!'
      );
    });

    afterAll(() => {
      fs.rmSync(corruptBookDir, { recursive: true, force: true });
    });

    it('rethrows a corrupt-structure error (fail loud)', () => {
      expect(() => buildAppendixIdMap(CORRUPT_BOOK, 'mt-preview')).toThrow(/Unexpected token|JSON/);
    });
  });
});
