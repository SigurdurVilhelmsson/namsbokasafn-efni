import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The CLI's exit codes are what the runbook gates on — it calls them "a gate,
// not information" and has the operator read ${PIPESTATUS[0]}. decideExitCode
// is pinned as a pure function, but nothing pinned that the CLI CONSUMES it:
// dropping the exit-4 case, or replacing the call with a constant, left the
// whole suite green. These tests pin the wiring.
//
// spawnSync, not execFileSync: execFileSync throws on a non-zero exit, and the
// non-zero codes are exactly what is under test.

const REPO_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'reattach-segment-edits.js');

let tmp, booksDir;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c16-cli-'));
  booksDir = path.join(tmp, 'books');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function writeMt(text) {
  const dir = path.join(booksDir, 'testbook', '02-mt-output', 'ch01');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'm001-segments.is.md'), text);
}

function edit(over = {}) {
  return {
    id: 1,
    book: 'testbook',
    chapter: 1,
    module_id: 'm001',
    segment_id: 'm001:para:fs-id1',
    original_content: 'gamalt',
    edited_content: 'leiðrétt',
    editor_id: 'u1',
    editor_username: 'E',
    status: 'approved',
    category: null,
    editor_note: null,
    reviewer_note: null,
    context: { en: 'English one', mtAtSnapshot: 'gamalt' },
    ...over,
  };
}

function runDryRun(edits) {
  const snap = path.join(tmp, 'snap.json');
  fs.writeFileSync(
    snap,
    JSON.stringify({ schema: 1, book: 'testbook', modules: ['m001'], edits })
  );
  return spawnSync('node', [SCRIPT, '--snapshot', snap], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BOOKS_ROOT_OVERRIDE: booksDir,
      // Pointed at a path that cannot exist: the dry run must never open a DB.
      // This is what makes the "safe to run before the irreversible Step 4a"
      // claim a test rather than a one-off probe.
      SESSIONS_DB_PATH: path.join(tmp, 'nope', 'not-a-database.db'),
    },
  });
}

describe('reattach CLI — the exit codes the runbook gates on', () => {
  it('exits 0 when every row matched', () => {
    writeMt('<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    expect(runDryRun([edit()]).status).toBe(0);
  });

  it('exits 1 when a row is unmatched — expected, and the operator continues by hand', () => {
    writeMt('<!-- SEG:m001:para:OTHER -->\nný vélþýðing\n');
    expect(runDryRun([edit()]).status).toBe(1);
  });

  it('exits 2 when the module is absent from the new extraction', () => {
    fs.mkdirSync(booksDir, { recursive: true });
    expect(runDryRun([edit()]).status).toBe(2);
  });

  it('exits 4 when one editor+segment key carries more than one restorable row', () => {
    writeMt('<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const res = runDryRun([
      edit({ id: 1, status: 'approved', edited_content: 'GÖMUL' }),
      edit({ id: 2, status: 'pending', edited_content: 'NÝRRI' }),
    ]);
    expect(res.status).toBe(4);
  });

  it('names the colliding key on stdout, so the operator can act on it', () => {
    writeMt('<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const res = runDryRun([
      edit({ id: 1, status: 'approved', edited_content: 'GÖMUL' }),
      edit({ id: 2, status: 'pending', edited_content: 'NÝRRI' }),
    ]);
    expect(res.stdout).toContain('testbook/m001/m001:para:fs-id1/u1');
  });

  it('reports the module absent BEFORE anything else — a missing module causes the gap, exit 2 must not be masked by 4', () => {
    fs.mkdirSync(booksDir, { recursive: true });
    const res = runDryRun([
      edit({ id: 1, status: 'approved', edited_content: 'GÖMUL' }),
      edit({ id: 2, status: 'pending', edited_content: 'NÝRRI' }),
    ]);
    expect(res.status).toBe(2);
  });

  it('opens no database — this is what makes the dry run safe to run before the irreversible Step 4a', () => {
    writeMt('<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const res = runDryRun([edit()]);
    // A DB open against the nonexistent path would throw; better-sqlite3 would
    // also CREATE rather than fail on some paths, so assert both.
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(tmp, 'nope'))).toBe(false);
  });

  // The fatal-code check must stop the run BEFORE --db reaches the write path.
  // Dry-run alone cannot see this: `code` is 4 either way there, so dropping 4
  // from the fatal check leaves every dry-run assertion green (measured). The
  // difference is only observable under --db — with the check, exit 4 and no DB
  // is ever opened; without it, the run proceeds, applyReattach refuses, and the
  // operator gets exit 5 off a half-started migration instead of a clean stop.
  it('exits 4 under --db too, refusing BEFORE the write path rather than aborting inside it', () => {
    writeMt('<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const snap = path.join(tmp, 'snap.json');
    fs.writeFileSync(
      snap,
      JSON.stringify({
        schema: 1,
        book: 'testbook',
        modules: ['m001'],
        edits: [
          edit({ id: 1, status: 'approved', edited_content: 'GÖMUL' }),
          edit({ id: 2, status: 'pending', edited_content: 'NÝRRI' }),
        ],
      })
    );
    const res = spawnSync('node', [SCRIPT, '--snapshot', snap, '--db'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BOOKS_ROOT_OVERRIDE: booksDir,
        // Unopenable on purpose: reaching the DB at all is the failure.
        SESSIONS_DB_PATH: path.join(tmp, 'no-such-dir', 'sessions.db'),
      },
    });
    expect(res.status).toBe(4);
  });

  // An aborted --db apply must NOT look like the survivable outcome. Exit 1 is
  // "unmatched rows exist — expected, proceed" in the runbook's gate table; a
  // half-applied one-way migration exiting 1 would have the operator restart
  // the server and tell editors their work is back, with rows missing.
  it('exits 5, not 1, when the --db apply dies part-way — a crashed migration is not "proceed"', () => {
    writeMt('<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const snap = path.join(tmp, 'snap.json');
    fs.writeFileSync(
      snap,
      JSON.stringify({ schema: 1, book: 'testbook', modules: ['m001'], edits: [edit()] })
    );
    const res = spawnSync('node', [SCRIPT, '--snapshot', snap, '--db'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BOOKS_ROOT_OVERRIDE: booksDir,
        // Directory does not exist, so the DB open fails inside the first
        // saveSegmentEdit rather than creating a file.
        SESSIONS_DB_PATH: path.join(tmp, 'no-such-dir', 'sessions.db'),
      },
    });
    expect(res.status).toBe(5);
  });
});
