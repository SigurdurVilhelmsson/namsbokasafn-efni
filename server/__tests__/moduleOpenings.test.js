// server/__tests__/moduleOpenings.test.js
//
// The opening service (G1.1 + G1.2 spec §5.4 step 4, §5.5; PR2 Task 2): the predicate's truth table,
// the snapshot, the one-transaction step and the 503 decision, on the service. T6 and T7's service
// halves, and T17's "no time leaves recordOpening or openOnServe". readOpening (G1.23) is the one
// reader that returns the time, for services only. The route half is Task 3's.
//
// Every database call goes through `userService._setTestDb` or the handle passed in. SESSIONS_DB_PATH
// is set to a temp file BEFORE any server require anyway, as a safety net: a slip must reach a temp
// file, never pipeline-output/sessions.db.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

process.env.SESSIONS_DB_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'module-openings-')),
  'sessions.db'
);

const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const userService = require('../services/userService');
const notifications = require('../services/notifications');
const log = require('../lib/logger');
const { isEditInFlight } = require('../public/js/accept-eligibility');
const mo = require('../services/moduleOpenings');

const BOOK = 'efnafraedi-2e';
const T0 = 1_700_000_000_123;
let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
  userService._setTestDb(db);
  // assignBookAccess sends an in-app notification on notifications' own connection: keep it here.
  notifications._setTestDb(db);
  mo._setTestClock(() => T0);
});
afterEach(() => {
  mo._setTestClock(null);
  userService._setTestDb(null);
  notifications._setTestDb(null);
  vi.restoreAllMocks();
  db.close();
});

/** A users row the way the admin page creates one, with assignment rows (userService's own writers). */
function member(providerId, role, chapters = [], book = BOOK) {
  const u = userService.createUser({
    providerId,
    providerUsername: `${providerId}@skoli.example`,
    email: `${providerId}@skoli.example`,
    role,
  });
  for (const ch of chapters) userService.assignChapter(u.id, book, ch);
  return u;
}
const key = (over = {}) => ({ book: BOOK, chapter: 1, moduleId: 'm95001', ...over });
const pred = (providerId, over) => mo.openingPredicate(db, { ...key(over), providerId });
/** A segment_edits row as getModuleEdits returns it (only the fields the snapshot reads matter). */
const edit = (segment_id, over = {}) => ({
  segment_id,
  status: 'pending',
  applied_at: null,
  occurrence: null,
  origin: null,
  ...over,
});
const openings = () =>
  db.prepare('SELECT * FROM module_openings ORDER BY chapter, module_id').all();
const inflightRows = () =>
  db
    .prepare('SELECT * FROM module_opening_inflight ORDER BY module_id, segment_id, occurrence')
    .all();
const plantInflightFault = () =>
  db.exec(
    "CREATE TRIGGER planted BEFORE INSERT ON module_opening_inflight BEGIN SELECT RAISE(ABORT, 'planted fault'); END"
  );

// The fixture of T7's service half: served segments (one id duplicated) and the module's edit rows
// from every editor, in getModuleEdits' order (newest first).
const SEGMENTS = ['s1', 's2', 's3', 's4', 's5', 's6', 'd', 'd'].map((segmentId, i) => ({
  segmentId,
  occurrence: i === 7 ? 1 : 0,
}));
const EDITS = [
  edit('s1'), // pending, legacy (no occurrence, no origin)
  edit('s2', { status: 'approved', occurrence: 0, origin: 'editor-save' }), // approved, not applied
  edit('s2'), // a second, legacy pending row on the same id
  edit('s3', { status: 'rejected', occurrence: 0, origin: 'editor-save' }), // newest s3: not in flight
  edit('s3'), // an older in-flight edit under it
  edit('s4', { occurrence: 0, origin: 're-attach' }),
  edit('s5', { status: 'approved', applied_at: '2026-06-12 16:00:00' }), // applied: not in flight
  edit('d'), // a duplicated id, legacy row
  edit('chapter:title:ch05'), // an id not served in this load
];
const snap = mo.snapshotRows(SEGMENTS, EDITS);

