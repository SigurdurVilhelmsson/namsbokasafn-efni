// server/__tests__/bookGlossaryInflections.test.js
/**
 * The background BÍN lookup for a book-glossary entry (design §5.4; plan rulings P6, P7, P9).
 *
 * Injected runners unless a test says it runs the real script. Every test points the service at
 * an existing fixture CSV first, because the file-absent check runs before any runner: without
 * that, a result would depend on whether this box holds the licensed BÍN file.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');

// A decoy database path, set BEFORE any server module loads, so resolveDbPath() names it. The
// directory exists and the file does not: a runner that wrongly hands the child resolveDbPath()
// makes the child create the file, which the decoy test then sees. Left unset, the same mistake
// would write to the developer's real sessions.db. With a missing directory the child could not
// create anything and a broken runner would leave no trace.
const DECOY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'book-glossary-decoy-'));
const DECOY_DB = path.join(DECOY_DIR, 'decoy-sessions.db');
const savedDbPath = process.env.SESSIONS_DB_PATH;
process.env.SESSIONS_DB_PATH = DECOY_DB;

const childProcess = require('child_process');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const activityLog = require('../services/activityLog');
const bookGlossaryDb = require('../services/bookGlossaryDb');
const inflections = require('../services/bookGlossaryInflections');
const { addEntry } = require('../lib/bookGlossaryLayer');
const logger = require('../lib/logger');

const BOOK = 'efnafraedi-2e';
const CTX = { book: BOOK, userId: 'u-1', username: 'Prófari' };

// INVENTED ROWS, the binInflectionsCli.test.js idiom: no BÍN bytes in the repository.
// SHsnid layout: lemma;binId;wordClass;register;form;tag
const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'book-glossary-bin-'));
const FIXTURE_CSV = path.join(FIXTURE_DIR, 'fixture.csv');
fs.writeFileSync(
  FIXTURE_CSV,
  ['zsolo;9201;kvk;alm;zsolo;NFET', 'zsolo;9201;kvk;alm;zsolu;THGFET'].join('\n') + '\n',
  'utf-8'
);

let db;
let seq = 0;
let warnSpy;

/** A fresh book-layer entry with this Icelandic; its concept id. Unique English per call. */
function entryWith(icelandic) {
  seq += 1;
  return addEntry(db, {
    book: BOOK,
    english: [`zform${seq}`],
    icelandic,
    reason: 'r',
    source: '',
    by: 'tester',
  }).conceptId;
}
const isRowOf = (conceptId) =>
  db
    .prepare("SELECT id, text, inflections FROM concept_term WHERE concept_id = ? AND lang = 'is'")
    .get(conceptId);
const flush = () => new Promise((r) => setImmediate(r));

function report({ strings = {}, rows = {} } = {}) {
  return {
    strings: {
      total: 1,
      unambiguous: 0,
      rescuedNominal: 0,
      refusedAmbiguous: 0,
      refusedNoNoun: 0,
      baseFormOnly: 0,
      notInBin: 0,
      ...strings,
    },
    rows: {
      total: 1,
      written: 0,
      refused: 0,
      baseFormOnly: 0,
      notInBin: 0,
      multiWordSkipped: 0,
      alreadyPopulatedBefore: 0,
      alreadyPopulatedAfter: 0,
      superseded: 0,
      ...rows,
    },
    rescues: [],
    refusals: [],
  };
}
const ok = (r) => ({ code: 0, signal: null, report: r, stderr: '' });
const FORMS = ok(report({ strings: { unambiguous: 1 }, rows: { written: 1 } }));
const SUPERSEDED = ok(report({ strings: { unambiguous: 1 }, rows: { superseded: 1 } }));

/** A runner whose calls stay open until the test resolves them. */
function heldRunner() {
  const calls = [];
  const runner = (args) => new Promise((resolve) => calls.push({ args, resolve }));
  const releaseAll = () => calls.forEach((c) => c.resolve(FORMS));
  return { calls, runner, releaseAll };
}

beforeAll(() => {
  db = freshMigratedDb().db;
  bookGlossaryDb._setTestDb(db);
  activityLog._setTestDb(db);
});

