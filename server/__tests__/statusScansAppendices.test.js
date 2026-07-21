/**
 * R3: status.js chapters/ scans must admit the appendices dir (chapter -1),
 * not drop it via `.filter(d => d.startsWith('ch'))`. Uses the committed
 * efnafraedi-2e/chapters/appendices/status.json (stable fixture). Harness
 * idiom: extract handler from router.stack, invoke with fake req/res
 * (cf. statusChapterRoute.test.js).
 */
import path from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
process.env.SESSIONS_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), 'status-scan-')),
  'sessions.db'
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((r) => {
    resolveResult = r;
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

let bookStatusHandler;
beforeAll(() => {
  require('../services/migrationRunner').runAllMigrations();
  const router = require('../routes/status');
  // Representative route: GET /:book (status.js:1083) — disk-scans chapters/ at
  // :1099-1111 and returns { book, totalChapters, summary, chapters:[{chapter,
  // chapterDir,...}] }. Handler does NOT reference req.user. (VERIFIED shape.)
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:book' && l.route.methods.get
  );
  bookStatusHandler = layer.route.stack[layer.route.stack.length - 1].handle;
});

describe('status.js /:book scan includes appendices', () => {
  it('lists the appendices chapter (-1) for efnafraedi-2e, sorted last', async () => {
    const r = await invoke(bookStatusHandler, { params: { book: 'efnafraedi-2e' } });
    expect(r.status).toBe(200);
    const chapters = r.body.chapters.map((c) => c.chapter);
    expect(chapters).toContain(-1);
    expect(chapters[chapters.length - 1]).toBe(-1); // appendices sorted last
    expect(chapters).not.toContain(NaN);
    expect(r.body.chapters.find((c) => c.chapter === -1).chapterDir).toBe('appendices');
  });
});
