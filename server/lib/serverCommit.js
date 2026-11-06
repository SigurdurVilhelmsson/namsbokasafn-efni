// server/lib/serverCommit.js — the commit of the code this server runs (G1.2 spec §5.12).
//
// Why not HEAD at write time: scripts/deploy.sh (`git pull --rebase origin main`) rebases the content cron's
// commits on top of the pulled code, so HEAD names a commit the code never was. deploy.sh therefore records the
// UPSTREAM commit in pipeline-output/.deployed-commit (scripts/record-deployed-commit.sh); this module reads that
// file once at boot. A restart without deploy.sh has no file and falls back to `git rev-parse HEAD`.
//
// The never-throw git call has the shape of scripts/export-segment-edits.js's resolveMainCommit.
//
// code_dirty compares the working tree with that commit under server/ and tools/lib only (decision 36). It
// cannot see an untracked file, a change elsewhere in the tree, or code edited after boot: it is a flag that
// the stamp may not be the whole truth, never proof that it is.
//
// Tests use makeServerCommitReader on a temporary repository and never the production reader (spec T13): the
// production reader is rooted at the real tree.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SHA = /^[0-9a-f]{40}$/;
const REPO_ROOT = path.join(__dirname, '..', '..');
const DEPLOY_FILE = path.join(REPO_ROOT, 'pipeline-output', '.deployed-commit');
const DIRTY_PATHS = ['server', 'tools/lib'];

function defaultRunGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
  return { status: r.error ? null : r.status, stdout: r.stdout || '' };
}

/**
 * @param {{repoRoot: string, deployFile: string, runGit?: (args: string[], cwd: string) => {status: number|null, stdout?: string}}} opts
 * @returns {{serverCommit: string|null, commitSource: 'deploy-file'|'git-head'|'unknown', codeDirty: 0|1|null}} Never throws.
 */
function computeServerCommit({ repoRoot, deployFile, runGit = defaultRunGit }) {
  try {
    let serverCommit = null;
    let commitSource = 'unknown';
    try {
      const upstream = JSON.parse(fs.readFileSync(deployFile, 'utf8')).upstream;
      if (SHA.test(upstream)) [serverCommit, commitSource] = [upstream, 'deploy-file'];
    } catch {
      // no file, or not JSON: fall back to HEAD below (a restart without deploy.sh)
    }
    if (!serverCommit) {
      const head = runGit(['rev-parse', 'HEAD'], repoRoot);
      const sha = head.status === 0 ? (head.stdout || '').trim() : '';
      if (SHA.test(sha)) [serverCommit, commitSource] = [sha, 'git-head'];
    }
    if (!serverCommit) return { serverCommit: null, commitSource: 'unknown', codeDirty: null };
    const diff = runGit(['diff', '--quiet', serverCommit, '--', ...DIRTY_PATHS], repoRoot);
    const codeDirty = diff.status === 0 ? 0 : diff.status === 1 ? 1 : null;
    return { serverCommit, commitSource, codeDirty };
  } catch {
    return { serverCommit: null, commitSource: 'unknown', codeDirty: null }; // never throws (spec §5.12)
  }
}

/** One memoized reader per root. The production one below is rooted at the real tree: no test calls it (T13). */
function makeServerCommitReader({ repoRoot, deployFile, runGit = defaultRunGit }) {
  let memo = null;
  return { get: () => memo || (memo = computeServerCommit({ repoRoot, deployFile, runGit })) };
}
const production = makeServerCommitReader({ repoRoot: REPO_ROOT, deployFile: DEPLOY_FILE });
let testValue = null;
const getServerCommit = () => testValue || production.get();
/** Test-only: a fixed value, so a test that reaches record() never runs git on the real tree. */
function _setTestServerCommit(v) {
  testValue = v;
}

module.exports = {
  REPO_ROOT,
  DEPLOY_FILE,
  computeServerCommit,
  makeServerCommitReader,
  getServerCommit,
  _setTestServerCommit,
};
