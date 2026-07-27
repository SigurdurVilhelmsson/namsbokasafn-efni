/**
 * There is ONE deploy path, and it never hard-resets production.
 *
 * WHY THIS EXISTS (register C11(c)): deploy.yml carried its own inline SSH
 * script that ran `git reset --hard origin/main` on the production server.
 * Combined with a content-backup cron whose push failures were silent, that
 * could discard reviewed translations that existed only on prod's disk.
 *
 * It had also drifted from the script people actually run: it restarted
 * `namsbokasafn-efni` (the live unit is `ritstjorn`), defaulted to
 * /opt/namsbokasafn-efni (prod is under /home/siggi/repos), and duplicated
 * the DB-backup and health-gate steps. It had never run — 0 runs, 0 repo
 * secrets, no `production` environment — so the divergence was invisible.
 *
 * The fix was to delegate to scripts/deploy.sh, which backs up the DB,
 * pins Node to the systemd runtime's ABI, and stashes and re-applies local
 * editorial changes instead of discarding them. This pins that shape.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEPLOY_YML = path.join(REPO_ROOT, '.github', 'workflows', 'deploy.yml');

describe('deploy.yml delegates to the one deploy script (C11(c))', () => {
  const yml = fs.readFileSync(DEPLOY_YML, 'utf8');

  it('reads a non-empty deploy.yml (guard against a vacuous pass)', () => {
    // Without this, a renamed or deleted workflow would make every
    // `not.toMatch` below pass by asserting nothing.
    expect(yml.length).toBeGreaterThan(200);
    expect(yml).toMatch(/appleboy\/ssh-action/);
  });

  it('never hard-resets the production working tree', () => {
    expect(yml).not.toMatch(/git\s+reset\s+--hard/);
  });

  it('calls scripts/deploy.sh instead of duplicating its steps', () => {
    expect(yml).toMatch(/\.\/scripts\/deploy\.sh/);
  });

  it('does not name a systemd unit — deploy.sh owns that', () => {
    expect(yml).not.toMatch(/systemctl/);
  });

  it('does not duplicate the DB backup — deploy.sh does it first', () => {
    expect(yml).not.toMatch(/sessions-\$/);
  });
});
