'use strict';
// Per-module MT edit-lock marker. Keyed off the mtOutput file path so both the
// server (getModulePaths().mtOutput) and the CLI (its outputPath) — which already
// hold that path — share one convention with zero chapter-dir duplication.
const fs = require('fs');
const path = require('path');

/** Derive the .locked sibling: .../{module}-segments.is.md -> .../{module}-segments.locked */
function mtLockPathFor(mtOutputPath) {
  return mtOutputPath.replace(/-segments\.is\.md$/, '-segments.locked');
}

/** True if a marker exists. Fail-safe: an existing-but-unreadable marker => locked. */
function isMtLocked(mtOutputPath) {
  const lock = mtLockPathFor(mtOutputPath);
  if (!fs.existsSync(lock)) return false;
  try {
    JSON.parse(fs.readFileSync(lock, 'utf8'));
    return true;
  } catch {
    return true; // indeterminate -> treat as locked (never clobber an edited baseline)
  }
}

/** Idempotently write the marker (no-op if it already exists). */
function writeMtLock(mtOutputPath, meta) {
  const lock = mtLockPathFor(mtOutputPath);
  if (fs.existsSync(lock)) return;
  fs.mkdirSync(path.dirname(lock), { recursive: true }); // chapter dir may not exist yet
  const body = JSON.stringify({ lockedAt: new Date().toISOString(), ...meta }, null, 2);
  fs.writeFileSync(lock, body + '\n', 'utf8');
}

// --- G1.7 freeze marker -----------------------------------------------------
// See docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md §6.2.
// The freeze marker is content-free and carries NO time: a marker written by the
// editing path holds a person's first-save time (`lockedAt`), and the freeze must
// never read out, log or return another marker's body. Identity is therefore a
// byte comparison with this constant, and every non-matching marker is "foreign".
const FREEZE_LOCK_BODY = JSON.stringify({ reason: 'freeze' }, null, 2) + '\n';

/** 'absent' | 'freeze' (bytes identical to FREEZE_LOCK_BODY) | 'foreign' (anything else, incl. unreadable). */
function freezeLockState(mtOutputPath) {
  const lock = mtLockPathFor(mtOutputPath);
  if (!fs.existsSync(lock)) return 'absent';
  try {
    return fs.readFileSync(lock, 'utf8') === FREEZE_LOCK_BODY ? 'freeze' : 'foreign';
  } catch {
    return 'foreign';
  }
}

/**
 * Write the freeze marker if absent. Returns 'written' or 'already'; throws
 * FOREIGN_LOCK (message names the marker path only, never its body) otherwise.
 * The write is an exclusive create ('wx'): a marker that appears between the state
 * check and the write (a first save on the editing path) is re-read, never overwritten.
 */
function writeFreezeLock(mtOutputPath) {
  const lock = mtLockPathFor(mtOutputPath);
  const foreign = () => {
    const err = new Error(`foreign MT lock marker present: ${lock}`);
    err.code = 'FOREIGN_LOCK';
    return err;
  };
  const state = freezeLockState(mtOutputPath);
  if (state === 'freeze') return 'already';
  if (state === 'foreign') throw foreign();
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  try {
    fs.writeFileSync(lock, FREEZE_LOCK_BODY, { encoding: 'utf8', flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if (freezeLockState(mtOutputPath) === 'freeze') return 'already';
    throw foreign();
  }
  return 'written';
}

module.exports = {
  mtLockPathFor,
  isMtLocked,
  writeMtLock,
  FREEZE_LOCK_BODY,
  freezeLockState,
  writeFreezeLock,
};
