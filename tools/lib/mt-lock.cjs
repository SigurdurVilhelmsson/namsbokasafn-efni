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

module.exports = { mtLockPathFor, isMtLocked, writeMtLock };
