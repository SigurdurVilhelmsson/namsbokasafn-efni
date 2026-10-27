/**
 * provenance.js — git checks a paid AI run makes before it spends anything, and the apply
 * step makes before it writes layer 2.
 *
 * Design: docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md ("The glue", CLI).
 *
 * - `filesAtCommitProblems`: the working-tree bytes of each input equal its blob at a named
 *   commit. This is what makes `layer1Commit` in a revision TRUE (the register's owed
 *   item 2): the run reads the working tree, and the record names a commit, so the two must
 *   be proven equal, file by file, by git's own blob hash.
 * - `cleanTrackedProblems`: the files a record cites by sha256 (the prompt, the ruling set,
 *   the code) are tracked and unmodified, so the commit the record names describes them.
 *
 * `git` is a function (args → stdout) so tests can point it at a throwaway repository.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SHA1_RE = /^[0-9a-f]{40}$/;

/**
 * Git's blob id of some bytes (what `git hash-object` prints).
 * @param {Buffer} buf
 * @returns {string}
 */
export function gitBlobSha1(buf) {
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

/**
 * A git runner bound to a directory.
 * @param {{ cwd: string, exec?: typeof execFileSync }} opts
 * @returns {(args: string[]) => string} stdout
 */
export function makeGit({ cwd, exec = execFileSync }) {
  return (args) =>
    String(
      exec('git', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
}

/**
 * The full sha of the commit `ref` names; refuses anything else.
 * @param {(args: string[]) => string} git
 * @param {string} ref
 * @returns {string}
 */
export function resolveCommit(git, ref) {
  if (typeof ref !== 'string' || ref === '' || ref.startsWith('-')) {
    throw new Error(`provenance: not a ref: ${JSON.stringify(ref)}`);
  }
  let out;
  try {
    out = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(`provenance: ${ref} names no commit in this repository`);
  }
  if (!SHA1_RE.test(out)) throw new Error(`provenance: ${ref} names no commit in this repository`);
  return out;
}

/**
 * Every blob under `dir` (repo-relative) at `commit`, as path → blob sha1.
 * @param {(args: string[]) => string} git
 * @param {string} commit
 * @param {string} dir
 * @returns {Map<string, string>}
 */
export function lsTreeBlobs(git, commit, dir) {
  const out = git(['ls-tree', '-r', '-z', '--full-tree', commit, '--', dir]);
  const map = new Map();
  for (const entry of out.split('\0')) {
    if (entry === '') continue;
    const tab = entry.indexOf('\t');
    const [, type, sha] = entry.slice(0, tab).split(' ');
    if (type === 'blob') map.set(entry.slice(tab + 1), sha);
  }
  return map;
}

function assertRepoRelative(file) {
  if (
    typeof file !== 'string' ||
    file === '' ||
    path.isAbsolute(file) ||
    path.normalize(file).split(path.sep)[0] === '..'
  ) {
    throw new Error(`provenance: a file must be a repo-relative path, got ${JSON.stringify(file)}`);
  }
  return file.split(path.sep).join('/');
}

/**
 * The files whose working-tree bytes are not exactly their blob at `commit` (empty = all
 * equal). One `ls-tree` per distinct directory.
 * @param {{ git: (args: string[]) => string, repoRoot: string, commit: string, files: string[] }} args
 * @returns {string[]} one problem per file
 */
export function filesAtCommitProblems({ git, repoRoot, commit, files }) {
  const rel = files.map(assertRepoRelative);
  const trees = new Map();
  const problems = [];
  for (const f of rel) {
    const dir = path.posix.dirname(f);
    if (!trees.has(dir)) trees.set(dir, lsTreeBlobs(git, commit, dir));
    const committed = trees.get(dir).get(f);
    if (committed === undefined) {
      problems.push(`${f} is not in commit ${commit}`);
      continue;
    }
    const abs = path.join(repoRoot, f);
    if (!fs.existsSync(abs)) {
      problems.push(`${f} is in commit ${commit} but missing from the working tree`);
      continue;
    }
    if (gitBlobSha1(fs.readFileSync(abs)) !== committed) {
      problems.push(`${f} differs from its blob at commit ${commit}`);
    }
  }
  return problems;
}

/**
 * The paths (files or directories, repo-relative) that are not tracked, or carry an
 * uncommitted change (empty = all tracked and clean).
 * @param {(args: string[]) => string} git
 * @param {string[]} paths
 * @returns {string[]}
 */
export function cleanTrackedProblems(git, paths) {
  const rel = paths.map(assertRepoRelative);
  const problems = [];
  for (const p of rel) {
    if (git(['ls-files', '-z', '--', p]) === '') problems.push(`${p} is not tracked by git`);
  }
  const status = git(['status', '--porcelain', '-z', '--untracked-files=all', '--', ...rel]);
  for (const entry of status.split('\0')) {
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const file = entry.slice(3);
    if (code === '??') {
      if (!problems.some((x) => x.startsWith(`${file} `)))
        problems.push(`${file} is not tracked by git`);
    } else {
      problems.push(`${file} is modified (${code.trim()}) relative to HEAD`);
    }
  }
  return problems;
}
