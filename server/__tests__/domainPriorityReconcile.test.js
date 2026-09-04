/**
 * Migration 047 must be able to tell a NO-OP from a REVERT (§C119).
 *
 * WHY THIS EXISTS. 047 DELETEs and re-INSERTs each named book's
 * book_domain_priority rows from server/lib/domains.js on EVERY boot — that is
 * deliberate enforcement, and it is not what changed here. What was missing is
 * that it did so UNCONDITIONALLY, with no comparison and no report, so it could
 * not distinguish "the rows already match" from "I have just undone an
 * operator's change".
 *
 * Measured 2026-08-31: a trim of lifraen-efnafraedi to ["chemistry"] was live at
 * 06:28:19 (a deploy's own DB backup) and gone at 06:30:01 (the next cron
 * backup) — 102 seconds, one server restart, no error, no log line, no gate. The
 * operator learned of it days later from a glossary that had silently doubled.
 *
 * 047's own docstring predicted exactly this: "the same repeated execution that
 * removes an orphan would silently revert an editorial reorder ... If the table
 * is ever made user-writable, this must be revisited." A hand-run SQL statement
 * IS that write. So the guard is not "stop enforcing" — enforcement is correct —
 * it is "say so when enforcement actually changes something".
 *
 * This file tests the PURE diff. The migration wiring and the health surface
 * that consumes the verdict are pinned separately; a detector that fires into a
 * log nobody reads is not a gate.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { reconcileDiff } = require('../lib/domainPriorityReconcile.js');

describe('reconcileDiff', () => {
  it('reports no change when the rows already match', () => {
    expect(reconcileDiff(['chemistry', 'biology'], ['chemistry', 'biology']).changed).toBe(false);
  });

  // THE INCIDENT. A trim to ["chemistry"] against a desired list that still has
  // three domains is a revert, and this is the assertion that names it one.
  it('reports a change when the live rows were TRIMMED', () => {
    expect(reconcileDiff(['chemistry'], ['chemistry', 'biology', 'physics']).changed).toBe(true);
  });

  it('carries both sides so the report can say what it undid', () => {
    expect(reconcileDiff(['chemistry'], ['chemistry', 'biology'])).toEqual({
      changed: true,
      kind: 'overwrite',
      before: ['chemistry'],
      after: ['chemistry', 'biology'],
    });
  });

  // ORDER IS THE WHOLE POINT of this table — position decides which domain wins
  // a contested headword — so a reorder is a change, not a no-op.
  it('treats a REORDER as a change, because position decides the winner', () => {
    expect(reconcileDiff(['biology', 'chemistry'], ['chemistry', 'biology']).changed).toBe(true);
  });

  it('reports a change when a domain was ADDED live', () => {
    expect(reconcileDiff(['chemistry', 'astronomy'], ['chemistry']).changed).toBe(true);
  });

  // A book with no rows yet is a first SEED, not a revert of anyone's work.
  // Conflating the two would fire the alarm on every fresh clone and on every
  // newly registered book — and noise is how an alarm gets ignored, which is
  // how the 2026-08-31 revert stayed invisible for days.
  it('classifies empty -> populated as a SEED, not an overwrite', () => {
    expect(reconcileDiff([], ['chemistry']).kind).toBe('seed');
  });

  it('classifies populated -> different as an OVERWRITE', () => {
    expect(reconcileDiff(['chemistry'], ['chemistry', 'biology']).kind).toBe('overwrite');
  });

  it('classifies a match as none', () => {
    expect(reconcileDiff(['chemistry'], ['chemistry']).kind).toBe('none');
  });

  it('is not confused by an empty desired list', () => {
    expect(reconcileDiff(['chemistry'], []).changed).toBe(true);
  });
});
