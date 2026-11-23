/**
 * Syntax-check the shell scripts that run unattended on production.
 *
 * git-backup.sh runs from cron every 2 hours and deploy.sh is run by hand
 * for every release; neither is exercised by any other automated check, so a
 * quoting mistake in an embedded `node -e` block would otherwise surface as
 * a broken deploy rather than a red suite.
 *
 * `bash -n` parses without executing — safe for scripts that touch git,
 * systemd and the network.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');

const SCRIPTS = [
  'scripts/git-backup.sh',
  'scripts/deploy.sh',
  'scripts/record-deployed-commit.sh',
  'scripts/research-backup.sh',
  'scripts/verify-research-backup.sh',
];

describe('production shell scripts parse', () => {
  it.each(SCRIPTS)('%s has no syntax errors', (rel) => {
    expect(() =>
      execFileSync('bash', ['-n', path.join(REPO, rel)], { encoding: 'utf8' })
    ).not.toThrow();
  });

  it('deploy.sh prints the health verdict instead of discarding it', () => {
    // The regression this guards: `curl -sf ... > /dev/null` made every
    // health check invisible, including the off-box backup one that had
    // shipped months earlier. Nothing else polls /api/health.
    const src = readFileSync(path.join(REPO, 'scripts', 'deploy.sh'), 'utf8');
    expect(src).toMatch(/api\/health/);
    expect(src).not.toMatch(/curl -sf http:\/\/localhost:3000\/api\/health > \/dev\/null/);
  });

  it('deploy.sh records the deployed commit after its fetch and rebase and before the stash pop (G1.2, spec §5.12)', () => {
    // Since §C254 D4 the fetch comes first (before the stash) and step 3 rebases onto FETCH_HEAD. The
    // record reads FETCH_HEAD and HEAD, so it must follow the rebase too: above it, `head` would be the
    // pre-deploy commit.
    const src = readFileSync(path.join(REPO, 'scripts', 'deploy.sh'), 'utf8');
    const fetch = src.indexOf('git fetch origin main');
    const rebase = src.indexOf('git rebase FETCH_HEAD');
    const record = src.indexOf(
      'record-deployed-commit.sh FETCH_HEAD pipeline-output/.deployed-commit'
    );
    // step 4's pop (the EXIT trap, set in step 2, carries its own `git stash pop` for a failed run)
    const pop = src.indexOf('git stash pop', src.indexOf('\n# 4. '));
    expect([fetch > -1, rebase > fetch, record > rebase, pop > record]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    // never fails the deploy: the call carries its own fallback
    expect(src.slice(record, src.indexOf('\n', record))).toMatch(/\|\|/);
  });

  // Cron runs these by path; every other test runs them through `bash <script>`, so only this sees a lost bit.
  const CRON_RUN = ['scripts/research-backup.sh', 'scripts/verify-research-backup.sh'];
  it.each(CRON_RUN)('%s is executable', (rel) => {
    expect(statSync(path.join(REPO, rel)).mode & 0o111).not.toBe(0);
  });
  it('control: the mode check can fail', () => {
    expect(
      statSync(path.join(REPO, 'scripts', '__tests__', 'shell-syntax.test.mjs')).mode & 0o111
    ).toBe(0);
  });

  it('research-backup.sh writes no file itself and never names the editorial remote (decisions 2, 26)', () => {
    const src = readFileSync(path.join(REPO, 'scripts', 'research-backup.sh'), 'utf8');
    const code = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/pipeline-output/);
    expect(code).not.toMatch(/\bBACKUP_REMOTE\b/);
    expect(code).toMatch(/RESEARCH_REMOTE/); // control: the script is read
  });
});

/**
 * Register §C254 follow-up. Bash reads a running script from the file as it goes, so when deploy.sh's own pull
 * rewrites it, the rest of that run executes the NEW file from the OLD byte offset (seen on prod 2026-11-23 20:34Z:
 * `./scripts/deploy.sh: line 192: terms:: command not found`). Wrapping the whole body in a function that the last
 * line calls (`main() { … }; main "$@"; exit $?`) makes bash parse every line before anything runs.
 */
describe('deploy.sh is safe against its own pull rewriting it (register §C254 follow-up)', () => {
  // A script that rewrites itself in place midway, as deploy.sh's pull did, with the new content's extra lines
  // placed past the old script's length so that only a read from the old offset can reach them.
  function runSelfRewriting(body) {
    const dir = mkdtempSync(path.join(tmpdir(), 'self-rewrite-'));
    const script = path.join(dir, 'run.sh');
    const next = path.join(dir, 'next.sh');
    writeFileSync(script, body);
    writeFileSync(next, '#'.repeat(body.length) + '\necho NEW-FILE-CODE-RAN\n');
    const r = spawnSync('bash', [script], {
      encoding: 'utf8',
      env: { ...process.env, NEXT: next },
    });
    rmSync(dir, { recursive: true, force: true });
    return r;
  }

  it('CONTROL: an unwrapped script that rewrites itself runs code from the new file', () => {
    const r = runSelfRewriting(
      '#!/bin/bash\nset -euo pipefail\necho before\ncat "$NEXT" > "$0"\necho after\n'
    );
    expect(r.stdout).toMatch(/NEW-FILE-CODE-RAN/);
  });

  it('the main() wrapper keeps a self-rewriting script on the code it started with', () => {
    const r = runSelfRewriting(
      '#!/bin/bash\nset -euo pipefail\nmain() {\necho before\ncat "$NEXT" > "$0"\necho after\n}\nmain "$@"; exit $?\n'
    );
    expect(r.stdout).toBe('before\nafter\n');
    expect(r.status).toBe(0);
  });

  it('deploy.sh has that shape: only comments, blanks and `set` before `main() {`, and the last line runs it', () => {
    const lines = readFileSync(path.join(REPO, 'scripts', 'deploy.sh'), 'utf8')
      .trimEnd()
      .split('\n');
    const open = lines.indexOf('main() {');
    const before = lines.slice(0, Math.max(open, 0));
    const strayBefore = before.filter((l) => !/^\s*(#.*)?$/.test(l) && l !== 'set -euo pipefail');
    expect({ hasMain: open > -1, strayBefore, last: lines.at(-1), closer: lines.at(-2) }).toEqual({
      hasMain: true,
      strayBefore: [],
      last: 'main "$@"; exit $?',
      closer: '}',
    });
  });
});
