/**
 * routes/pipeline.js validateParams — appendices acceptance matrix (item 14,
 * finding 23 first half). Uses the router._validateParams internal seam.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Insurance against any transitive eager DB open (dbPath resolves at require
// time in several services): point at a throwaway DB before the first require.
const work = mkdtempSync(path.join(tmpdir(), 'pipe-validate-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
// auth.js (pulled in transitively via routes/pipeline's requireAuth) throws at
// import time if JWT_SECRET is unset — same convention as
// locApproveConflict.test.js / statusChapterRoute.test.js.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let validateParams;
let BOOK;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  const router = require('../routes/pipeline');
  validateParams = router._validateParams;
  const { VALID_BOOKS } = require('../config');
  if (!VALID_BOOKS.length) VALID_BOOKS.push('efnafraedi-2e');
  BOOK = VALID_BOOKS[0];
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

function run(body) {
  let status = 200;
  let jsonBody = null;
  const res = {
    status(c) {
      status = c;
      return this;
    },
    json(b) {
      jsonBody = b;
    },
  };
  const result = validateParams({ body }, res);
  return { result, status, jsonBody };
}

describe('pipeline validateParams appendices matrix', () => {
  it('is exposed for tests', () => {
    expect(typeof validateParams).toBe('function');
  });

  it.each([['appendices'], ['-1'], [-1]])('accepts %j as chapter -1', (chapter) => {
    const { result } = run({ book: BOOK, chapter });
    expect(result).not.toBeNull();
    expect(result.chapter).toBe(-1);
  });

  it('accepts regular numeric chapters', () => {
    const { result } = run({ book: BOOK, chapter: '3' });
    expect(result).toEqual({ book: BOOK, chapter: 3, track: 'faithful', moduleId: undefined });
  });

  it.each([['0'], ['100'], ['chappendices'], ['']])('rejects %j with 400', (chapter) => {
    const { result, status } = run({ book: BOOK, chapter });
    expect(result).toBeNull();
    expect(status).toBe(400);
  });
});
