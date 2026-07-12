# git-backup.sh Atomic-Add Hardening Implementation Plan (Campaign Item 4b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the content-backup cron's all-or-nothing `git add … || true` with a per-pattern staging loop (warn-and-skip empty globs, fail loud on real errors), test-pinned against a temp-repo fixture — per `docs/plans/2026-07-12-git-backup-atomic-add-design.md` (D1–D5).

**Architecture:** `scripts/git-backup.sh` gets a `PATHSPECS` bash array + `compgen -G` loop; unmatched glob → WARN log + skip; matched-but-failing `git add` → ERROR + `write_status "error"` + exit 1. Tests spawn a COPY of the script inside a temp git repo (the script derives `PROJECT_ROOT` from its own location) with a bare `origin`, per the `backup-db.test.mjs` harness precedent.

**Tech Stack:** bash (`set -euo pipefail`), git, Vitest `scripts` project (`scripts/__tests__/*.test.mjs`, node APIs only).

## Global Constraints

- Branch `fix/git-backup-atomic-add` (off `main` @ `d7f3e39f`); one PR. Gate: `npm test` from repo root (baseline **2454** green). Commit messages end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- The nine pathspecs are UNCHANGED in content and order (design D4): `books/*/03-faithful-translation/`, `books/*/03-translated/`, `books/*/04-localized-content/`, `books/*/04-localization/`, `books/*/05-publication/`, `books/*/chapters/`, `books/*/translation-errors.json`, `books/*/residue-report.*.json`, `books/*/02-mt-output/*/*-segments.locked`.
- Unmatched glob is a WARN + skip, never an error (design D2); real `git add` failure → ERROR log + `write_status "error" …` + exit 1 (design D3). Stderr suppression (`2>/dev/null`) removed entirely.
- Log-line formats (tests grep them verbatim): `WARN: pathspec matched nothing (skipped): <pathspec>` and `ERROR: git add failed for pathspec: <pathspec>`.
- No behavior change to the no-changes short-circuit, commit, push, or status writes (design D4). The lines-68-79 invariant comment is REPLACED (the invariant no longer exists).
- `set -euo pipefail` is active: every command that may fail inside the loop must sit in an `if`/`!` so the script doesn't abort mid-loop.

---

### Task 1: Per-pattern staging loop + fixture tests

**Files:**
- Modify: `scripts/git-backup.sh:62-90` (the comment block + the shared `git add`)
- Create: `scripts/__tests__/git-backup.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: the two verbatim log-line formats above, and the existing `backup-status.json` statuses (`success`, `no_changes`, `error`) — Task 2's docs reference them.

- [ ] **Step 1: Write the failing tests**

Create `scripts/__tests__/git-backup.test.mjs`:

```js
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
```

- [ ] **Step 2: Run tests to verify the two RED cases fail for the right reason**

Run: `npx vitest run scripts/__tests__/git-backup.test.mjs`
Expected: the regression pin FAILS (current script: unmatched `.locked` glob → whole add no-ops → status `no_changes`, no `WARN` line) and the index.lock case FAILS (current script: suppressed add failure → `no_changes`, exit 0). Happy-path and nothing-dirty cases PASS against the current script (all globs match in the fixture). If the regression pin unexpectedly PASSES, STOP — the fixture didn't reproduce the unmatched-glob state; do not weaken the assertions.

- [ ] **Step 3: Implement the loop**

In `scripts/git-backup.sh`, replace lines 62-90 (the whole invariant comment + the shared `git add … || true`) with:

```bash
# Stage content directories under books/, one pathspec at a time.
# translation-errors.json and residue-report.<track>.json are regenerated on
# every inject, so they are always dirty on the production server after a
# "Vista + Birta"; stage them here so they ride along with the backup commit
# instead of snagging the next `git pull`.
#
# Per-pattern staging (campaign item 4b): an unmatched glob is a legitimate
# state (fresh deploy without residue reports; every .locked marker
# reverted) — it logs a WARN and is skipped, and can no longer take the
# other pathspecs down with it (the old shared `git add … || true` exited
# 128 for the WHOLE command on one unmatched glob, silently staging
# nothing). A real `git add` failure (index lock, permissions) fails the
# run loudly instead of being suppressed.
PATHSPECS=(
  'books/*/03-faithful-translation/'
  'books/*/03-translated/'
  'books/*/04-localized-content/'
  'books/*/04-localization/'
  'books/*/05-publication/'
  'books/*/chapters/'
  'books/*/translation-errors.json'
  'books/*/residue-report.*.json'
  'books/*/02-mt-output/*/*-segments.locked'
)

ADD_FAILURES=0
for pathspec in "${PATHSPECS[@]}"; do
  if compgen -G "$pathspec" > /dev/null; then
    # shellcheck disable=SC2086 # the glob must expand into git's arguments
    if ! git add -- $pathspec; then
      log "ERROR: git add failed for pathspec: $pathspec"
      ADD_FAILURES=$((ADD_FAILURES + 1))
    fi
  else
    log "WARN: pathspec matched nothing (skipped): $pathspec"
  fi
done

if [ "$ADD_FAILURES" -gt 0 ]; then
  log "ERROR: ${ADD_FAILURES} pathspec(s) failed to stage — aborting backup run"
  write_status "error" "git add failed for ${ADD_FAILURES} pathspec(s)"
  exit 1
fi
```

Also update the header comment's "What gets backed up" block ONLY if it references the old invariant (it lists the paths — leave the list; there is no invariant sentence there). Verify empirically during implementation that `compgen -G 'books/*/chapters/'` (trailing slash) matches directories in bash — it does in bash ≥4, but if the fixture proves otherwise, test existence with the trailing slash stripped (`"${pathspec%/}"`) while passing the ORIGINAL pathspec to `git add`; note which variant shipped in your report.

- [ ] **Step 4: Run the full test file**

Run: `npx vitest run scripts/__tests__/git-backup.test.mjs`
Expected: 4/4 PASS.

- [ ] **Step 5: Syntax-check and commit**

Run: `bash -n scripts/git-backup.sh`
Expected: no output (parse-clean).

```bash
git add scripts/git-backup.sh scripts/__tests__/git-backup.test.mjs
git commit -m "fix(backup): per-pattern staging — one empty glob no longer silently stops the content backup (item 4b)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Full gate + docs

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 4b → shipped)

- [ ] **Step 1:** `npm test` from repo root → ALL PASS (≥ 2454 + 4 new). Fix anything red first.
- [ ] **Step 2:** Campaign doc item 4b → shipped summary (per-pattern staging, WARN/skip vs ERROR/exit-1 split, the four fixture tests, the regression pin). Add any execution findings as amendments to `docs/plans/2026-07-12-git-backup-atomic-add-design.md` (new §6) only if something deviated — this plan expects none.
- [ ] **Step 3:** Commit docs (with trailer); hand off to the finishing skill (PR off `main`, title `fix(backup): git-backup.sh per-pattern staging — empty glob no longer silently no-ops the content backup (item 4b)`).
