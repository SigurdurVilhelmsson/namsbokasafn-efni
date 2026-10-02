/**
 * A throwaway git repository holding a small `books/` tree, for the §C140 ㊵ tests.
 *
 * Identity and signing are set PER REPOSITORY, so the tests run on a CI box with no global git
 * config. `.gitignore` mirrors the repo's own backup and tmp patterns, because an ignored
 * `.backup.<ts>` file is exactly what the reference scan must not count.
 *
 * Every directory made here is remembered, and `cleanupFixtures()` removes them all. /tmp is a
 * small tmpfs, so a test file calls it from `afterEach` (fixtures made per test) or `afterAll`
 * (fixtures shared across tests).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

/** Directories made by this module and not yet removed. */
const made = [];

/**
 * The environment every git call here runs with: this process's, minus every `GIT_*` variable. A git
 * hook exports some — an ABSOLUTE `GIT_INDEX_FILE` under `git commit -a` or a partial commit — and
 * inherited, it points the fixture's `git add -A` at the OUTER repository's index (measured).
 */
const gitEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

/**
 * A fresh temp directory that `cleanupFixtures()` will remove — for a test that needs a plain
 * directory (or a bare, commit-less repository) beside the `makeGitFixture` ones.
 * @param {string} prefix
 * @returns {string} absolute path
 */
export function makeTmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** Remove every directory this module has made so far. Safe to call repeatedly. */
export function cleanupFixtures() {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

export function makeGitFixture(files, { ignore = ['*.backup.*', '*.tmp'] } = {}) {
  const root = makeTmpDir('c40-');
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnv(),
    }).toString();
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'fixture');
  git('config', 'commit.gpgsign', 'false');
  const write = (rel, content) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  write('.gitignore', ignore.join('\n') + '\n');
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  /** {rel: content} for every file outside .git — to assert that a run wrote nothing. */
  const snapshot = () => {
    const out = {};
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.git') continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else out[path.relative(root, abs)] = fs.readFileSync(abs, 'latin1');
      }
    };
    walk(root);
    return out;
  };
  return { root, booksRoot: path.join(root, 'books'), git, write, read, exists, snapshot };
}
