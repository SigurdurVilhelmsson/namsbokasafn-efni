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
    expect(statSync(heartbeatPath()).mtimeMs).toBe(beforeMs);
  });
});