afterAll(() => {
  inflections._setRunner(undefined);
  inflections._setBinDataPath(undefined);
  bookGlossaryDb._setTestDb(null);
  activityLog._setTestDb(null);
  db.close();
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  fs.rmSync(DECOY_DIR, { recursive: true, force: true });
  if (savedDbPath === undefined) delete process.env.SESSIONS_DB_PATH;
  else process.env.SESSIONS_DB_PATH = savedDbPath;
});

beforeEach(() => {
  inflections._setBinDataPath(FIXTURE_CSV);
  // The error and timeout paths log on purpose; kept out of the test output, and asserted where
  // a test is about them.
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await inflections._idle();
  inflections._setRunner(undefined);
  vi.restoreAllMocks();
});

describe('the queue', () => {
  it('one lookup at a time: a second schedule waits until the first finishes', async () => {
    const a = entryWith('zalfa');
    const b = entryWith('zbeta');
    const c = entryWith('zgamma');
    const held = heldRunner();
    let active = 0;
    let maxActive = 0;
    inflections._setRunner((args) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return held.runner(args).finally(() => {
        active -= 1;
      });
    });
    try {
      inflections.schedule(a, CTX);
      inflections.schedule(b, CTX);
      inflections.schedule(c, CTX);
      await flush();
      expect(held.calls.map((x) => x.args.conceptTermIds)).toEqual([[isRowOf(a).id]]);
      expect(inflections.status(b)).toEqual({ state: 'pending' });

      held.calls[0].resolve(FORMS);
      await flush();
      expect(held.calls.map((x) => x.args.conceptTermIds)).toEqual([
        [isRowOf(a).id],
        [isRowOf(b).id],
      ]);

      held.calls[1].resolve(FORMS);
      await flush();
      held.calls[2].resolve(FORMS);
      await inflections._idle();
      expect(held.calls).toHaveLength(3);
      expect(maxActive).toBe(1);
    } finally {
      held.releaseAll();
    }
  });

  it('a repeat schedule while queued is dropped', async () => {
    const a = entryWith('zdelta');
    const b = entryWith('zepsilon');
    const held = heldRunner();
    inflections._setRunner(held.runner);
    try {
      inflections.schedule(a, CTX);
      inflections.schedule(b, CTX);
      inflections.schedule(b, CTX);
      await flush();
      expect(held.calls).toHaveLength(1);
      expect(inflections.status(b)).toEqual({ state: 'pending' });

      held.calls[0].resolve(FORMS);
      await flush();
      held.calls[1].resolve(FORMS);
      await inflections._idle();
      const forB = held.calls.filter((x) => x.args.conceptTermIds[0] === isRowOf(b).id);
      expect(forB).toHaveLength(1);
      expect(held.calls).toHaveLength(2);
    } finally {
      held.releaseAll();
    }
  });

  it("a change during a running lookup ends with the new word's forms", async () => {
    const a = entryWith('zzeta');
    const held = heldRunner();
    inflections._setRunner(held.runner);
    try {
      inflections.schedule(a, CTX);
      await flush();
      expect(held.calls).toHaveLength(1);

      // The head editor changes the word while the first lookup runs.
      inflections.schedule(a, CTX);
      held.calls[0].resolve(SUPERSEDED);
      await flush();
      expect(held.calls).toHaveLength(2);
      // The rerun is under way, so the superseded first result is never shown as final.
      expect(inflections.status(a)).toEqual({ state: 'pending' });

      held.calls[1].resolve(FORMS);
      await inflections._idle();
      expect(inflections.status(a)).toEqual({ state: 'done', result: 'forms' });
    } finally {
      held.releaseAll();
    }
  });

  it('a timed-out lookup is recorded and the next one runs', async () => {
    const a = entryWith('zeta');
    const b = entryWith('ztheta');
    const outcomes = [{ code: null, signal: 'SIGTERM', report: null, stderr: '' }, FORMS];
    const runner = vi.fn(async () => outcomes.shift());
    inflections._setRunner(runner);
    inflections.schedule(a, CTX);
    inflections.schedule(b, CTX);
    await inflections._idle();
    expect(runner).toHaveBeenCalledTimes(2);
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'timeout' });
    expect(inflections.status(b)).toEqual({ state: 'done', result: 'forms' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ conceptId: a, result: 'timeout', signal: 'SIGTERM' }),
      expect.any(String)
    );
  });

  it('a runner that throws is recorded as error and the next one runs', async () => {
    const a = entryWith('ziota');
    const b = entryWith('zkappa');
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error('spawn failed'))
      .mockResolvedValueOnce(FORMS);
    inflections._setRunner(runner);
    inflections.schedule(a, CTX);
    inflections.schedule(b, CTX);
    await inflections._idle();
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'error' });
    expect(inflections.status(b)).toEqual({ state: 'done', result: 'forms' });
  });

  it('status is null for a concept never scheduled', () => {
    expect(inflections.status(987654)).toBeNull();
  });
});

