// server/__tests__/researchStatus.test.js — spec §5.20 (G1.2 PR3, Task 14)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const freshMigratedDb = require('./helpers/freshMigratedDb');
const { summarise, main } = require('../scripts/research-status');

const LOSS_DAY = '2026-11-02';
const MODULE_ID = 'm98765';
const ACTION_ID = 'act-secret-123';

let db;
let dbPath;
let savedExitCode;
let savedDbEnv;
beforeEach(() => {
  savedExitCode = process.exitCode;
  savedDbEnv = process.env.SESSIONS_DB_PATH;
  const built = freshMigratedDb();
  db = built.db;
  dbPath = built.path;
  const ins = db.prepare(
    `INSERT INTO research_capture_losses
       (interval_id, book, chapter, module_id, event_type, loss_day, error_class, client_action_id)
     VALUES (?, 'efnafraedi-2e', 1, ?, ?, ?, ?, ?)`
  );
  ins.run(3, MODULE_ID, 'edit-save', LOSS_DAY, 'busy', ACTION_ID);
  ins.run(3, MODULE_ID, 'edit-save', LOSS_DAY, 'busy', ACTION_ID);
  ins.run(3, MODULE_ID, 'mt-accept', LOSS_DAY, 'unavailable', ACTION_ID);
  ins.run(5, MODULE_ID, 'edit-approve', LOSS_DAY, 'other', ACTION_ID);
  ins.run(null, MODULE_ID, 'edit-save', LOSS_DAY, 'consent-unknown', ACTION_ID);
});
afterEach(() => {
  process.exitCode = savedExitCode;
  if (savedDbEnv === undefined) delete process.env.SESSIONS_DB_PATH;
  else process.env.SESSIONS_DB_PATH = savedDbEnv;
  db.close();
});

const collector = () => {
  const lines = [];
  return { lines, write: (s) => lines.push(s) };
};

describe('research-status', () => {
  it('counts per interval, by class and by type, and the unattributed', () => {
    expect(summarise(db)).toEqual({
      intervals: [
        {
          intervalId: 3,
          total: 3,
          byErrorClass: { busy: 2, unavailable: 1 },
          byEventType: { 'edit-save': 2, 'mt-accept': 1 },
        },
        {
          intervalId: 5,
          total: 1,
          byErrorClass: { other: 1 },
          byEventType: { 'edit-approve': 1 },
        },
      ],
      consentUnknown: 1,
    });
  });

  it('prints no day, no module and no action id', () => {
    process.env.SESSIONS_DB_PATH = dbPath;
    const out = collector();
    const err = collector();
    main({ argv: [], out: out.write, err: err.write });
    const printed = out.lines.join('');
    expect(printed).not.toContain(LOSS_DAY);
    expect(printed).not.toContain(MODULE_ID);
    expect(printed).not.toContain(ACTION_ID);
    expect(printed).toContain('"consentUnknown": 1');
    expect(process.exitCode).toBe(0);
  });

  it('a database without the ledger exits 1 with a message', () => {
    db.exec('ALTER TABLE research_capture_losses RENAME TO renamed_away');
    process.env.SESSIONS_DB_PATH = dbPath;
    const out = collector();
    const err = collector();
    main({ argv: [], out: out.write, err: err.write });
    expect(process.exitCode).toBe(1);
    expect(err.lines).toHaveLength(1);
    expect(out.lines).toEqual([]);
  });
});
