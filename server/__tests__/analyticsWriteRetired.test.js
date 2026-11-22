/**
 * The public analytics write is retired ([USER] 2026-11-22, the G1.15(b) final review's I-1).
 *
 * POST /api/analytics/event needed no sign-in and wrote analytics_events, a table inside the editorial retention
 * scope. From 2029 any row it wrote would have raised the retention script's continued-use refusal, so an anonymous
 * request could hold step 2 and keep /api/health degraded. The reader stopped sending it (D03; vefur's data-rule
 * test holds that no reader file sends anything here), and production's newest row is from 2026-10-31.
 *
 * The read routes stay: the rows already stored are shown to head editors until retention step 1 deletes them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const express = require('express');
const Database = require('better-sqlite3');
const migration005 = require('../migrations/005-feedback');
const analytics = require('../services/analyticsService');
const router = require('../routes/analytics');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..');

let db;
let server;

beforeEach(() => {
  db = new Database(':memory:');
  migration005.up(db);
  analytics._setTestDb(db);
});

afterEach(async () => {
  if (server) await new Promise((r) => server.close(r));
  server = undefined;
  analytics._setTestDb(null);
  db.close();
});

/** The real analytics router behind index.js's own body parser and API 404 shape. */
async function boot() {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', router);
  app.use('/api/*path', (req, res) => res.status(404).json({ error: 'Not Found' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return `http://127.0.0.1:${server.address().port}`;
}

const stored = () => db.prepare('SELECT COUNT(*) FROM analytics_events').pluck().get();

describe('POST /api/analytics/event is retired', () => {
  it('answers 404 and stores nothing, while the router itself still answers (control: GET /stats asks for sign-in)', async () => {
    const base = await boot();
    const post = await fetch(`${base}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'page_view', book: 'efnafraedi-2e' }),
    });
    expect(post.status).toBe(404);
    expect(stored()).toBe(0);
    const stats = await fetch(`${base}/api/analytics/stats`);
    expect(stats.status).toBe(401);
  });

  it('the router declares no write route, and keeps its three reads', () => {
    const routes = router.stack.filter((l) => l.route).map((l) => l.route);
    expect(routes.filter((r) => !r.methods.get).map((r) => r.path)).toEqual([]);
    expect(routes.map((r) => r.path).sort()).toEqual(['/dashboard-data', '/recent', '/stats']);
  });

  it('index.js no longer rate-limits a POST to it (control: the feedback form keeps its limiter)', () => {
    const src = readFileSync(path.join(SERVER, 'index.js'), 'utf8');
    expect(src).toMatch(/app\.post\('\/api\/feedback', publicSubmitLimiter\)/);
    expect(src).not.toMatch(/analytics\/event/);
  });
});

/** Every .js file under server/ that is code: not a dependency, a migration or a test. */
function codeFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.venv', '__tests__', 'migrations', 'e2e'].includes(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) codeFiles(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const WRITES_ANALYTICS = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["`]?analytics_events\b/i;

describe('nothing in server/ writes analytics_events', () => {
  it('the pattern sees an insert in any of its spellings (control)', () => {
    for (const s of [
      'INSERT INTO analytics_events (event_type) VALUES (?)',
      'insert or ignore into "analytics_events" (x)',
      '\n      INSERT INTO analytics_events (event_type, book)',
    ]) {
      expect(WRITES_ANALYTICS.test(s), s).toBe(true);
    }
  });

  it('no code file holds one (its migration creates the table; retention deletes its rows)', () => {
    const files = codeFiles(SERVER);
    expect(files.length).toBeGreaterThan(100);
    const hits = files
      .filter((f) => WRITES_ANALYTICS.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(SERVER, f));
    expect(hits).toEqual([]);
  });
});