describe('before any child runs', () => {
  it('file absent: recorded without spawning', async () => {
    const a = entryWith('zlambda');
    const runner = vi.fn(async () => FORMS);
    inflections._setRunner(runner);
    inflections._setBinDataPath('/nonexistent');
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(runner).not.toHaveBeenCalled();
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'file-absent' });
  });

  it('a multi-word Icelandic is several-words without spawning', async () => {
    const a = entryWith('zafl zsolo');
    const runner = vi.fn(async () => FORMS);
    inflections._setRunner(runner);
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(runner).not.toHaveBeenCalled();
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'several-words' });
  });

  it('a concept with no Icelandic row is no-term without spawning', async () => {
    const id = Number(
      db
        .prepare("INSERT INTO concept (domain, collection) VALUES ('chemistry', 'book-layer')")
        .run().lastInsertRowid
    );
    const runner = vi.fn(async () => FORMS);
    inflections._setRunner(runner);
    inflections.schedule(id, CTX);
    await inflections._idle();
    expect(runner).not.toHaveBeenCalled();
    expect(inflections.status(id)).toEqual({ state: 'done', result: 'no-term' });
  });
});

describe('mapping a run to its result', () => {
  it.each([
    ['forms', FORMS],
    ['not-in-bin', ok(report({ strings: { notInBin: 1 }, rows: { notInBin: 1 } }))],
    ['ambiguous', ok(report({ strings: { refusedAmbiguous: 1 }, rows: { refused: 1 } }))],
    ['ambiguous', ok(report({ strings: { refusedNoNoun: 1 }, rows: { refused: 1 } }))],
    ['base-form-only', ok(report({ strings: { baseFormOnly: 1 }, rows: { baseFormOnly: 1 } }))],
    ['already', ok(report({ strings: { total: 0 }, rows: { total: 0 } }))],
    ['timeout', { code: null, signal: 'SIGTERM', report: null, stderr: '' }],
    ['error', { code: 1, signal: null, report: null, stderr: 'boom' }],
    // Exit 0 with no readable report is a failure to learn the outcome, never "nothing to do".
    ['error', { code: 0, signal: null, report: null, stderr: '' }],
    ['error', ok(report({ strings: { unambiguous: 1 } }))],
  ])('each report maps to its result: %s', async (expected, outcome) => {
    const a = entryWith(`zmap${seq}`);
    inflections._setRunner(async () => outcome);
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(inflections.status(a)).toEqual({ state: 'done', result: expected });
  });

  it.each([
    ['nothing written', SUPERSEDED],
    [
      'another row written',
      ok(report({ strings: { unambiguous: 1 }, rows: { written: 1, superseded: 1 } })),
    ],
  ])('superseded maps to its own result (%s)', async (_label, outcome) => {
    const a = entryWith(`zsup${seq}`);
    inflections._setRunner(async () => outcome);
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'superseded' });
  });

  it('the RESULTS list names every result', () => {
    expect([...inflections.RESULTS].sort()).toEqual(
      [
        'forms',
        'not-in-bin',
        'ambiguous',
        'base-form-only',
        'several-words',
        'file-absent',
        'already',
        'superseded',
        'no-term',
        'timeout',
        'error',
      ].sort()
    );
  });
});

