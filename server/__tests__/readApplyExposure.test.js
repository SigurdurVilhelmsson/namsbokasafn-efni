// server/__tests__/readApplyExposure.test.js
//
// register §C203: read-apply-exposure.js must report what applyApprovedEdits would WRITE, so each
// case below plants approved rows on REAL chemistry segments (the real loader reads the committed
// books/ tree, read-only) and checks the path and the class of every winner. Schema comes from
// freshMigratedDb(): every real migration, no hand-copied DDL.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { loadModuleForEditing } = require('../services/segmentParser');
const { measureApplyExposure } = require('../scripts/read-apply-exposure');

const BOOK = 'efnafraedi-2e';
const MOD = 'm68700';
const CH = 3;
const SCRIPT = path.join(__dirname, '..', 'scripts', 'read-apply-exposure.js');
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

// Three real segments with distinct, non-empty text, so every class can be planted on them.
const base = loadModuleForEditing(BOOK, CH, MOD).segments.filter((s) => s.is && s.is.trim());
const [s1, s2, s3, s4] = base;

let db;
let dbPath;
beforeEach(() => {
  ({ db, path: dbPath } = freshMigratedDb());
});
afterEach(() => db.close());

function edit({
  seg,
  original,
  edited,
  appliedAt = '2026-06-12 16:00:00',
  createdAt = '2026-06-01 10:00:00',
  module = MOD,
  chapter = CH,
  status = 'approved',
}) {
  return db
    .prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content,
         status, editor_id, editor_username, created_at, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'e1', 'editor-one', ?, ?)`
    )
    .run(BOOK, chapter, module, seg, original, edited, status, createdAt, appliedAt)
    .lastInsertRowid;
}
function accept(seg, module = MOD, chapter = CH) {
  db.prepare(
    `INSERT INTO segment_acceptances (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
     VALUES (?, ?, ?, ?, 'x', 'e1', 'editor-one')`
  ).run(BOOK, chapter, module, seg);
}
const run = () => measureApplyExposure(db, BOOK, loadModuleForEditing);
const only = (r) => r.modules.find((m) => m.module === MOD);

describe('read-apply-exposure (§C203)', () => {
  it('has real segments to plant on (precondition, not a finding)', () => {
    expect(base.length).toBeGreaterThanOrEqual(4);
    expect(new Set([s1.is, s2.is, s3.is, s4.is]).size).toBe(4);
  });

  it('every approved row applied, no acceptance, no faithful file: the click takes the self-heal path', () => {
    edit({ seg: s1.segmentId, original: s1.is, edited: s1.is + ' X' });
    expect(only(run()).path).toBe('self-heal');
  });

  it("under self-heal every winner is written and classified against today's text", () => {
    edit({ seg: s1.segmentId, original: s1.is, edited: s1.is + ' X' }); // clean
    edit({ seg: s2.segmentId, original: 'an older text', edited: s2.is }); // already-present
    const bc = edit({ seg: s3.segmentId, original: 'an older text', edited: 'an older edit' }); // base-changed
    const m = only(run());
    expect(m.winners).toEqual({
      'already-present': 1,
      clean: 1,
      'base-changed': 1,
      'segment-gone': 0,
      'not-written': 0,
    });
    expect(m.baseChangedEditIds).toEqual([Number(bc)]);
  });

  it('control: one active unapplied acceptance disarms the self-heal, and applied winners are not written', () => {
    edit({ seg: s3.segmentId, original: 'an older text', edited: 'an older edit' });
    accept(s4.segmentId);
    const m = only(run());
    expect(m.path).toBe('normal');
    expect(m.winners['not-written']).toBe(1);
    expect(m.winners['base-changed']).toBe(0);
  });

  it('the winner is the newest row of the segment, so an older applied base-changed row is not counted', () => {
    edit({
      seg: s1.segmentId,
      original: 'an older text',
      edited: 'an older edit',
      createdAt: '2026-06-01 10:00:00',
    });
    edit({
      seg: s1.segmentId,
      original: s1.is,
      edited: s1.is + ' Y',
      createdAt: '2026-07-01 10:00:00',
      appliedAt: null,
    });
    const m = only(run());
    expect(m.path).toBe('normal');
    expect(m.segmentsWithApproved).toBe(1);
    expect(m.winners.clean).toBe(1);
    expect(m.winners['base-changed']).toBe(0);
  });

  it('a winner on a segment no longer in the extraction is segment-gone', () => {
    edit({ seg: `${MOD}:para:no-such-element`, original: 'a', edited: 'b' });
    expect(only(run()).winners['segment-gone']).toBe(1);
  });

  it('rows that are not approved are ignored', () => {
    edit({
      seg: s1.segmentId,
      original: 'an older text',
      edited: 'an older edit',
      status: 'pending',
      appliedAt: null,
    });
    expect(run().modules).toEqual([]);
  });

  it('a module with an unapplied acceptance and no approved row is listed as acceptance-only', () => {
    accept(s1.segmentId);
    const r = run();
    expect(r.modules).toEqual([]);
    expect(r.acceptanceOnly).toEqual([{ module: MOD, chapter: CH, activeUnappliedAcceptances: 1 }]);
  });
});

describe('read-apply-exposure: a module id shared by chapters (§C209)', () => {
  // `chapter-metadata` is ONE module id with one file per chapter, and one click applies
  // one chapter's file (§C209), so the mirror reports one entry per (module, chapter).
  const META = 'chapter-metadata';
  const title = (ch) => loadModuleForEditing(BOOK, ch, META).segments[0];
  const metaEntries = (r) =>
    r.modules
      .filter((m) => m.module === META)
      .map((m) => ({
        chapter: m.chapter,
        chaptersSeen: m.chaptersSeen,
        path: m.path,
        acc: m.activeUnappliedAcceptances,
        winners: m.winners,
      }));
  const ZERO = {
    'already-present': 0,
    clean: 0,
    'base-changed': 0,
    'segment-gone': 0,
    'not-written': 0,
  };
  const metaEdit = (ch, suffix, appliedAt) => {
    const t = title(ch);
    const args = { seg: t.segmentId, original: t.is, edited: `${t.is} ${suffix}` };
    return edit({
      ...args,
      module: META,
      chapter: ch,
      ...(appliedAt === undefined ? {} : { appliedAt }),
    });
  };

  it('has one title segment per chapter, read from mt-output (precondition, not a finding)', () => {
    for (const ch of [2, 3, 5]) {
      const m = loadModuleForEditing(BOOK, ch, META);
      expect(m.isSource).toBe('mt-output');
      expect(m.segments.map((s) => s.segmentId)).toEqual([`chapter:title:ch0${ch}`]);
    }
  });

  it("each chapter's edit is classified against its own chapter's file, never as segment-gone", () => {
    metaEdit(2, 'X', null);
    metaEdit(5, 'Y', null);
    accept(title(3).segmentId, META, 3);
    const r = run();
    expect(metaEntries(r)).toEqual([
      { chapter: 2, chaptersSeen: 2, path: 'normal', acc: 0, winners: { ...ZERO, clean: 1 } },
      { chapter: 5, chaptersSeen: 2, path: 'normal', acc: 0, winners: { ...ZERO, clean: 1 } },
    ]);
    expect(r.acceptanceOnly).toEqual([{ module: META, chapter: 3, activeUnappliedAcceptances: 1 }]);
  });

  it("another chapter's acceptance does not disarm this chapter's self-heal", () => {
    metaEdit(2, 'X'); // applied
    accept(title(5).segmentId, META, 5);
    const r = run();
    expect(metaEntries(r)).toEqual([
      { chapter: 2, chaptersSeen: 1, path: 'self-heal', acc: 0, winners: { ...ZERO, clean: 1 } },
    ]);
    expect(r.acceptanceOnly).toEqual([{ module: META, chapter: 5, activeUnappliedAcceptances: 1 }]);
  });
});

describe('read-apply-exposure CLI', () => {
  const env = () => ({ ...process.env, SESSIONS_DB_PATH: dbPath });

  it('refuses a missing book argument with exit 2', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { env: env(), encoding: 'utf8' });
    expect(r.status).toBe(2);
  });

  it('refuses an extra argument with exit 2, so a mistyped flag never runs silently', () => {
    const r = spawnSync(process.execPath, [SCRIPT, BOOK, '--db', '/tmp/x'], {
      env: env(),
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
  });

  it('a file run prints the report and exits 0', () => {
    edit({ seg: s3.segmentId, original: 'an older text', edited: 'an older edit' });
    db.close();
    const r = spawnSync(process.execPath, [SCRIPT, BOOK], { env: env(), encoding: 'utf8' });
    ({ db } = { db: new (require('better-sqlite3'))(dbPath) });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).totals['base-changed']).toBe(1);
  });

  it('a stdin run from server/scripts (the route used on prod) also runs and exits 0', () => {
    edit({ seg: s3.segmentId, original: 'an older text', edited: 'an older edit' });
    db.close();
    const r = spawnSync(process.execPath, ['-', BOOK], {
      cwd: SCRIPTS_DIR,
      env: env(),
      input: fs.readFileSync(SCRIPT, 'utf8'),
      encoding: 'utf8',
    });
    ({ db } = { db: new (require('better-sqlite3'))(dbPath) });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).totals['base-changed']).toBe(1);
  });

  it('control: a stdin run with no book exits 2, so the stdin branch really executes main()', () => {
    const r = spawnSync(process.execPath, ['-'], {
      cwd: SCRIPTS_DIR,
      env: env(),
      input: fs.readFileSync(SCRIPT, 'utf8'),
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
  });

  it('opens the database read-only: the file is byte-identical after a run', () => {
    edit({ seg: s3.segmentId, original: 'an older text', edited: 'an older edit' });
    db.close();
    const before = fs.readFileSync(dbPath);
    spawnSync(process.execPath, [SCRIPT, BOOK], { env: env(), encoding: 'utf8' });
    const after = fs.readFileSync(dbPath);
    ({ db } = { db: new (require('better-sqlite3'))(dbPath) });
    expect(Buffer.compare(before, after)).toBe(0);
  });
});