// PR1's recordServe results (servedVersions.js): a mint that wrote, and one that threw.
const MINTED = {
  mintOk: true,
  servedVersionIds: [{ segmentId: 's1', occurrence: 0, servedVersionId: 7 }],
  duplicatedIds: ['d'],
};
const FAILED = { mintOk: false, servedVersionIds: null, duplicatedIds: [] };

describe('openingPredicate (spec §5.5; T6, service half)', () => {
  it('holds only for a users row that holds an assignment row for this book and chapter', () => {
    member('p-ed1', 'editor', [1]);
    member('p-zero', 'editor');
    member('p-admin', 'admin');
    const head = member('p-head', 'head-editor');
    userService.assignBookAccess(head.id, BOOK, 'head-editor');
    const results = [
      pred('p-ed1'),
      pred('p-zero'),
      pred('p-admin'),
      pred('p-head'),
      pred('p-ghost'),
      pred('p-ed1', { chapter: 2 }),
    ];
    expect(results.map((r) => r.reason)).toEqual([
      'holds',
      'no-assignment',
      'no-assignment',
      'no-assignment',
      'no-user',
      'no-assignment',
    ]);
    expect(results.map((r) => r.holds)).toEqual([true, false, false, false, false, false]);
  });

  it("the zero-row editor's no is the predicate's own: the fail-open neighbour would have let them in", () => {
    member('p-ed1', 'editor', [1]);
    const zero = member('p-zero', 'editor');
    expect(userService.isAssignmentEnforced(BOOK)).toBe(false);
    // userService.js hasChapterAccess, legacy fail-open: no rows for the book = every chapter.
    expect(userService.hasChapterAccess(zero.id, BOOK, 1)).toBe(true);
    expect(pred('p-zero').holds).toBe(false);
  });

  it('enforcement changes nothing', () => {
    member('p-ed1', 'editor', [1]);
    member('p-zero', 'editor');
    userService.setAssignmentEnforced(BOOK, true);
    expect(pred('p-ed1').holds).toBe(true);
    expect(pred('p-zero').holds).toBe(false);
    userService.setAssignmentEnforced(BOOK, false);
    expect(pred('p-ed1').holds).toBe(true);
    expect(pred('p-zero').holds).toBe(false);
  });

  it('the row decides, not the role (G1.23 §6.2)', () => {
    member('p-viewer-row', 'viewer', [1]);
    member('p-admin-row', 'admin', [1]);
    expect(pred('p-viewer-row')).toEqual({ holds: true, reason: 'holds' });
    expect(pred('p-admin-row')).toEqual({ holds: true, reason: 'holds' });
  });

  it('the row decides, not users.is_active: a deactivated account that holds a row meets it (decision 3)', () => {
    const off = member('p-off', 'editor', [1]);
    userService.deactivateUser(off.id);
    // control: the deactivation took, and left the assignment row
    expect(db.prepare('SELECT is_active FROM users WHERE id = ?').get(off.id)).toEqual({
      is_active: 0,
    });
    expect(
      db
        .prepare('SELECT book_slug, chapter FROM user_chapter_assignments WHERE user_id = ?')
        .all(off.id)
    ).toEqual([{ book_slug: BOOK, chapter: 1 }]);
    expect(pred('p-off')).toEqual({ holds: true, reason: 'holds' });
  });

  it("another book's row for the same chapter is no assignment here (decision 3)", () => {
    const bio = member('p-bio-only', 'editor', [1], 'liffraedi-2e');
    expect(pred('p-bio-only')).toEqual({ holds: false, reason: 'no-assignment' });
    // positive control: the same member, given this book's row, meets it
    userService.assignChapter(bio.id, BOOK, 1);
    expect(pred('p-bio-only')).toEqual({ holds: true, reason: 'holds' });
  });

  it('a token with no users row is no user, and no row is created for it', () => {
    expect(pred('p-ghost')).toEqual({ holds: false, reason: 'no-user' });
    expect(db.prepare("SELECT provider_id FROM users WHERE provider_id = 'p-ghost'").all()).toEqual(
      []
    );
  });

  it('a users table that is not ready (findByProviderId returns null) is no user, not a throw', () => {
    member('p-ed1', 'editor', [1]);
    // userService's own connection without a users table: its real null branch, not a mock. The
    // assignment lookup runs on the handle passed in, which holds p-ed1's row.
    const bare = new Database(':memory:');
    try {
      userService._setTestDb(bare);
      expect(userService.findByProviderId('p-ed1')).toBeNull();
      expect(pred('p-ed1')).toEqual({ holds: false, reason: 'no-user' });
      expect(
        mo.openOnServe(db, {
          ...key(),
          providerId: 'p-ed1',
          served: MINTED,
          segments: SEGMENTS,
          edits: EDITS,
        })
      ).toEqual({ status: 'skipped', reason: 'no-user' });
    } finally {
      userService._setTestDb(db);
      bare.close();
    }
    expect(openings()).toEqual([]);
    // control: with the users table back, the same member meets it
    expect(pred('p-ed1')).toEqual({ holds: true, reason: 'holds' });
  });

  it('the legacy chapter_assignments table (migration 012) does not count', () => {
    const zero = member('p-zero', 'editor');
    const admin = member('p-admin', 'admin');
    db.prepare(
      `INSERT INTO chapter_assignments (book, chapter, stage, assigned_to, assigned_by)
       VALUES ('efnafraedi-2e', 1, 'linguisticReview', ?, ?)`
    ).run(zero.id, admin.id);
    expect(pred('p-zero').reason).toBe('no-assignment');
    // Control: the table the predicate reads.
    userService.assignChapter(zero.id, BOOK, 1);
    expect(pred('p-zero').reason).toBe('holds');
  });

  it('appendices are chapter -1', () => {
    member('p-app', 'editor', [-1]);
    expect(pred('p-app', { chapter: -1 }).holds).toBe(true);
    expect(pred('p-app', { chapter: 1 }).holds).toBe(false);
  });

  it('a book off the study allowlist never holds', () => {
    member('p-bio', 'editor', [1], 'liffraedi-2e');
    expect(pred('p-bio', { book: 'liffraedi-2e' })).toEqual({
      holds: false,
      reason: 'not-study-book',
    });
  });

  it('an existing opening ends it', () => {
    member('p-ed1', 'editor', [1]);
    db.prepare(
      'INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count) VALUES (?, ?, ?, ?, ?)'
    ).run(BOOK, 1, 'm95001', T0, 0);
    expect(pred('p-ed1').reason).toBe('already-opened');
  });

  it('a book off the allowlist touches no table: a closed handle, and no users lookup', () => {
    // The service calls findByProviderId through the module object, so the spy intercepts it.
    const lookup = vi.spyOn(userService, 'findByProviderId');
    const closed = new Database(':memory:');
    closed.close();
    // The closed handle shows the route's connection is untouched; the spy shows userService's is
    // too (it is not the handle passed in, so the closed handle alone would pass with the users
    // lookup moved first).
    expect(
      mo.openingPredicate(closed, { ...key({ book: 'liffraedi-2e' }), providerId: 'p-ed1' }).reason
    ).toBe('not-study-book');
    expect(lookup).not.toHaveBeenCalled();
    // Control: on the study book the assignment lookup runs on the closed handle and throws.
    member('p-ed1', 'editor', [1]);
    expect(() => mo.openingPredicate(closed, { ...key(), providerId: 'p-ed1' })).toThrow(
      /not open/
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('p-ed1');
  });

  it('the opening lookup comes last: a missing module_openings refuses only a user who holds a row', () => {
    member('p-ed1', 'editor', [1]);
    member('p-zero', 'editor');
    db.exec('DROP TABLE module_opening_inflight; DROP TABLE module_openings');
    expect(pred('p-zero').reason).toBe('no-assignment');
    expect(() => pred('p-ed1')).toThrow(/no such table/);
  });
});

describe('snapshotRows (spec §5.5 step 2; T7, service half)', () => {
  it('holds every served segment with any in-flight edit, keyed by the edit row’s occurrence or -1', () => {
    expect(mo.snapshotRows(SEGMENTS, EDITS)).toEqual({
      rows: [
        { segmentId: 'd', occurrence: -1 },
        { segmentId: 's1', occurrence: -1 },
        { segmentId: 's2', occurrence: -1 },
        { segmentId: 's3', occurrence: -1 },
        { segmentId: 's4', occurrence: 0 },
      ],
      warnSegments: ['d', 's1', 's2', 's3'],
    });
  });

  it('the any-edit rule is what keeps s3: its newest edit is not in flight', () => {
    const s3 = EDITS.filter((e) => e.segment_id === 's3');
    expect(isEditInFlight(s3[0])).toBe(false); // the newest, rejected
    expect(isEditInFlight(s3[1])).toBe(true); // the older one
    expect(snap.rows.map((r) => r.segmentId)).toContain('s3');
  });

  it('a re-attached in-flight row alone warns nothing; beside a NULL-origin or editor-save row it does', () => {
    const reattached = edit('s4', { occurrence: 0, origin: 're-attach' });
    expect(mo.snapshotRows(SEGMENTS, [reattached])).toEqual({
      rows: [{ segmentId: 's4', occurrence: 0 }],
      warnSegments: [],
    });
    expect(mo.snapshotRows(SEGMENTS, [reattached, edit('s4')])).toEqual({
      rows: [{ segmentId: 's4', occurrence: -1 }],
      warnSegments: ['s4'],
    });
    // The rule is "not re-attach", not "NULL": every save since PR1 writes 'editor-save'
    // (routes/segment-editor.js), so a NULL-only test would pass a rule that ignores those rows.
    expect(
      mo.snapshotRows(SEGMENTS, [reattached, edit('s4', { occurrence: 0, origin: 'editor-save' })])
    ).toEqual({
      rows: [{ segmentId: 's4', occurrence: 0 }],
      warnSegments: ['s4'],
    });
  });

  it('an approved row not yet applied is in flight on its own, and an applied one is not', () => {
    // In EDITS, s2's approved row sits beside a pending one, which a pending-only rule keeps too;
    // here it is the segment's only row (PR2 review U40).
    expect(
      mo.snapshotRows(SEGMENTS, [
        edit('s2', { status: 'approved', occurrence: 0, origin: 'editor-save' }),
        edit('s5', { status: 'approved', applied_at: '2026-06-12 16:00:00' }), // the control
      ])
    ).toEqual({ rows: [{ segmentId: 's2', occurrence: 0 }], warnSegments: ['s2'] });
  });

  it('nothing in flight: an empty snapshot', () => {
    expect(
      mo.snapshotRows(SEGMENTS, [
        edit('s5', { status: 'approved', applied_at: '2026-06-12 16:00:00' }),
        edit('s1', { status: 'rejected' }),
      ])
    ).toEqual({ rows: [], warnSegments: [] });
  });
});

describe('recordOpening (spec §5.5 steps 1–3)', () => {
  it('writes the opening and its snapshot in one transaction, and returns no time', () => {
    const r = mo.recordOpening(db, key(), snap);
    expect(r).toEqual({
      opened: true,
      inflightCount: 5,
      inflight: snap.rows,
      warnSegments: snap.warnSegments,
    });
    // T17: no time leaves the service.
    expect(Object.keys(r).sort()).toEqual(['inflight', 'inflightCount', 'opened', 'warnSegments']);
    expect(openings()).toEqual([
      { book: BOOK, chapter: 1, module_id: 'm95001', opened_at_ms: T0, inflight_count: 5 },
    ]);
    expect(
      db
        .prepare(
          'SELECT segment_id, occurrence FROM module_opening_inflight ORDER BY segment_id, occurrence'
        )
        .all()
    ).toEqual(snap.rows.map((x) => ({ segment_id: x.segmentId, occurrence: x.occurrence })));
    // decision 5: inflight_count is the rows written, and on this fixture the distinct ids too.
    expect(openings()[0].inflight_count).toBe(snap.rows.length);
    expect(openings()[0].inflight_count).toBe(new Set(snap.rows.map((x) => x.segmentId)).size);
  });

  it('a second call writes nothing, however much later and whatever it is given', () => {
    mo.recordOpening(db, key(), snap);
    const before = { o: openings(), i: inflightRows() };
    mo._setTestClock(() => T0 + 60_000);
    expect(
      mo.recordOpening(db, key(), {
        rows: [{ segmentId: 's6', occurrence: 0 }],
        warnSegments: ['s6'],
      })
    ).toEqual({ opened: false });
    expect({ o: openings(), i: inflightRows() }).toEqual(before);
  });

  it('a failed snapshot insert leaves no opening row', () => {
    plantInflightFault();
    let thrown;
    try {
      mo.recordOpening(db, key(), snap);
    } catch (err) {
      thrown = err;
    }
    expect(thrown && thrown.code).toBe('SQLITE_CONSTRAINT_TRIGGER');
    expect(openings()).toEqual([]);
    // Control: no snapshot insert fires, so the trigger is what failed the first.
    expect(
      mo.recordOpening(db, key({ moduleId: 'm95002' }), { rows: [], warnSegments: [] }).opened
    ).toBe(true);
  });
});

describe('readOpening (G1.23 index decision 3: services only, never a response)', () => {
  it('readOpening returns the opened time and the snapshot, and null for an unopened module', () => {
    expect(mo.readOpening(db, key())).toBeNull();
    mo.recordOpening(db, key(), snap);
    expect(mo.readOpening(db, key())).toEqual({ openedAtMs: T0, inflight: snap.rows });
    // The -1 convention survives the round trip ("every occurrence of the id").
    expect(mo.readOpening(db, key()).inflight).toContainEqual({ segmentId: 's1', occurrence: -1 });
    // Another chapter of the same module id, another module, another book: not this opening.
    expect(mo.readOpening(db, key({ chapter: 2 }))).toBeNull();
    expect(mo.readOpening(db, key({ moduleId: 'm95002' }))).toBeNull();
    expect(mo.readOpening(db, key({ book: 'liffraedi-2e' }))).toBeNull();
    // An opening with nothing in flight has an empty snapshot, not null.
    mo._setTestClock(() => T0 + 5);
    mo.recordOpening(db, key({ moduleId: 'm95002' }), { rows: [], warnSegments: [] });
    expect(mo.readOpening(db, key({ moduleId: 'm95002' }))).toEqual({
      openedAtMs: T0 + 5,
      inflight: [],
    });
  });
});

describe('openOnServe (spec §5.4 step 4: when to answer 503)', () => {
  const run = (providerId, served, over, edits = EDITS) =>
    mo.openOnServe(db, { ...key(over), providerId, served, segments: SEGMENTS, edits });
  // Made per `it`: the file's afterEach runs vi.restoreAllMocks(), which detaches a spy and empties
  // its calls, so a spy made once for the describe would be dead in every `it` after the first.
  let errorSpy, warnSpy;
  beforeEach(() => {
    errorSpy = vi.spyOn(log, 'error');
    warnSpy = vi.spyOn(log, 'warn');
  });

  it('a serve that does not meet the predicate is skipped, whatever the mint did (PR1 fail-soft stays)', () => {
    member('p-zero', 'editor');
    expect(run('p-zero', FAILED)).toEqual({ status: 'skipped', reason: 'no-assignment' });
    expect(openings()).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('a failed mint on a serve that meets the predicate is unrecorded, and the step is not attempted', () => {
    member('p-ed1', 'editor', [1]);
    expect(run('p-ed1', FAILED)).toEqual({ status: 'unrecorded', cause: 'mint' });
    expect(openings()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [obj, msg] = errorSpy.mock.calls[0];
    expect(msg).toMatch(/OPENING_UNRECORDED/);
    for (const k of Object.keys(obj)) {
      expect(['err', 'cause', 'book', 'chapter', 'moduleId']).toContain(k);
    }
    expect(obj.cause).toBe('mint');
  });

  it('a failed step is unrecorded, with nothing written', () => {
    member('p-ed1', 'editor', [1]);
    plantInflightFault();
    expect(run('p-ed1', MINTED)).toEqual({ status: 'unrecorded', cause: 'step' });
    expect(openings()).toEqual([]);
    // decision 9: the warning comes after the commit. EDITS carry four warn ids, so a warning
    // logged inside the transaction would fire here for an opening that then rolled back.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a value the checks refuse is a failed step, never a racing serve (decision 6)', () => {
    member('p-ed1', 'editor', [1]);
    mo._setTestClock(() => 0);
    // Under INSERT OR IGNORE this would be { status: 'skipped', reason: 'already-opened' }: a 200
    // with nothing recorded.
    expect(run('p-ed1', MINTED)).toEqual({ status: 'unrecorded', cause: 'step' });
    expect(openings()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [obj] = errorSpy.mock.calls[0];
    expect(obj.cause).toBe('step');
    expect(obj.err.code).toBe('SQLITE_CONSTRAINT_CHECK');
    // Control: the same serve with a real clock opens.
    mo._setTestClock(() => T0);
    expect(run('p-ed1', MINTED).status).toBe('opened');
    expect(openings()[0].opened_at_ms).toBe(T0);
  });

  it('a clock that is not an integer is a failed step: the checks require integers', () => {
    member('p-ed1', 'editor', [1]);
    // A bare `opened_at_ms > 0` admitted both: any TEXT sorts above every number (PR2 review U41).
    for (const bad of ['now', 1.5]) {
      mo._setTestClock(() => bad);
      expect(run('p-ed1', MINTED)).toEqual({ status: 'unrecorded', cause: 'step' });
    }
    expect(openings()).toEqual([]);
    expect(errorSpy.mock.calls.map(([o]) => o.err.code)).toEqual([
      'SQLITE_CONSTRAINT_CHECK',
      'SQLITE_CONSTRAINT_CHECK',
    ]);
  });

  it('a racing serve that inserted first wins: the loser is skipped, writes no snapshot and logs nothing', () => {
    member('p-ed1', 'editor', [1]);
    // The predicate saw no row, as a loser's does; the trigger's insert lands first, and the
    // statement's own `changes` is 0 (recursive triggers are off).
    db.exec(`CREATE TRIGGER planted_race BEFORE INSERT ON module_openings
      WHEN NOT EXISTS (SELECT 1 FROM module_openings
                       WHERE book = NEW.book AND chapter = NEW.chapter AND module_id = NEW.module_id)
      BEGIN
        INSERT INTO module_openings VALUES (NEW.book, NEW.chapter, NEW.module_id, 1600000000000, 0);
      END`);
    // A mutant that returns unrecorded('step') on the ignored insert fails this assertion.
    expect(run('p-ed1', MINTED)).toEqual({ status: 'skipped', reason: 'already-opened' });
    expect(openings()).toEqual([
      {
        book: BOOK,
        chapter: 1,
        module_id: 'm95001',
        opened_at_ms: 1600000000000,
        inflight_count: 0,
      },
    ]);
    // EDITS hold five in-flight ids, so a loser that wrote its snapshot would show them.
    expect(db.prepare('SELECT * FROM module_opening_inflight').all()).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    // Control: without the planted winner the same serve opens with its snapshot.
    db.exec('DROP TRIGGER planted_race');
    expect(run('p-ed1', MINTED, { moduleId: 'm95003' }).status).toBe('opened');
    expect(
      db.prepare("SELECT * FROM module_opening_inflight WHERE module_id = 'm95003'").all()
    ).toHaveLength(5);
  });

  it('a predicate that cannot be evaluated is unrecorded (decision 4)', () => {
    member('p-ed1', 'editor', [1]);
    member('p-zero', 'editor');
    db.exec('DROP TABLE module_opening_inflight; DROP TABLE module_openings');
    let r;
    expect(() => {
      r = run('p-ed1', MINTED);
    }).not.toThrow();
    expect(r).toEqual({ status: 'unrecorded', cause: 'predicate' });
    // Control: a user who holds no row never reaches the missing table.
    expect(run('p-zero', MINTED)).toEqual({ status: 'skipped', reason: 'no-assignment' });
  });

  it('a serve that meets it and records it is opened, and warns once for the non-re-attach rows', () => {
    member('p-ed1', 'editor', [1]);
    const r = run('p-ed1', MINTED);
    expect(r.status).toBe('opened');
    expect(r.opening).toMatchObject({ opened: true, inflightCount: 5 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [obj, msg] = warnSpy.mock.calls[0];
    expect(obj).toEqual({
      book: BOOK,
      chapter: 1,
      moduleId: 'm95001',
      segments: ['d', 's1', 's2', 's3'],
    });
    expect(msg).toMatch(/re-attach/);
    expect(run('p-ed1', MINTED)).toEqual({ status: 'skipped', reason: 'already-opened' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('an opening whose only in-flight row is re-attached warns nothing', () => {
    member('p-ed1', 'editor', [1]);
    const r = run('p-ed1', MINTED, {}, [edit('s4', { occurrence: 0, origin: 're-attach' })]);
    expect(r.status).toBe('opened');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('never throws', () => {
    member('p-ed1', 'editor', [1]);
    const closed = new Database(':memory:');
    closed.close();
    let r;
    expect(() => {
      r = mo.openOnServe(closed, {
        ...key(),
        providerId: 'p-ed1',
        served: MINTED,
        segments: SEGMENTS,
        edits: EDITS,
      });
    }).not.toThrow();
    expect(r).toEqual({ status: 'unrecorded', cause: 'predicate' });
  });
});

describe('OPENING_UNRECORDED (decision 8; text: decision 28)', () => {
  it('carries the Icelandic text [USER] approved on 2026-11-04, byte for byte', () => {
    // The route tests compare the body with this constant, i.e. the constant with itself; this is
    // the one place the approved literal is pinned (PR2 review U38). A change to it goes back to
    // [USER] first (decision 28).
    expect(mo.OPENING_UNRECORDED).toEqual({
      status: 503,
      code: 'OPENING_UNRECORDED',
      message:
        'Ekki tókst að skrá opnun einingarinnar og því var hún ekki opnuð. Opnið eininguna aftur.',
    });
    expect(mo.OPENING_UNRECORDED.message.normalize('NFC')).toBe(mo.OPENING_UNRECORDED.message);
  });
});

describe('moduleOpenedDetail (PR3’s seam; index decision 2)', () => {
  it('carries exactly what the module-opened event lists (spec §5.9)', () => {
    expect(mo.moduleOpenedDetail(MINTED, { inflightCount: 5 })).toEqual({
      servedVersionIds: MINTED.servedVersionIds,
      duplicatedIds: ['d'],
      inflightCount: 5,
    });
  });
});
