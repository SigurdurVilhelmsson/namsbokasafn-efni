/**
 * The hand-copied segment_edits schema (helpers/segmentEditsSchema.cjs) against the migrated one
 * (index decision 11).
 *
 * Most editing suites build segment_edits from the hand copy, not from the migrations, so a column
 * a migration adds and the copy lacks makes those suites test a table production does not have.
 * This compares name, type, NOT NULL and primary key, column by column, against a database every
 * real migration built. The control plants a column on one side and must see it named.
 */
import { it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');

const shape = (db) =>
  Object.fromEntries(
    db.pragma('table_info(segment_edits)').map((c) => [c.name, `${c.type}|${c.notnull}|${c.pk}`])
  );

function drift(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((n) => a[n] !== b[n]).sort();
}

it('the hand copy has the migrated columns: name, type, NOT NULL and key', () => {
  const { db } = freshMigratedDb();
  const hand = new Database(':memory:');
  createSegmentEditsSchema(hand);
  expect(drift(shape(db), shape(hand))).toEqual([]);
});

it('control: a column only one side has is named', () => {
  const { db } = freshMigratedDb();
  db.exec('ALTER TABLE segment_edits ADD COLUMN planted_probe TEXT');
  const hand = new Database(':memory:');
  createSegmentEditsSchema(hand);
  expect(drift(shape(db), shape(hand))).toEqual(['planted_probe']);
});
