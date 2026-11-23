/**
 * Crash injection for the migration-convergence check. Loaded only by child.js, never by the server.
 *
 * THE CRASH UNIT IS A SQLITE COMMIT, NOT A JS CALL. A process can die between any two commits; a
 * death inside an open transaction rolls it back, which leaves the same state as dying before the
 * transaction began. So a crash point is "just after a commit": after a write that leaves the
 * connection outside a transaction (an autocommitted statement), or after an outermost
 * `db.transaction(fn)` call returns (its COMMIT).
 *
 * MULTI-STATEMENT `exec` STRINGS ARE SPLIT. SQLite runs `exec('A; B; C')` as three autocommitted
 * statements, and a process can die between them. A hook on the `exec` CALL would see one point
 * after C and miss the gaps after A and B. So `exec` runs its statements one at a time, with a
 * crash point after each one that commits. child.js's no-crash control proves the split builds the
 * same schema as the unsplit original.
 *
 * Modes, from the environment:
 *   MIG_CRASH_AT=<k>  die by SIGKILL at crash point k (1-based), after writing its label to MIG_LOG
 *   MIG_CRASH_AT=list write every crash point's label to MIG_LOG, one per line, and do not die
 *   unset             no crash, no log (the restart arm)
 */
'use strict';

const fs = require('node:fs');
const Database = require('better-sqlite3');

const MODE = process.env.MIG_CRASH_AT;
const LOG = process.env.MIG_LOG;
const crashAt = MODE && MODE !== 'list' ? Number(MODE) : null;
let point = 0;

/** The migration whose code made this call: the nearest server/migrations/NNN-*.js stack frame. */
function migrationOnStack() {
  const m = /[\\/]migrations[\\/](\d{3}-[\w-]+)\.js/.exec(new Error().stack || '');
  return m ? m[1] : '(no migration on stack)';
}

/** Called just after a commit. `label` names the SQL that committed. */
function crashPoint(label) {
  if (!MODE) return;
  point++;
  // Trimmed AFTER the cut: check.js compares this label byte for byte with the one it reads back.
  const sql = label.replace(/\s+/g, ' ').trim().slice(0, 160).trim();
  const line = `${point}\t${migrationOnStack()}\t${sql}\n`;
  if (MODE === 'list') {
    fs.appendFileSync(LOG, line);
    return;
  }
  if (point === crashAt) {
    // Synchronously, so the label is on disk before the kill: the parent checks it.
    fs.writeFileSync(LOG, line);
    process.kill(process.pid, 'SIGKILL');
  }
}

/**
 * Split an SQL script into statements: on `;` outside quotes and comments, keeping a
 * `CREATE TRIGGER … BEGIN … END;` body whole (its inner `;` belong to it).
 */
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      while (j < n) {
        if (sql[j] === close) {
          if (close !== ']' && sql[j + 1] === close) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '-' && d === '-') {
      const j = sql.indexOf('\n', i);
      const end = j === -1 ? n : j;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === '/' && d === '*') {
      const j = sql.indexOf('*/', i + 2);
      const end = j === -1 ? n : j + 2;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === ';') {
      cur += c;
      const isTrigger = /^\s*CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(cur);
      if (!isTrigger || /\bEND\s*;$/i.test(cur.trim())) {
        if (cur.replace(/;/g, '').trim()) out.push(cur.trim());
        cur = '';
      }
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const origExec = Database.prototype.exec;
Database.prototype.exec = function exec(sql) {
  for (const stmt of splitStatements(String(sql))) {
    origExec.call(this, stmt);
    if (!this.inTransaction) crashPoint(stmt);
  }
  return this;
};

const origPrepare = Database.prototype.prepare;
Database.prototype.prepare = function prepare(sql) {
  const stmt = origPrepare.call(this, sql);
  if (stmt.reader) return stmt; // a read commits nothing
  const db = this;
  const origRun = stmt.run;
  stmt.run = function run(...args) {
    const r = origRun.apply(stmt, args);
    if (!db.inTransaction) crashPoint(sql);
    return r;
  };
  return stmt;
};

const origPragma = Database.prototype.pragma;
Database.prototype.pragma = function pragma(source, options) {
  const r = origPragma.call(this, source, options);
  // A pragma that sets something (`x = y`) may persist (journal_mode, user_version).
  if (/=/.test(String(source)) && !this.inTransaction) crashPoint(`PRAGMA ${source}`);
  return r;
};

const origTransaction = Database.prototype.transaction;
Database.prototype.transaction = function transaction(fn) {
  const db = this;
  const wrapped = origTransaction.call(this, fn);
  const out = function (...args) {
    const r = wrapped.apply(this, args);
    if (!db.inTransaction) crashPoint(`COMMIT (transaction in ${fn.name || 'anonymous fn'})`);
    return r;
  };
  for (const k of ['deferred', 'immediate', 'exclusive']) {
    const variant = wrapped[k];
    out[k] = function (...args) {
      const r = variant.apply(this, args);
      if (!db.inTransaction)
        crashPoint(`COMMIT (${k} transaction in ${fn.name || 'anonymous fn'})`);
      return r;
    };
  }
  out.default = out;
  return out;
};

module.exports = { splitStatements };
