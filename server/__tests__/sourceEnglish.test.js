// server/__tests__/sourceEnglish.test.js
/**
 * The tokenisation is part of the METHOD (B3 spec D1). B1's first census read
 * 30-46% low because a non-overlapping bigram regex made a term's visibility
 * depend on its byte offset. The overlapping case below is that defect's pin.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { collectSourceEnglish } = require('../lib/sourceEnglish');

let booksDir;

function writeSource(slug, relPath, text) {
  const p = path.join(booksDir, slug, '02-for-mt', relPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-census-'));
});
afterEach(() => {
  fs.rmSync(booksDir, { recursive: true, force: true });
});

describe('collectSourceEnglish', () => {
  it('emits every unigram of 2+ characters', () => {
    writeSource('bk', 'ch01/m1.md', 'The carbon atom');
    const { strings } = collectSourceEnglish('bk', { booksDir });
    expect(strings).toEqual(expect.arrayContaining(['The', 'carbon', 'atom']));
  });

  it('emits OVERLAPPING bigrams, not offset-locked ones', () => {
    writeSource('bk', 'ch01/m1.md', 'carbon dioxide gas');
    const { strings } = collectSourceEnglish('bk', { booksDir });
    // A non-overlapping tokeniser consumes "dioxide" into the first pair and
    // can never emit the second. Both must be present.
    expect(strings).toEqual(expect.arrayContaining(['carbon dioxide', 'dioxide gas']));
  });

  it('does not join across a newline or punctuation', () => {
    writeSource('bk', 'ch01/m1.md', 'carbon\ndioxide, gas');
    const { strings } = collectSourceEnglish('bk', { booksDir });
    expect(strings).not.toContain('carbon dioxide');
    expect(strings).not.toContain('dioxide gas');
  });

  it('strips SEG comments and bracket-marker openers but keeps their prose', () => {
    writeSource('bk', 'ch01/m1.md', '<!-- SEG:m1:para:x -->[[i:vatns]] flow');
    const { strings } = collectSourceEnglish('bk', { booksDir });
    expect(strings).toContain('vatns');
    expect(strings).not.toContain('SEG');
  });

  it('excludes .md.backup.<timestamp> files', () => {
    writeSource('bk', 'ch01/m1.md', 'alpha');
    writeSource('bk', 'ch01/m1.md.backup.20260101', 'betaword');
    const { strings, filesRead } = collectSourceEnglish('bk', { booksDir });
    expect(filesRead).toBe(1);
    expect(strings).not.toContain('betaword');
  });

  it('reports an absent tree as 0 files rather than throwing', () => {
    expect(collectSourceEnglish('missing', { booksDir })).toMatchObject({
      strings: [],
      filesRead: 0,
    });
  });

  it('reports filesRead 0 for a tree containing no .md files', () => {
    writeSource('bk', 'ch01/notes.txt', 'alpha');
    expect(collectSourceEnglish('bk', { booksDir }).filesRead).toBe(0);
  });
});