describe('the real script', () => {
  it('the real script with a fixture CSV writes forms', async () => {
    const a = entryWith('zsolo');
    expect(isRowOf(a).inflections).toBeNull();
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(JSON.parse(isRowOf(a).inflections)).toEqual(['zsolu']);
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'forms' });
  });

  it('a second lookup of a filled row is already', async () => {
    const a = entryWith('zsolo');
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'forms' });
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'already' });
  });

  it("the child writes to the service's own database, never resolveDbPath()'s", async () => {
    expect(fs.existsSync(DECOY_DB)).toBe(false); // precondition: nothing created it so far
    const a = entryWith('zsolo');
    const seen = [];
    inflections._setRunner((args) => {
      seen.push(args);
      return inflections._defaultRunner(args);
    });
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(seen).toHaveLength(1);
    expect(fs.existsSync(DECOY_DB)).toBe(false);
    expect(seen[0].dbPath).toBe(db.name);
    expect(JSON.parse(isRowOf(a).inflections)).toEqual(['zsolu']);
  });

  it('the temp report file is deleted after the run', async () => {
    const made = [];
    const real = fs.mkdtempSync.bind(fs);
    vi.spyOn(fs, 'mkdtempSync').mockImplementation((prefix, ...rest) => {
      const dir = real(prefix, ...rest);
      made.push(dir);
      return dir;
    });
    const a = entryWith('zsolo');
    inflections.schedule(a, CTX);
    await inflections._idle();
    // Control: the run did make its temp directory, and it held the report the result came from.
    expect(made).toHaveLength(1);
    expect(inflections.status(a)).toEqual({ state: 'done', result: 'forms' });
    expect(fs.existsSync(made[0])).toBe(false);
  });

  it('the child is spawned with a ten-minute kill timeout (plan ruling P9)', async () => {
    const spy = vi.spyOn(childProcess, 'spawn');
    const a = entryWith('zsolo');
    inflections.schedule(a, CTX);
    await inflections._idle();
    expect(spy).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spy.mock.calls[0];
    expect(cmd).toBe('node');
    expect(args).toContain('--execute');
    expect(args[args.indexOf('--concept-term-ids') + 1]).toBe(String(isRowOf(a).id));
    expect(args[args.indexOf('--db') + 1]).toBe(db.name);
    expect(args[args.indexOf('--bin-data') + 1]).toBe(FIXTURE_CSV);
    expect(opts.timeout).toBe(600000);
  });
});

describe('the activity log', () => {
  it('every result writes one activity row', async () => {
    db.exec("DELETE FROM activity_log WHERE type = 'book_glossary_inflections'");
    const forms = entryWith('znu');
    const several = entryWith('zxi zomicron');
    const noTerm = Number(
      db
        .prepare("INSERT INTO concept (domain, collection) VALUES ('chemistry', 'book-layer')")
        .run().lastInsertRowid
    );
    inflections._setRunner(async () => FORMS);
    inflections.schedule(forms, CTX);
    inflections.schedule(several, CTX);
    inflections.schedule(noTerm, CTX);
    await inflections._idle();
    inflections._setBinDataPath('/nonexistent');
    const absent = entryWith('zpi');
    inflections.schedule(absent, CTX);
    await inflections._idle();

    const rows = db
      .prepare(
        "SELECT user_id, username, book, metadata FROM activity_log WHERE type = 'book_glossary_inflections' ORDER BY id"
      )
      .all();
    expect(rows.map((r) => JSON.parse(r.metadata))).toEqual([
      { conceptId: forms, result: 'forms' },
      { conceptId: several, result: 'several-words' },
      { conceptId: noTerm, result: 'no-term' },
      { conceptId: absent, result: 'file-absent' },
    ]);
    for (const r of rows) {
      expect([r.user_id, r.username, r.book]).toEqual([CTX.userId, CTX.username, CTX.book]);
    }
  });

  it('the two activity types exist (plan ruling P7)', () => {
    expect(activityLog.ACTIVITY_TYPES.BOOK_GLOSSARY_CHANGED).toBe('book_glossary_changed');
    expect(activityLog.ACTIVITY_TYPES.BOOK_GLOSSARY_INFLECTIONS).toBe('book_glossary_inflections');
  });
});
