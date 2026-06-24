import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const resolveDbPath = require('../lib/dbPath');

const ORIG = process.env.SESSIONS_DB_PATH;
afterEach(() => {
  if (ORIG === undefined) delete process.env.SESSIONS_DB_PATH;
  else process.env.SESSIONS_DB_PATH = ORIG;
});

describe('resolveDbPath', () => {
  it('returns SESSIONS_DB_PATH when set', () => {
    process.env.SESSIONS_DB_PATH = '/tmp/custom-e2e.db';
    expect(resolveDbPath()).toBe('/tmp/custom-e2e.db');
  });

  it('returns the canonical absolute default when env is unset', () => {
    delete process.env.SESSIONS_DB_PATH;
    const p = resolveDbPath();
    expect(path.isAbsolute(p)).toBe(true);
    expect(p.endsWith(path.join('pipeline-output', 'sessions.db'))).toBe(true);
  });
});
