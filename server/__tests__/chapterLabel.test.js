/**
 * Dialect matrix for the appendices chapter-label converter (item 14).
 * Contract: -1 is canonical in server memory/DB; 'appendices' exists only
 * as directory name and CLI argv; this module is the only translator.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normalizeChapter, chapterDir, cliChapterArg } = require('../lib/chapterLabel');

describe('normalizeChapter', () => {
  it('maps the word appendices to -1', () => {
    expect(normalizeChapter('appendices')).toBe(-1);
  });
  it('maps the string "-1" to -1', () => {
    expect(normalizeChapter('-1')).toBe(-1);
  });
  it('passes the number -1 through', () => {
    expect(normalizeChapter(-1)).toBe(-1);
  });
  it('parses numeric strings', () => {
    expect(normalizeChapter('3')).toBe(3);
    expect(normalizeChapter('21')).toBe(21);
  });
  it('passes integers through (including 0 — front-matter is real)', () => {
    expect(normalizeChapter(3)).toBe(3);
    expect(normalizeChapter(0)).toBe(0);
  });
  it('returns null on unrecognizable input (no silent fallthrough)', () => {
    expect(normalizeChapter('chappendices')).toBeNull();
    expect(normalizeChapter('ch03')).toBeNull();
    expect(normalizeChapter('')).toBeNull();
    expect(normalizeChapter('3.5')).toBeNull();
    expect(normalizeChapter(3.5)).toBeNull();
    expect(normalizeChapter(NaN)).toBeNull();
    expect(normalizeChapter(undefined)).toBeNull();
    expect(normalizeChapter(null)).toBeNull();
  });
});

describe('chapterDir', () => {
  it('maps -1 to the appendices directory', () => {
    expect(chapterDir(-1)).toBe('appendices');
  });
  it('zero-pads regular chapters', () => {
    expect(chapterDir(3)).toBe('ch03');
    expect(chapterDir(21)).toBe('ch21');
    expect(chapterDir(0)).toBe('ch00');
  });
});

describe('cliChapterArg', () => {
  it('maps -1 to the word appendices (tools CHAPTER_OPTION dialect)', () => {
    expect(cliChapterArg(-1)).toBe('appendices');
  });
  it('stringifies regular chapters without padding', () => {
    expect(cliChapterArg(3)).toBe('3');
    expect(cliChapterArg(21)).toBe('21');
  });
});
