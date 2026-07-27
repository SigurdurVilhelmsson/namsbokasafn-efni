/**
 * Glossary-export heartbeat health (register C14).
 *
 * server/scripts/export-terminology.js writes
 * pipeline-output/.last-glossary-export only when every book resolved
 * healthily, so staleness is the alarm.
 *
 * WHY THIS EXISTS: the export is meant to run from scripts/git-backup.sh, and
 * that invocation must be deliberately CONTAINED — a failure logs a WARN and
 * lets the content backup proceed, because terminology-DB health must not be
 * able to abort the backup. That containment means a persistent failure
 * would otherwise be invisible: a WARN in a gitignored log nobody reads,
 * while the glossary silently stayed frozen. Cron environments are the
 * likely cause (no repo cron script invoked `node` before this one). This
 * check is where that becomes visible — ./scripts/deploy.sh prints every
 * not-ok check.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { readGlossaryExportHealth, DEFAULT_STALE_HOURS } = require('../lib/glossaryExportHealth');

const H = 3600 * 1000;
const NOW = 1_800_000_000_000; // fixed clock; no Date.now() in assertions

let root;

function heartbeat(ageHours) {
  const p = path.join(root, 'pipeline-output', '.last-glossary-export');
  writeFileSync(p, new Date(NOW - ageHours * H).toISOString() + '\n');
  const t = new Date(NOW - ageHours * H);
  utimesSync(p, t, t);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'glossaryexport-'));
  mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readGlossaryExportHealth', () => {
  it('defaults to a 6 hour threshold (2-hourly cron, two missed cycles + margin)', () => {
    expect(DEFAULT_STALE_HOURS).toBe(6);
  });

  it('is not ok when the heartbeat is missing entirely', () => {
    // The state on any box where the export has never succeeded — including
    // one where cron cannot resolve `node`.
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.age_hours).toBeNull();
  });

  it('is ok when the heartbeat is fresh', () => {
    heartbeat(2);
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.age_hours).toBe(2);
  });

  it('is not ok when the heartbeat is older than the threshold', () => {
    heartbeat(9);
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.age_hours).toBe(9);
  });

  it('honours an explicit staleHours override', () => {
    heartbeat(9);
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW, staleHours: 24 }).ok).toBe(
      true
    );
  });

  it('does not throw when pipeline-output does not exist at all', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'glossaryexport-bare-'));
    try {
      expect(readGlossaryExportHealth({ projectRoot: bare, nowMs: NOW }).ok).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
