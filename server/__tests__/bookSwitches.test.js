// server/__tests__/bookSwitches.test.js — spec §5.13 (G1.2 PR3, Task 8)
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const freshMigratedDb = require('./helpers/freshMigratedDb');
const { currentSwitchValue, firstSwitchOnMs } = require('../lib/bookSwitches');

const CHEM = 'efnafraedi-2e';
let db;
beforeEach(() => {
  db = freshMigratedDb().db;
});

const insert = (book, value, at) =>
  db
    .prepare(
      "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', ?, ?)"
    )
    .run(book, value, at);
const both = () => [
  currentSwitchValue(db, CHEM, 'suggestion-view'),
  firstSwitchOnMs(db, CHEM, 'suggestion-view'),
];

describe('book switches (spec §5.13)', () => {
  it('no row is off, with no first switch-on', () => {
    expect(both()).toEqual([false, null]);
  });

  it('the current value is the highest id; the first switch-on is the lowest-id row with value 1 (T14)', () => {
    insert(CHEM, 1, 200);
    insert(CHEM, 0, 300);
    expect(both()).toEqual([false, 200]);
    insert(CHEM, 1, 100);
    expect(both()).toEqual([true, 200]);
    // Control: another book's rows leave chemistry's answer unchanged.
    insert('liffraedi-2e', 0, 50);
    insert('liffraedi-2e', 1, 60);
    expect(both()).toEqual([true, 200]);
  });
});
