#!/usr/bin/env node
/**
 * Capture losses per consent interval, content-free (G1.2 spec §5.20, §5.22).
 *
 * Read-only. It reads ONLY the loss ledger and prints counts: per interval, by error class and
 * by event type, plus the losses that have no interval because the consent lookup itself failed.
 * It prints no day, no module and no action id, and it opens no other table: the per-editor
 * decided/undecided reports are G1.13's, not this script's.
 *
 * Usage: node server/scripts/research-status.js
 *
 * The exit code is a verdict: 1 on entry and on any failure, 0 only after the summary printed.
 */
'use strict';

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {{intervals: {intervalId: number, total: number,
 *   byErrorClass: Record<string, number>, byEventType: Record<string, number>}[],
 *   consentUnknown: number}}
 */
function summarise(db) {
  const rows = db
    .prepare(
      `SELECT interval_id, error_class, event_type, COUNT(*) AS n
         FROM research_capture_losses
        GROUP BY interval_id, error_class, event_type`
    )
    .all();
  const byInterval = new Map();
  let consentUnknown = 0;
  for (const r of rows) {
    if (r.interval_id === null) {
      consentUnknown += r.n;
      continue;
    }
    if (!byInterval.has(r.interval_id)) {
      byInterval.set(r.interval_id, {
        intervalId: r.interval_id,
        total: 0,
        byErrorClass: {},
        byEventType: {},
      });
    }
    const entry = byInterval.get(r.interval_id);
    entry.total += r.n;
    entry.byErrorClass[r.error_class] = (entry.byErrorClass[r.error_class] || 0) + r.n;
    entry.byEventType[r.event_type] = (entry.byEventType[r.event_type] || 0) + r.n;
  }
  const intervals = [...byInterval.values()].sort((a, b) => a.intervalId - b.intervalId);
  return { intervals, consentUnknown };
}

/**
 * @param {{argv?: string[], out?: (s: string) => void, err?: (s: string) => void}} [io]
 */
function main({
  argv = process.argv.slice(2),
  out = (s) => process.stdout.write(s),
  err = (s) => process.stderr.write(s),
} = {}) {
  process.exitCode = 1; // a run that reaches no verdict must not read as success
  if (argv.length) {
    err('research-status.js takes no arguments\n');
    return;
  }
  let db;
  try {
    const Database = require('better-sqlite3');
    const resolveDbPath = require('../lib/dbPath');
    db = new Database(resolveDbPath(), { readonly: true, fileMustExist: true });
    const summary = summarise(db);
    out(JSON.stringify(summary, null, 1) + '\n');
    process.exitCode = 0;
  } catch (e) {
    err(`research-status failed: ${String(e.message).split('\n')[0]}\n`);
  } finally {
    if (db) db.close();
  }
}

if (require.main === module) main();

module.exports = { summarise, main };
