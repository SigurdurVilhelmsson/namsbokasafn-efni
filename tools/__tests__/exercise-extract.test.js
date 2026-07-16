/**
 * exercise-extract.test.js — item 9 (D3): 01-source/exercises/*.json →
 * per-chapter segments + skeleton sidecars. Deterministic ids, idempotent
 * re-runs, 18a→ch18 fold, private solutions excluded, malformed JSON = loud
 * per-exercise skip. Fixtures are VERBATIM copies of live cache files
 * (see fixtures/exercises/) — do not edit them.
 *
 * Fixture choices (verified with grep):
 * - 01-03-OC-P01.json: multi-question + stimulus + solutions (required)
 * - 18a-04-OC-P01.json: 18a chapter-token oddity (required)
 * - 01-04-OC-P04.json: img-bearing stem (selected for image property)
 * - 15-99-OC-AP33.json: table-bearing solution (selected for table property)
 * - 01-99-OC-AP04.json: solutions_are_public=false (selected for privacy property)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractBook } from '../exercise-extract.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'exercises');

/** Build a throwaway book dir with 01-source/exercises from fixtures. */
function makeBook(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-extract-'));
  const exDir = path.join(dir, '01-source', 'exercises');
  fs.mkdirSync(exDir, { recursive: true });
  for (const n of names) {
    fs.copyFileSync(path.join(FIXTURES, n), path.join(exDir, n));
  }
  return dir;
}

describe('extractBook', () => {
  it('writes per-chapter segments with deterministic SEG ids', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    const res = extractBook(book, {});
    expect(res.failures).toEqual([]);
    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    expect(seg).toContain('<!-- SEG:01-03-OC-P01:stimulus:b0 -->');
    expect(seg).toMatch(/<!-- SEG:01-03-OC-P01:stem:\d+-b0 -->/);
    const skel = JSON.parse(
      fs.readFileSync(path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json'), 'utf8')
    );
    const ex = skel.exercises['01-03-OC-P01'];
    expect(ex.source_uid).toBe('37538@3');
    expect(ex.question_order.length).toBeGreaterThan(0);
    expect(ex.fields.stimulus.slots).toBeGreaterThan(0);
  });

  it('folds the 18a chapter token into ch18', () => {
    const book = makeBook(['18a-04-OC-P01.json']);
    const res = extractBook(book, {});
    expect(res.failures).toEqual([]);
    expect(fs.existsSync(path.join(book, '02-for-mt', 'ch18', 'exercises-segments.en.md'))).toBe(
      true
    );
    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch18', 'exercises-segments.en.md'),
      'utf8'
    );
    expect(seg).toContain('SEG:18a-04-OC-P01:'); // nickname keeps its identity
  });

  it('is idempotent — re-run output is byte-identical', () => {
    const book = makeBook(['01-03-OC-P01.json', '18a-04-OC-P01.json']);
    extractBook(book, {});
    const segPath = path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md');
    const skelPath = path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json');
    const seg1 = fs.readFileSync(segPath, 'utf8');
    const skel1 = fs.readFileSync(skelPath, 'utf8');
    extractBook(book, {});
    expect(fs.readFileSync(segPath, 'utf8')).toBe(seg1);
    expect(fs.readFileSync(skelPath, 'utf8')).toBe(skel1);
  });

  it('skips a malformed JSON loudly and continues', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    fs.writeFileSync(path.join(book, '01-source', 'exercises', '01-04-OC-P99.json'), '{broken');
    const res = extractBook(book, {});
    expect(res.failures.map((f) => f.nickname)).toEqual(['01-04-OC-P99']);
    // the good exercise still extracted:
    expect(fs.existsSync(path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'))).toBe(
      true
    );
  });

  it('never writes into 01-source', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    const before = fs.readdirSync(path.join(book, '01-source', 'exercises'));
    extractBook(book, {});
    expect(fs.readdirSync(path.join(book, '01-source', 'exercises'))).toEqual(before);
  });

  it('excludes solutions when solutions_are_public is false', () => {
    const book = makeBook(['01-99-OC-AP04.json']);
    extractBook(book, {});
    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    expect(seg).not.toMatch(/:sol:/);
  });
});
