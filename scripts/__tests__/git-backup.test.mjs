import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
  existsSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const REAL_SCRIPT = path.join(REPO, 'scripts', 'git-backup.sh');

// git-backup.sh derives PROJECT_ROOT from its own location and cd's there,
// so each test copies the REAL script into <fixture>/scripts/ and runs the
// copy — the fixture IS the project root. (backup-db.test.mjs precedent for
// spawning repo bash scripts; this variant adds the copy step.)

let work; // fixture project root
let bare; // bare origin

function git(args, cwd = work) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function runBackup(expectFailure = false) {
  const script = path.join(work, 'scripts', 'git-backup.sh');
  try {
    const stdout = execFileSync('bash', [script], {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
    });
    return { status: 0, stdout };
  } catch (err) {
    if (!expectFailure) throw err;
    return { status: err.status, stdout: String(err.stdout || '') };
  }
}

function readLog() {
  const p = path.join(work, 'pipeline-output', 'backup.log');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function readStatus() {
  return JSON.parse(readFileSync(path.join(work, 'pipeline-output', 'backup-status.json'), 'utf8'));
}

function heartbeatPath() {
  return path.join(work, 'pipeline-output', '.last-content-backup');
}

// One committed file per pathspec family (matching the production shape) so
// every glob in the script matches. Individual tests then dirty/remove
// families to build their scenario.
const FIXTURE_FILES = {
  'books/prufubok/03-faithful-translation/ch01/m00001-segments.is.md': 'faithful\n',
  'books/prufubok/03-translated/faithful/ch01/m00001.cnxml': '<doc/>\n',
  'books/prufubok/04-localized-content/ch01/m00001-segments.is.md': 'localized\n',
  'books/prufubok/04-localization/notes.md': 'wip\n',
  'books/prufubok/05-publication/faithful/ch01/m00001.html': '<p>html</p>\n',
  'books/prufubok/chapters/ch01/status.json': '{"chapter":1}\n',
  'books/prufubok/translation-errors.json': '[]\n',
  'books/prufubok/residue-report.faithful.json': '[]\n',
  'books/prufubok/02-mt-output/ch01/m00001-segments.locked': 'locked\n',
  'books/prufubok/glossary/glossary-unified.json': '{"terms":[]}\n',
};

beforeEach(() => {
  work = mkdtempSync(path.join(tmpdir(), 'gitbackup-'));
  bare = mkdtempSync(path.join(tmpdir(), 'gitbackup-origin-'));

  execFileSync('git', ['init', '--bare', '--initial-branch=main'], { cwd: bare });
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: work });
  git(['config', 'user.email', 'prufa@example.is']);
  git(['config', 'user.name', 'Prufa']);
  git(['remote', 'add', 'origin', bare]);

  for (const [rel, content] of Object.entries(FIXTURE_FILES)) {
    const abs = path.join(work, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  mkdirSync(path.join(work, 'scripts'), { recursive: true });
  copyFileSync(REAL_SCRIPT, path.join(work, 'scripts', 'git-backup.sh'));
  // Create .gitignore to exclude pipeline-output/
  writeFileSync(path.join(work, '.gitignore'), 'pipeline-output/\n');
  git(['add', '-A']);
  git(['commit', '-m', 'fixture']);
  git(['push', '-u', 'origin', 'main']);
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
});

describe('git-backup.sh per-pattern staging (campaign item 4b)', () => {
  it('happy path: dirty files across pathspecs are committed and pushed, status success', () => {
    writeFileSync(
      path.join(work, 'books/prufubok/03-faithful-translation/ch01/m00001-segments.is.md'),
      'faithful v2\n'
    );
    writeFileSync(path.join(work, 'books/prufubok/chapters/ch01/status.json'), '{"chapter":1,"x":2}\n');

    runBackup();

    expect(readStatus().status).toBe('success');
    expect(git(['log', '-1', '--format=%s'])).toMatch(/^auto-backup: /);
    // pushed: bare origin's main equals local main
    const localHead = git(['rev-parse', 'main']).trim();
    const remoteHead = execFileSync('git', ['rev-parse', 'main'], { cwd: bare, encoding: 'utf8' }).trim();
    expect(remoteHead).toBe(localHead);
  });

  it('THE REGRESSION PIN: one empty glob no longer blocks the other eight', () => {
    // Remove every .locked marker (committed state: the glob now matches nothing)
    git(['rm', '-q', 'books/prufubok/02-mt-output/ch01/m00001-segments.locked']);
    git(['commit', '-q', '-m', 'remove locked markers']);
    git(['push', '-q', 'origin', 'main']);

    // Dirty a DIFFERENT family
    writeFileSync(
      path.join(work, 'books/prufubok/05-publication/faithful/ch01/m00001.html'),
      '<p>html v2</p>\n'
    );

    runBackup();

    // Pre-fix: the unmatched .locked glob 128'd the whole git add → status
    // no_changes and the html edit never left the working tree. Post-fix:
    expect(readStatus().status).toBe('success');
    expect(git(['log', '-1', '--format=%s'])).toMatch(/^auto-backup: /);
    expect(git(['status', '--porcelain'])).toBe('');
    expect(readLog()).toMatch(
      /WARN: pathspec matched nothing \(skipped\): books\/\*\/02-mt-output\/\*\/\*-segments\.locked/
    );
  });

  it('nothing dirty: status no_changes, exit 0', () => {
    runBackup();
    expect(readStatus().status).toBe('no_changes');
  });

  it('real git add failure (index.lock): ERROR logged, status error, exit 1, nothing committed', () => {
    writeFileSync(path.join(work, 'books/prufubok/translation-errors.json'), '["dirty"]\n');
    writeFileSync(path.join(work, '.git', 'index.lock'), '');

    const headBefore = git(['rev-parse', 'HEAD']).trim();
    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(readStatus().status).toBe('error');
    expect(readLog()).toMatch(/ERROR: git add failed for pathspec: /);
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(headBefore);
    expect(existsSync(heartbeatPath())).toBe(false);
  });
});

describe('git-backup.sh content-backup heartbeat (register C11(b))', () => {
  it('writes the heartbeat after a successful push', () => {
    writeFileSync(path.join(work, 'books/prufubok/chapters/ch01/status.json'), '{"chapter":1,"x":3}\n');

    runBackup();

    expect(readStatus().status).toBe('success');
    expect(existsSync(heartbeatPath())).toBe(true);
    expect(readFileSync(heartbeatPath(), 'utf8')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m);
  });

  it('writes the heartbeat when there was nothing to commit', () => {
    // THE FALSE-ALARM GUARD. A quiet weekend is a HEALTHY cron, not a dead
    // one. If the heartbeat tracked commits rather than healthy runs,
    // /api/health would declare the content backup broken every time the
    // editors took two days off — and the alarm would be ignored thereafter.
    runBackup();

    expect(readStatus().status).toBe('no_changes');
    expect(existsSync(heartbeatPath())).toBe(true);
  });

  it('leaves an existing heartbeat UNTOUCHED when the push fails', () => {
    // Pre-create with an old mtime. Without this the assertion would pass
    // trivially, because on a failing run the file never existed at all.
    mkdirSync(path.join(work, 'pipeline-output'), { recursive: true });
    writeFileSync(heartbeatPath(), '2020-01-01T00:00:00Z\n');
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(heartbeatPath(), old, old);
    const beforeMs = statSync(heartbeatPath()).mtimeMs;

    // Unreachable remote: the push fails, and so does the diagnostic fetch,
    // which also exercises the "counts omitted" fallback.
    git(['remote', 'set-url', 'origin', path.join(work, 'no-such-remote')]);
    writeFileSync(path.join(work, 'books/prufubok/chapters/ch01/status.json'), '{"chapter":1,"x":4}\n');

    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(readStatus().status).toBe('error');
    expect(readStatus().message).toBe('git push failed');
    expect(statSync(heartbeatPath()).mtimeMs).toBe(beforeMs);
  });

  it('reports ahead/behind when the push is rejected as non-fast-forward', () => {
    // Diverge the remote behind this checkout's back, exactly as a dev
    // pushing to main would. The cron never fetches before pushing (see the
    // script's comment for why a rebase there would be worse), so this is a
    // live failure mode, not a hypothetical one.
    const other = mkdtempSync(path.join(tmpdir(), 'gitbackup-other-'));
    execFileSync('git', ['clone', '--quiet', bare, other]);
    execFileSync('git', ['config', 'user.email', 'annar@example.is'], { cwd: other });
    execFileSync('git', ['config', 'user.name', 'Annar'], { cwd: other });
    writeFileSync(path.join(other, 'other.txt'), 'from elsewhere\n');
    execFileSync('git', ['add', '-A'], { cwd: other });
    execFileSync('git', ['commit', '--quiet', '-m', 'other side'], { cwd: other });
    execFileSync('git', ['push', '--quiet', 'origin', 'main'], { cwd: other });
    rmSync(other, { recursive: true, force: true });

    writeFileSync(path.join(work, 'books/prufubok/chapters/ch01/status.json'), '{"chapter":1,"x":5}\n');

    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(readStatus().message).toMatch(/local ahead 1, behind 1/);
    expect(readLog()).toMatch(/ERROR: git push failed \(local ahead 1, behind 1\)/);
  });

  it('does NOT clear the alarm on a quiet run while a prior push is still unpushed', () => {
    // THE FALSE-CLEAR PIN. Content changes are far sparser than the 2-hourly
    // cron, so most runs take the nothing-to-commit path. Without the
    // unpushed-backlog check, the sequence below refreshes the heartbeat two
    // hours after a rejected push — before the 6 h threshold can ever fire —
    // and /api/health reports the content backup healthy while reviewed
    // translations sit only on production's disk. That non-fast-forward case
    // is the register's primary detection target, not a corner case.

    // 1. Diverge the remote, so this run's push is rejected and a local
    //    auto-backup commit is left stranded.
    const other = mkdtempSync(path.join(tmpdir(), 'gitbackup-other-'));
    execFileSync('git', ['clone', '--quiet', bare, other]);
    execFileSync('git', ['config', 'user.email', 'annar@example.is'], { cwd: other });
    execFileSync('git', ['config', 'user.name', 'Annar'], { cwd: other });
    writeFileSync(path.join(other, 'other.txt'), 'from elsewhere\n');
    execFileSync('git', ['add', '-A'], { cwd: other });
    execFileSync('git', ['commit', '--quiet', '-m', 'other side'], { cwd: other });
    execFileSync('git', ['push', '--quiet', 'origin', 'main'], { cwd: other });
    rmSync(other, { recursive: true, force: true });

    writeFileSync(path.join(work, 'books/prufubok/chapters/ch01/status.json'), '{"chapter":1,"x":6}\n');
    expect(runBackup(true).status).toBe(1);
    expect(existsSync(heartbeatPath())).toBe(false);

    // 2. The next cycle: nothing new to commit, but the stranded commit is
    //    still unpushed. This must NOT read as healthy.
    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(existsSync(heartbeatPath())).toBe(false);
    expect(readStatus().status).toBe('error');
    expect(readStatus().message).toMatch(/unpushed backlog: 1 commit/);
    expect(readLog()).toMatch(/ERROR: unpushed backlog: 1 commit/);
  });

  it('treats an undeterminable backlog as unhealthy, not as healthy', () => {
    // If refs/remotes/origin/main is missing, the backlog count cannot be
    // computed. The design's thesis is that absence is the alarm, so an
    // indeterminate signal must fail loud rather than silently pass — the
    // opposite choice would reintroduce the false-clear through the one path
    // where the script cannot see what it is asserting.
    git(['update-ref', '-d', 'refs/remotes/origin/main']);

    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(existsSync(heartbeatPath())).toBe(false);
    expect(readStatus().status).toBe('error');
    expect(readStatus().message).toMatch(/could not determine/i);
  });

  it('does NOT write the heartbeat when the commit itself fails', () => {
    // A failing pre-commit hook is a deterministic way to make `git commit`
    // fail *after* staging succeeds — isolates the commit-failure branch
    // from the add-failure branch above (which never reaches `git commit`
    // at all).
    writeFileSync(path.join(work, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    writeFileSync(path.join(work, 'books/prufubok/translation-errors.json'), '["dirty"]\n');

    const headBefore = git(['rev-parse', 'HEAD']).trim();
    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(readStatus().status).toBe('error');
    expect(readLog()).toMatch(/ERROR: git commit failed/);
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(headBefore);
    expect(existsSync(heartbeatPath())).toBe(false);
  });

  it('does NOT write the heartbeat when PROJECT_ROOT is not a git repository', () => {
    rmSync(path.join(work, '.git'), { recursive: true, force: true });

    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(readStatus().status).toBe('error');
    expect(readLog()).toMatch(/ERROR: Not a git repository/);
    expect(existsSync(heartbeatPath())).toBe(false);
  });
});

describe('git-backup.sh glossary export (register C14)', () => {
  it('stages a changed books/*/glossary/ file', () => {
    // Without this pathspec the export writes to production's disk and never
    // reaches the dev checkout where api-translate.js primes MT — which is
    // why wiring the runner alone would have delivered nothing.
    writeFileSync(
      path.join(work, 'books/prufubok/glossary/glossary-unified.json'),
      '{"terms":[{"english":"water","icelandic":"vatn","status":"approved"}]}\n'
    );
    const { status } = runBackup();
    expect(status).toBe(0);
    expect(readStatus().status).toBe('success');
    expect(git(['show', '--stat', '--name-only', 'HEAD'])).toMatch(
      /books\/prufubok\/glossary\/glossary-unified\.json/
    );
  });

  it('a FAILING export does not abort the content backup', () => {
    // The fixture has no server/scripts/export-terminology.js, so node exits
    // non-zero. git-backup.sh is `set -euo pipefail` and its heartbeat is the
    // C11(b) content-backup alarm — a terminology-DB problem must never be
    // able to take that down. Containment is asserted behaviourally here, not
    // as a text pin, because only running it proves the trap actually holds.
    writeFileSync(
      path.join(work, 'books/prufubok/chapters/ch01/status.json'),
      '{"chapter":1,"x":3}\n'
    );
    const { status } = runBackup();
    expect(status).toBe(0);
    expect(readStatus().status).toBe('success');
    expect(existsSync(heartbeatPath())).toBe(true);
    expect(readLog()).toMatch(/WARN: glossary export failed/);
  });

  it('invokes the exporter before staging, so a fresh export rides the same commit', () => {
    // Stand in a fake exporter that writes the glossary file, proving the
    // call happens BEFORE `git add` rather than after it.
    mkdirSync(path.join(work, 'server', 'scripts'), { recursive: true });
    writeFileSync(
      path.join(work, 'server', 'scripts', 'export-terminology.js'),
      [
        "const fs = require('fs');",
        "const path = require('path');",
        "const p = path.join(__dirname, '..', '..', 'books', 'prufubok', 'glossary', 'glossary-unified.json');",
        'fs.writeFileSync(p, JSON.stringify({ terms: [{ english: "acid", icelandic: "syra", status: "approved" }] }) + "\\n");',
      ].join('\n')
    );
    const { status } = runBackup();
    expect(status).toBe(0);
    // ⚠️ Asserting the PATH alone is not enough, and neither is exit 0. The
    // fixture already commits this path in beforeEach, and a run where the
    // export never happened stages nothing, takes the `no_changes` branch,
    // and still exits 0 — so a `--name-only` regex would match either way.
    // These two assertions are what actually separate "ran before staging"
    // from "never ran": `no_changes` never yields status `success`, and only
    // a real export puts the fake's distinguishing value into the commit.
    expect(readStatus().status).toBe('success');
    expect(git(['show', 'HEAD:books/prufubok/glossary/glossary-unified.json'])).toMatch(/syra/);
  });
});
