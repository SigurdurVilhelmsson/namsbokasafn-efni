/**
 * F13 (item 16 PR1): the segment-editor term-lookup route must read the
 * bookSlug the client actually sends (public/js/segment-editor.js:2263)
 * and pass it to lookupTerm as a slug string — the old `bookId` read was
 * never sent by any caller, so book-priority ranking never applied.
 * Harness idiom: handler extraction + monkey-patched service, cf.
 * statusChapterRoute.test.js (bypasses router-level middleware).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'termlookup-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let handler;
let terminology;
let origLookup;
let captured;

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  terminology = require('../services/terminologyService');
  origLookup = terminology.lookupTerm;
  terminology.lookupTerm = (q, bookSlug) => {
    captured = { q, bookSlug };
    return [];
  };

  const router = require('../routes/segment-editor');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/terminology/lookup' && l.route.methods.get
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  terminology.lookupTerm = origLookup;
  rmSync(work, { recursive: true, force: true });
});

describe('GET /terminology/lookup (segment-editor router)', () => {
  it('passes the client-sent bookSlug through as a slug string', async () => {
    captured = undefined;
    const r = await invoke(handler, { query: { q: 'orka', bookSlug: 'liffraedi-2e' } });
    expect(r.status).toBe(200);
    expect(captured).toEqual({ q: 'orka', bookSlug: 'liffraedi-2e' });
  });

  it('passes null when no book context is sent', async () => {
    captured = undefined;
    const r = await invoke(handler, { query: { q: 'orka' } });
    expect(r.status).toBe(200);
    expect(captured.bookSlug).toBeNull();
  });
});
