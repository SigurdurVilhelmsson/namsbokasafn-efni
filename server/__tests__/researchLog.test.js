// server/__tests__/researchLog.test.js — spec §5.16 (G1.2 PR3, Task 7; Task 11 extends it)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

// Never let anything here open the real handle under pipeline-output/.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-log-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');

const { researchPath, editorialPath } = resolveResearchDbPath();
let reader;

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  reader = new Database(researchPath, { readonly: true });
  reader.defaultSafeIntegers(true);
});

afterAll(() => {
  reader.close();
  researchDb._reset();
});

const keyRows = (id) => reader.prepare('SELECT * FROM editor_keys WHERE interval_id = ?').all(id);

describe('ensureKey (spec §5.16)', () => {
  it('mints once per interval, a 128-bit hex key, and never returns it', () => {
    const I = 101;
    const first = researchLog.ensureKey(I);
    expect(first).toEqual({ status: 'minted' });
    expect(researchLog.ensureKey(I)).toEqual({ status: 'exists' });
    const rows = keyRows(I);
    expect(rows).toHaveLength(1);
    expect(rows[0].editor_key).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(first)).not.toMatch(/[0-9a-f]{32}/);
  });

  it('a bad interval id or an unavailable file fails without throwing', () => {
    expect(researchLog.ensureKey('x')).toEqual({ status: 'failed' });
    expect(researchLog.ensureKey(-1)).toEqual({ status: 'failed' });
    const I = 201;
    try {
      researchDb._setTestPaths({ researchPath: '/nonexistent/dir/r.db', editorialPath });
      expect(researchLog.ensureKey(I + 1)).toEqual({ status: 'failed' });
    } finally {
      researchDb._setTestPaths(null);
    }
    expect(researchLog.ensureKey(I + 1)).toEqual({ status: 'minted' });
  });
});
