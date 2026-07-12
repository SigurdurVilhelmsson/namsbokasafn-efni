/**
 * activityLog fail-loud contract (batch 4, design D1/D2):
 * - log() writes a row on the happy path
 * - log() NEVER throws: on any failure it pino-logs
 *   'Activity log write failed' with { err, type, book, userId } and
 *   returns null (the mutation that triggered the audit write must not
 *   fail over its audit record)
 * - a malformed payload (B1-F1 class: missing NOT NULL field) is the
 *   same never-throw path — visible in pino, invisible to the caller
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const logger = require('../lib/logger');
const migration040 = require('../migrations/040-service-table-ownership');
const activityLog = require('../services/activityLog');

let db;
let errorSpy;

beforeEach(() => {
  db = new Database(':memory:');
  migration040.up(db);
  activityLog._setTestDb(db);
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  activityLog._setTestDb(null);
  db.close();
});

const VALID = {
  type: 'segment_edit_approved',
  userId: '42',
  username: 'prufa',
  book: 'efnafraedi-2e',
  chapter: '5',
  section: 'm68700',
  description: 'prufa samþykkti breytingu',
};

describe('activityLog.log — happy path', () => {
  it('inserts a row and returns it', () => {
    const result = activityLog.log(VALID);
    expect(result).not.toBeNull();
    expect(result.id).toBeGreaterThan(0);
    const row = db.prepare('SELECT * FROM activity_log WHERE id = ?').get(result.id);
    expect(row.type).toBe('segment_edit_approved');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('activityLog.log — never-throw contract', () => {
  it('returns null and pino-logs when the table is missing', () => {
    db.exec('DROP TABLE activity_log');
    let result;
    expect(() => {
      result = activityLog.log(VALID);
    }).not.toThrow();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [ctx, msg] = errorSpy.mock.calls[0];
    expect(msg).toBe('Activity log write failed');
    expect(ctx.type).toBe('segment_edit_approved');
    expect(ctx.book).toBe('efnafraedi-2e');
    expect(ctx.userId).toBe('42');
    expect(ctx.err).toBeTruthy();
  });

  it('returns null and pino-logs on a malformed payload (missing NOT NULL description)', () => {
    const malformed = { ...VALID };
    delete malformed.description;
    let result;
    expect(() => {
      result = activityLog.log(malformed);
    }).not.toThrow();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT COUNT(*) AS c FROM activity_log').get().c).toBe(0);
  });
});

describe('activityLog reads still fail loud', () => {
  it('search() throws when the table is missing (route callers log + 500)', () => {
    db.exec('DROP TABLE activity_log');
    expect(() => activityLog.search({})).toThrow(/no such table/);
  });
});
