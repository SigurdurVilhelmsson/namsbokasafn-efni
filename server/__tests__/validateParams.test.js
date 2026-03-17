/**
 * Parameter Validation Middleware Tests
 *
 * Tests validateBookChapter and validateModule middleware functions.
 * No DB dependencies — uses mock req/res/next objects.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateBookChapter, validateModule } = require('../middleware/validateParams');

/**
 * Create mock Express req/res objects and a next() tracker.
 */
function createMockReqRes(params = {}) {
  const req = { params };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  return { req, res, next, wasNextCalled: () => nextCalled };
}

// ─── validateBookChapter ────────────────────────────────────────────

describe('validateBookChapter', () => {
  it('accepts valid book and chapter, sets chapterNum', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      book: 'efnafraedi-2e',
      chapter: '1',
    });
    validateBookChapter(req, res, next);
    expect(wasNextCalled()).toBe(true);
    expect(req.chapterNum).toBe(1);
  });

  it('rejects invalid book with 400', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      book: 'invalid-book',
      chapter: '1',
    });
    validateBookChapter(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('accepts "appendices" chapter, sets chapterNum to -1', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      book: 'efnafraedi-2e',
      chapter: 'appendices',
    });
    validateBookChapter(req, res, next);
    expect(wasNextCalled()).toBe(true);
    expect(req.chapterNum).toBe(-1);
  });

  it('accepts "-1" chapter, sets chapterNum to -1', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      book: 'efnafraedi-2e',
      chapter: '-1',
    });
    validateBookChapter(req, res, next);
    expect(wasNextCalled()).toBe(true);
    expect(req.chapterNum).toBe(-1);
  });

  it('rejects non-numeric chapter with 400', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      book: 'efnafraedi-2e',
      chapter: 'abc',
    });
    validateBookChapter(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects chapter 0 with 400', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      book: 'efnafraedi-2e',
      chapter: '0',
    });
    validateBookChapter(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects chapter exceeding MAX_CHAPTERS (99) with 400', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      book: 'efnafraedi-2e',
      chapter: '100',
    });
    validateBookChapter(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });
});

// ─── validateModule ─────────────────────────────────────────────────

describe('validateModule', () => {
  it('accepts valid module ID (m + 5 digits)', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      moduleId: 'm68663',
    });
    validateModule(req, res, next);
    expect(wasNextCalled()).toBe(true);
  });

  it('rejects module ID with wrong prefix', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      moduleId: 'x12345',
    });
    validateModule(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects missing moduleId', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({});
    validateModule(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects module ID with 4 digits', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      moduleId: 'm1234',
    });
    validateModule(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects module ID with 6 digits', () => {
    const { req, res, next, wasNextCalled } = createMockReqRes({
      moduleId: 'm123456',
    });
    validateModule(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });
});
