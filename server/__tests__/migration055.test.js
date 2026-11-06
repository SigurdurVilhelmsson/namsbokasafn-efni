/**
 * Migration 055: research_consent, research_capture_losses and book_switch_events (G1.1 + G1.2
 * spec §5.11, §5.13, §5.14; PR3 Task 3).
 *
 * The schema is read back from a database every real migration built (freshMigratedDb). The
 * never-throw test is the model's (048, 053, 054): a fault rolls the whole unit back, warns once,
 * and the next start completes it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const m055 = require('../migrations/055-research-consent-and-switches');

const __dirname = dirname(fileURLToPath(import.meta.url));

const open = [];
function track(db) {
  open.push(db);
  return db;
}
afterEach(() => {
  while (open.length) {
    const db = open.pop();
    if (db.open) db.close();
  }
  vi.restoreAllMocks();
});

const migrated = () => track(freshMigratedDb().db);

const cols = (db, t) =>
  Object.fromEntries(db.pragma(`table_info(${t})`).map((c) => [c.name, [c.type, c.notnull]]));

const CONSENT_COLS = {
  id: ['INTEGER', 0],
  user_id: ['INTEGER', 1],
  decision: ['TEXT', 1],
  interval_id: ['INTEGER', 0],
  consent_text_version: ['TEXT', 1],
  consent_text_sha256: ['TEXT', 1],
  given_at_ms: ['INTEGER', 1],
  withdrawn_at_ms: ['INTEGER', 0],
  deletion_done_at_ms: ['INTEGER', 0],
};
const LOSS_COLS = {
  interval_id: ['INTEGER', 0],
  book: ['TEXT', 1],
  chapter: ['INTEGER', 1],
  module_id: ['TEXT', 1],
  event_type: ['TEXT', 1],
  loss_day: ['TEXT', 1],
  error_class: ['TEXT', 1],
  client_action_id: ['TEXT', 0],
};
const SWITCH_COLS = {
  id: ['INTEGER', 0],
  book: ['TEXT', 1],
  switch_name: ['TEXT', 1],
  value: ['INTEGER', 1],
  switched_at_ms: ['INTEGER', 1],
};

const HEX64 = 'a'.repeat(64);

function consent(db, { decision = 'consented', interval = 1, sha = HEX64 } = {}) {
  return db
    .prepare(
      `INSERT INTO research_consent
         (user_id, decision, interval_id, consent_text_version, consent_text_sha256, given_at_ms)
       VALUES (999999, ?, ?, 'v1', ?, 1700000000000)`
    )
    .run(decision, interval, sha);
}

function loss(db, { errorClass = 'busy', interval = 3, day = '2026-11-03' } = {}) {
  return db
    .prepare(
      `INSERT INTO research_capture_losses
         (interval_id, book, chapter, module_id, event_type, loss_day, error_class)
       VALUES (?, 'efnafraedi-2e', 1, 'm1', 'segment-saved', ?, ?)`
    )
    .run(interval, day, errorClass);
}

function sw(db, value) {
  return db
    .prepare(
      `INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms)
       VALUES ('efnafraedi-2e', 'capture', ?, 1700000000000)`
    )
    .run(value);
}

describe('migration 055: consent record, loss ledger, switch table', () => {
  it('creates the three tables, column by column', () => {
    const db = migrated();
    expect(cols(db, 'research_consent')).toEqual(CONSENT_COLS);
    expect(cols(db, 'research_capture_losses')).toEqual(LOSS_COLS);
    expect(cols(db, 'book_switch_events')).toEqual(SWITCH_COLS);
  });

  it('no foreign key on research_consent.user_id, while foreign keys are live', () => {
    const db = migrated();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_list(research_consent)')).toEqual([]);
    expect(() => consent(db)).not.toThrow();
    // Control: a reference of the kind spec §5.14 forbids would really bite.
    expect(() =>
      db
        .prepare(
          `INSERT INTO user_chapter_assignments (user_id, book_slug, chapter)
           VALUES (999999, 'efnafraedi-2e', 1)`
        )
        .run()
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('the CHECKs refuse what the spec rules out, and admit what it allows', () => {
    const db = migrated();
    const pairs = [
      [
        () => consent(db, { decision: 'maybe' }),
        () => consent(db, { decision: 'declined', interval: null }),
      ],
      [
        () => consent(db, { decision: 'declined', interval: 5 }),
        () => consent(db, { decision: 'declined', interval: null }),
      ],
      [() => consent(db, { sha: 'a'.repeat(63) }), () => consent(db, { sha: HEX64 })],
      [() => consent(db, { sha: 'A'.repeat(64) }), () => consent(db, { sha: 'a'.repeat(64) })],
      [() => loss(db, { errorClass: 'flaky' }), () => loss(db, { errorClass: 'busy' })],
      [
        () => loss(db, { errorClass: 'consent-unknown', interval: 3 }),
        () => loss(db, { errorClass: 'consent-unknown', interval: null }),
      ],
      [
        () => loss(db, { errorClass: 'busy', interval: null }),
        () => loss(db, { errorClass: 'busy', interval: 3 }),
      ],
      [() => loss(db, { day: '2026-1-3' }), () => loss(db, { day: '2026-11-03' })],
      [() => sw(db, 2), () => sw(db, 1)],
    ];
    for (const [bad, good] of pairs) {
      expect(bad).toThrow(/CHECK/);
      expect(good).not.toThrow();
    }
  });

  it('is idempotent', () => {
    const db = migrated();
    const schema = () => db.prepare('SELECT sql FROM sqlite_master ORDER BY name').pluck().all();
    const before = schema();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m055.up(db);
    expect(schema()).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never throws: a conflicting table rolls the whole unit back, warns once, and the next start completes it', () => {
    const db = track(new Database(':memory:'));
    db.exec('CREATE TABLE research_capture_losses (x TEXT)');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => m055.up(db)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[055\]/);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('research_consent', 'book_switch_events')"
        )
        .all()
    ).toEqual([]);

    // Control: the same migration completes once the fault is gone.
    db.exec('DROP TABLE research_capture_losses');
    m055.up(db);
    expect(cols(db, 'research_consent')).toEqual(CONSENT_COLS);
    expect(cols(db, 'research_capture_losses')).toEqual(LOSS_COLS);
    expect(cols(db, 'book_switch_events')).toEqual(SWITCH_COLS);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is registered in migrationRunner after 054', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain(`'../migrations/055-research-consent-and-switches'`);
    expect(src.indexOf('054-module-openings')).toBeLessThan(
      src.indexOf('055-research-consent-and-switches')
    );
  });
});
