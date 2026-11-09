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
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
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

  it('deploy.sh records the deployed commit after its pull and before the stash pop (G1.2, spec §5.12)', () => {
    const src = readFileSync(path.join(REPO, 'scripts', 'deploy.sh'), 'utf8');
    const pull = src.indexOf('git pull --rebase origin main');
    const record = src.indexOf(
      'record-deployed-commit.sh FETCH_HEAD pipeline-output/.deployed-commit'
    );
    const pop = src.indexOf('git stash pop');
    expect([pull > -1, record > pull, pop > record]).toEqual([true, true, true]);
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
