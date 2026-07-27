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
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');

const SCRIPTS = ['scripts/git-backup.sh', 'scripts/deploy.sh'];

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
});
