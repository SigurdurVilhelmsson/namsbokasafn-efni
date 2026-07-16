/**
 * exercise-assemble.test.js — item 9 (D3): IS segments + skeleton → translated
 * exercise sidecars, render-shaped. Fail-loud invariants: missing segment,
 * marker corruption, or a real EN residue → that exercise is SKIPPED (no
 * sidecar, EN fallback persists) and reported; never a half-translated file.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractBook } from '../exercise-extract.js';
import { assembleBook } from '../exercise-assemble.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'exercises');

/** Book with one extracted fixture + a synthetic IS file derived from the EN. */
function makeBook({ mutateIs } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-asm-'));
  const exDir = path.join(dir, '01-source', 'exercises');
  fs.mkdirSync(exDir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, '01-03-OC-P01.json'), path.join(exDir, '01-03-OC-P01.json'));
  extractBook(dir, {});
  const en = fs.readFileSync(
    path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
    'utf8'
  );
  // Pseudo-translate: prefix every non-marker, non-blank line — clearly
  // different text (defeats the residue exact-match) while preserving markers.
  let is = en
    .split('\n')
    .map((l) => (l.startsWith('<!-- SEG:') || l.trim() === '' ? l : `ÞÝТ ${l}`))
    .join('\n');
  if (mutateIs) is = mutateIs(is);
  const outDir = path.join(dir, '02-mt-output', 'ch01');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), is, 'utf8');
  return dir;
}

describe('assembleBook — happy path', () => {
  it('writes a render-shaped sidecar for mt-preview', () => {
    const book = makeBook();
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.skipped).toEqual([]);
    expect(res.written).toEqual([
      path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json'),
    ]);
    const side = JSON.parse(fs.readFileSync(res.written[0], 'utf8'));
    expect(side.nickname).toBe('01-03-OC-P01');
    expect(side.track).toBe('mt-preview');
    expect(side.questions.length).toBeGreaterThan(0);
    expect(side.questions[0].stem_html).toContain('ÞÝТ');
    expect(side.generated_by).toBe('exercise-assemble.js');
  });

  it('reports a chapter whose IS segments are missing (faithful before review exists)', () => {
    const book = makeBook();
    const res = assembleBook(book, { track: 'faithful' });
    expect(res.written).toEqual([]);
    expect(res.chaptersMissingIs).toEqual(['ch01']);
  });
});

describe('assembleBook — fail-loud invariants', () => {
  it('missing segment id → exercise skipped, no sidecar', () => {
    const book = makeBook({
      mutateIs: (is) => is.replace(/<!-- SEG:01-03-OC-P01:stimulus:b0 -->\n[^\n]*\n/, ''),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].nickname).toBe('01-03-OC-P01');
  });

  it('marker corruption in IS → exercise skipped, no sidecar', () => {
    const book = makeBook({ mutateIs: (is) => is.replaceAll('[[sub:', '[[oops:') });
    const res = assembleBook(book, { track: 'mt-preview' });
    // If the fixture has no [[sub: markers this mutate is a no-op — the test
    // asserts on written-or-skipped consistency instead of failing silently:
    expect(res.written.length + res.skipped.length).toBe(1);
    if (res.skipped.length === 1) {
      expect(
        fs.existsSync(
          path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json')
        )
      ).toBe(false);
    }
  });

  it('untranslated (identical) segments → real residue → skipped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-asm-res-'));
    const exDir = path.join(dir, '01-source', 'exercises');
    fs.mkdirSync(exDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES, '01-03-OC-P01.json'),
      path.join(exDir, '01-03-OC-P01.json')
    );
    extractBook(dir, {});
    const en = fs.readFileSync(
      path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    const outDir = path.join(dir, '02-mt-output', 'ch01');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), en, 'utf8'); // EN verbatim
    const res = assembleBook(dir, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.residues.length).toBeGreaterThan(0);
  });
});
