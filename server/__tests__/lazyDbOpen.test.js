/**
 * Import-time DB-open regression (batch 4, design D4 / audit finding 20).
 *
 * Five services used to open (and create!) the production sessions.db as a
 * require() side effect, defeating SESSIONS_DB_PATH-based test isolation.
 * Each case requires the module in a SUBPROCESS with SESSIONS_DB_PATH
 * pointing into a fresh temp dir and asserts no DB file appears.
 * (Subprocess because DB_PATH freezes at import — an in-process require
 * would hit the module cache.)
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');

const SERVICES = [
  'services/activityLog',
  'services/notifications',
  'services/localizationLog',
  'services/feedbackService',
  'services/analyticsService',
];

function requireInSubprocess(mod, dbPath, extraCode = '') {
  return spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(path.join(SERVER_DIR, mod))}); ${extraCode}`],
    {
      env: { ...process.env, SESSIONS_DB_PATH: dbPath, JWT_SECRET: 'prufa' },
      encoding: 'utf-8',
      timeout: 30000,
    }
  );
}

describe('services do not open the DB at import time', () => {
  for (const mod of SERVICES) {
    it(`${mod}: require() creates no DB file`, () => {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lazy-'));
      const dbPath = path.join(work, 'sessions.db');
      const res = requireInSubprocess(mod, dbPath);
      expect(res.status, res.stderr).toBe(0);
      expect(fs.existsSync(dbPath)).toBe(false);
      fs.rmSync(work, { recursive: true, force: true });
    });
  }

  it('positive control: first real call DOES open/create the file', () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lazy-'));
    const dbPath = path.join(work, 'sessions.db');
    // getRecent throws (no table in a fresh DB) but opening creates the file
    const res = requireInSubprocess(
      'services/activityLog',
      dbPath,
      'try { require(' +
        JSON.stringify(path.join(SERVER_DIR, 'services/activityLog')) +
        ').getRecent(1); } catch {}'
    );
    expect(res.status, res.stderr).toBe(0);
    expect(fs.existsSync(dbPath)).toBe(true);
    fs.rmSync(work, { recursive: true, force: true });
  });
});
