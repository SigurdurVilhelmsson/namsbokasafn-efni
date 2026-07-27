/**
 * Content-backup heartbeat health (register C11(b)).
 *
 * scripts/git-backup.sh writes pipeline-output/.last-content-backup on every
 * HEALTHY run — including "nothing to commit" — and never on a failure. So a
 * stale or absent heartbeat means reviewed translations have stopped
 * reaching GitHub, which was previously invisible: backup-status.json is
 * written on every outcome and was read by nothing.
 *
 * `ok` is driven by the heartbeat ALONE. backup-status.json is hand-built
 * JSON from a shell heredoc and is surfaced as detail only, so a malformed
 * one can never gate the health endpoint or throw inside it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { readContentBackupHealth, DEFAULT_STALE_HOURS } = require('../lib/contentBackupHealth');

const H = 3600 * 1000;
const NOW = 1_800_000_000_000; // fixed clock; no Date.now() in assertions

let root;

/** Write the heartbeat with an mtime `ageHours` in the past. */
function heartbeat(ageHours) {
  const p = path.join(root, 'pipeline-output', '.last-content-backup');
  writeFileSync(p, new Date(NOW - ageHours * H).toISOString() + '\n');
  const t = new Date(NOW - ageHours * H);
  utimesSync(p, t, t);
}

function statusFile(contents) {
  writeFileSync(path.join(root, 'pipeline-output', 'backup-status.json'), contents);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'contentbackup-'));
  mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readContentBackupHealth', () => {
  it('defaults to a 6 hour threshold (2-hourly cron, two missed cycles + margin)', () => {
    expect(DEFAULT_STALE_HOURS).toBe(6);
  });

  it('is not ok when the heartbeat is missing entirely', () => {
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.age_hours).toBeNull();
  });

  it('is ok when the heartbeat is fresh', () => {
    heartbeat(2);
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.age_hours).toBe(2);
  });

  it('is not ok when the heartbeat is older than the threshold', () => {
    heartbeat(9);
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.age_hours).toBe(9);
  });

  it('honours an explicit staleHours override', () => {
    heartbeat(9);
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW, staleHours: 24 });
    expect(r.ok).toBe(true);
  });

  it('surfaces last_status and message from a valid status file', () => {
    heartbeat(1);
    statusFile('{"timestamp":"x","status":"success","message":"Pushed a1b2c3d"}');
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.last_status).toBe('success');
    expect(r.message).toBe('Pushed a1b2c3d');
  });

  it('reports last_status null when the status file is absent', () => {
    heartbeat(1);
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.last_status).toBeNull();
    expect(r.ok).toBe(true);
  });

  it('tolerates a MALFORMED status file: no throw, ok still driven by the heartbeat', () => {
    // git-backup.sh builds this JSON by hand in a heredoc. A partial write or
    // a hand-edit must degrade the detail, never the verdict and never the
    // health endpoint.
    heartbeat(1);
    statusFile('{"status": "error", "message": "he said "hi" and broke it"}');
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.last_status).toBeNull();
    expect(r.ok).toBe(true);
  });

  it('does not let an error status override a fresh heartbeat', () => {
    // A transient failure self-heals within one 2h cycle. Staleness is the
    // gate; a single failed run must not page anyone.
    heartbeat(1);
    statusFile('{"status":"error","message":"git push failed (local ahead 1, behind 1)"}');
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.last_status).toBe('error');
    expect(r.ok).toBe(true);
  });
});
