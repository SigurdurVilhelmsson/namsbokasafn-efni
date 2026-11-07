// server/__tests__/featureFlags.test.js — spec §5.13 (G1.2 PR3, Task 8)
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

// Never let anything here touch pipeline-output/.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-flags-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-feature-flags';

const { runAllMigrations } = require('../services/migrationRunner');
const { getSessionsDb } = require('../services/researchConsent');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const userService = require('../services/userService');
const { canonicalJson } = require('../lib/canonicalJson');
const {
  FLAGS,
  NOT_A_FLAG,
  ENV_SCAN_FILES,
  flagSnapshot,
  flagSnapshotJson,
  scanEnvReads,
} = require('../lib/featureFlags');

const SERVER_ROOT = path.join(__dirname, '..');
const CHEM = 'efnafraedi-2e';
const ENV_KEYS = ['GREYNIR_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'AUTO_CREATE_USERS'];
let saved;
let conn;

beforeAll(() => {
  runAllMigrations();
  conn = getSessionsDb();
});
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const changed = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);

describe('the flag registry (spec §5.13)', () => {
  it('canonical JSON sorts keys at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 0 }], c: 2 } })).toBe(
      '{"a":{"c":2,"d":[2,{"y":0,"z":1}]},"b":1}'
    );
  });

  it('the snapshot for chemistry, every flag by value', () => {
    expect(flagSnapshot(CHEM, { conn })).toEqual({
      'apply-hold': true,
      'auto-create-users': 'visitor',
      email: false,
      'enforce-assignments': false,
      'enforce-localization-review': false,
      'figure-review-closed': true,
      greynir: false,
      'not-minted': false,
      'pipeline-hold': true,
      'study-capture': true,
      'suggestion-view': false,
    });
    const organic = flagSnapshot('lifraen-efnafraedi', { conn });
    expect([organic['not-minted'], organic['study-capture']]).toEqual([true, false]);
  });

  it('each flag follows its own source, and only that flag moves (T14, snapshot half)', () => {
    const bio = flagSnapshot('liffraedi-2e', { conn });
    const before = flagSnapshot(CHEM, { conn });
    userService.setAssignmentEnforced(CHEM, true);
    const afterAssign = flagSnapshot(CHEM, { conn });
    expect(changed(before, afterAssign)).toEqual(['enforce-assignments']);
    conn
      .prepare(
        "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', 1, ?)"
      )
      .run(CHEM, Date.now());
    const afterSwitch = flagSnapshot(CHEM, { conn });
    expect(changed(afterAssign, afterSwitch)).toEqual(['suggestion-view']);
    expect(flagSnapshot('liffraedi-2e', { conn })).toEqual(bio);
    userService.setAssignmentEnforced(CHEM, false);
  });

  it('a configured service reads as a boolean, never its value', () => {
    process.env.GREYNIR_URL = 'http://greynir.internal:8123';
    process.env.SMTP_HOST = 'smtp.leynd';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'LEYNIORD-9';
    process.env.AUTO_CREATE_USERS = 'true';
    const snap = flagSnapshot(CHEM, { conn });
    expect([snap.greynir, snap.email, snap['auto-create-users']]).toEqual([true, true, 'create']);
    const json = flagSnapshotJson(CHEM, { conn });
    for (const secret of ['greynir.internal', 'smtp.leynd', 'LEYNIORD-9']) {
      expect(json).not.toContain(secret);
    }
  });

  it('every book_settings column is registered or listed as not a flag (§5.13 coverage 1)', () => {
    const { db } = freshMigratedDb();
    const names = () =>
      db
        .prepare('PRAGMA table_info(book_settings)')
        .all()
        .map((c) => c.name)
        .filter((n) => n !== 'book' && n !== 'updated_at');
    const registered = FLAGS.flatMap((f) => f.bookSettingsColumn || []);
    const unlisted = () =>
      names().filter((c) => !registered.includes(c) && !(c in NOT_A_FLAG.bookSettings));
    expect(unlisted()).toEqual([]);
    expect(registered.filter((c) => !names().includes(c))).toEqual([]);
    db.exec('ALTER TABLE book_settings ADD COLUMN planted_switch INTEGER');
    expect(unlisted()).toEqual(['planted_switch']);
  });

  it('every env read on the editing path is registered or listed (§5.13 coverage 2)', () => {
    const findings = scanEnvReads(SERVER_ROOT, ENV_SCAN_FILES);
    const known = [...FLAGS.flatMap((f) => f.envNames || []), ...Object.keys(NOT_A_FLAG.env)];
    expect(findings.filter((f) => !known.includes(f.name))).toEqual([]);
    expect(findings).toContainEqual({ file: 'services/greynirEngine.js', name: 'GREYNIR_URL' });
  });

  it('control: a planted read in a temporary root is found, including the shapes it cannot name', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'env-scan-'));
    fs.mkdirSync(path.join(tmp, 'services'));
    fs.writeFileSync(
      path.join(tmp, 'services/acceptanceService.js'),
      "const a = process.env.PLANTED_SWITCH;\nconst b = process.env['OTHER_ONE'];\nconst { X } = process.env;\n"
    );
    expect(
      scanEnvReads(tmp, ['services/acceptanceService.js', 'services/gone.js']).map((f) => f.name)
    ).toEqual(['PLANTED_SWITCH', 'OTHER_ONE', '<unparsed>', '<missing file>']);
  });
});
