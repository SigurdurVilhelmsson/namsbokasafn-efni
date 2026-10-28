/**
 * The ruling-scope rule of the code gate (tools/ai-review/scope.js).
 *
 * Three shapes, chapters as `chNN`/`appendices` strings, and the status rule: a ruling whose
 * width is only PROPOSED admits no operation at all ([USER] has not ruled it yet).
 */
import { describe, it, expect } from 'vitest';
import {
  CHAPTER_DIR_RE,
  SCOPE_STATUSES,
  isChapterDir,
  isValidScope,
  inScope,
  scopeReasons,
} from '../ai-review/scope.js';

const BOOK = { kind: 'book' };
const CH17 = { kind: 'chapters', chapters: ['ch17'] };
const NOT_CH17 = { kind: 'exclude', chapters: ['ch17'] };

describe('chapter tokens', () => {
  it('pins the token pattern', () => {
    expect(CHAPTER_DIR_RE.source).toBe('^(ch\\d\\d|appendices)$');
  });
  it.each(['ch00', 'ch17', 'ch21', 'appendices'])('accepts %s', (c) => {
    expect(isChapterDir(c)).toBe(true);
  });
  it.each(['ch1', 'ch017', '17', 'Ch17', 'appendix', '', 0, -1, 17, null, undefined])(
    'refuses %s (legacy integers mean nothing here)',
    (c) => {
      expect(isChapterDir(c)).toBe(false);
    }
  );
});

describe('isValidScope — exactly three shapes', () => {
  it.each([BOOK, CH17, NOT_CH17, { kind: 'chapters', chapters: ['ch02', 'appendices'] }])(
    'accepts %j',
    (s) => {
      expect(isValidScope(s)).toBe(true);
    }
  );
  it.each([
    null,
    'book',
    {},
    { kind: 'books' },
    { kind: 'book', chapters: ['ch01'] },
    { kind: 'chapters' },
    { kind: 'chapters', chapters: 'ch17' },
    { kind: 'chapters', chapters: [17] },
    { kind: 'chapters', chapters: [0] },
    { kind: 'exclude', chapters: ['ch1'] },
    { kind: 'chapters', chapters: ['ch17'], note: 'extra key' },
  ])('refuses %j', (s) => {
    expect(isValidScope(s)).toBe(false);
  });
});

describe('inScope', () => {
  it('a book scope admits any chapter', () => {
    expect(inScope(BOOK, 'appendices')).toBe(true);
  });
  it('a chapters scope admits a listed chapter', () => {
    expect(inScope(CH17, 'ch17')).toBe(true);
  });
  it('a chapters scope refuses an unlisted chapter', () => {
    expect(inScope(CH17, 'ch01')).toBe(false);
  });
  it('an exclude scope refuses a listed chapter', () => {
    expect(inScope(NOT_CH17, 'ch17')).toBe(false);
  });
  it('an exclude scope admits an unlisted chapter', () => {
    expect(inScope(NOT_CH17, 'ch18')).toBe(true);
  });
  it('fails closed on a malformed scope', () => {
    expect(inScope({ kind: 'everything' }, 'ch17')).toBe(false);
  });
  it('fails closed on a malformed chapter, even under a book scope', () => {
    expect(inScope(BOOK, 17)).toBe(false);
  });
});

describe('scopeReasons — the status rule', () => {
  it('pins the three statuses', () => {
    expect(SCOPE_STATUSES).toEqual(['default', 'proposed', 'ruled']);
  });
  it('a proposed width admits nothing, even in its own chapter (scope-unruled)', () => {
    expect(scopeReasons({ scope: CH17, scopeStatus: 'proposed' }, 'ch17')).toEqual([
      'scope-unruled',
    ]);
  });
  it('the same width once ruled admits its chapter (control)', () => {
    expect(scopeReasons({ scope: CH17, scopeStatus: 'ruled' }, 'ch17')).toEqual([]);
  });
  it('a ruled width refuses a chapter outside it (scope-excluded)', () => {
    expect(scopeReasons({ scope: CH17, scopeStatus: 'ruled' }, 'ch00')).toEqual(['scope-excluded']);
  });
  it('a proposed width outside its chapter reports both reasons', () => {
    expect(scopeReasons({ scope: CH17, scopeStatus: 'proposed' }, 'ch00')).toEqual([
      'scope-unruled',
      'scope-excluded',
    ]);
  });
  it('a default book scope admits (control)', () => {
    expect(scopeReasons({ scope: BOOK, scopeStatus: 'default' }, 'ch08')).toEqual([]);
  });
  it('an unknown status is invalid, not admitted', () => {
    expect(scopeReasons({ scope: BOOK, scopeStatus: 'approved' }, 'ch08')).toEqual([
      'scope-invalid',
    ]);
  });
  it('a malformed scope is invalid, not admitted', () => {
    expect(
      scopeReasons({ scope: { kind: 'chapters', chapters: [17] }, scopeStatus: 'ruled' }, 'ch17')
    ).toEqual(['scope-invalid']);
  });
});
