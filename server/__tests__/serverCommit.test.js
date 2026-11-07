// server/__tests__/serverCommit.test.js — spec §5.12 (G1.2 PR3, Task 9)
// Every git run here is in a temporary repository (spec T13); the production reader is never called.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

const {
  REPO_ROOT,
  DEPLOY_FILE,
  computeServerCommit,
  makeServerCommitReader,
  getServerCommit,
  _setTestServerCommit,
} = require('../lib/serverCommit');

const SERVER = path.join(__dirname, '..');
const REPO = path.join(SERVER, '..');
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
const commit = (cwd, msg) =>
  git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg);

let tmp;
let repoRoot;
let X;
let Y;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'server-commit-'));
  repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(repoRoot, 'server'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'tools', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'books'), { recursive: true });
  git(repoRoot, 'init', '-q');
  fs.writeFileSync(path.join(repoRoot, 'server', 'a.js'), 'a\n');
  fs.writeFileSync(path.join(repoRoot, 'tools', 'lib', 'c.js'), 'c\n');
  fs.writeFileSync(path.join(repoRoot, 'books', 'b.md'), 'b\n');
  git(repoRoot, 'add', '.');
  commit(repoRoot, 'X');
  X = git(repoRoot, 'rev-parse', 'HEAD');
  fs.appendFileSync(path.join(repoRoot, 'books', 'b.md'), 'more\n');
  git(repoRoot, 'add', '.');
  commit(repoRoot, 'Y');
  Y = git(repoRoot, 'rev-parse', 'HEAD');
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const write = (file, obj) => fs.writeFileSync(file, JSON.stringify(obj));

describe('computeServerCommit', () => {
  it('a deploy file names upstream X with HEAD Y: the stamp is X, deploy-file, clean', () => {
    const deployFile = path.join(tmp, 'deployed');
    write(deployFile, { upstream: X, head: Y });
    expect(computeServerCommit({ repoRoot, deployFile })).toEqual({
      serverCommit: X,
      commitSource: 'deploy-file',
      codeDirty: 0,
    });
  });

  it('a change under server/ sets code_dirty; one under books/ alone does not', () => {
    const deployFile = path.join(tmp, 'deployed');
    write(deployFile, { upstream: X, head: Y });
    const books = path.join(repoRoot, 'books', 'b.md');
    const srv = path.join(repoRoot, 'server', 'a.js');
    const lib = path.join(repoRoot, 'tools', 'lib', 'c.js');
    const dirty = () => computeServerCommit({ repoRoot, deployFile }).codeDirty;
    const saved = [books, srv, lib].map((f) => fs.readFileSync(f));
    try {
      fs.appendFileSync(books, 'x\n');
      expect(dirty()).toBe(0); // the control
      fs.writeFileSync(books, saved[0]);
      fs.appendFileSync(srv, 'x\n');
      expect(dirty()).toBe(1);
      fs.writeFileSync(srv, saved[1]);
      fs.appendFileSync(lib, 'x\n');
      expect(dirty()).toBe(1);
    } finally {
      fs.writeFileSync(books, saved[0]);
      fs.writeFileSync(srv, saved[1]);
      fs.writeFileSync(lib, saved[2]);
    }
  });

  it('no deploy file: HEAD, git-head', () => {
    expect(computeServerCommit({ repoRoot, deployFile: path.join(tmp, 'absent') })).toEqual({
      serverCommit: Y,
      commitSource: 'git-head',
      codeDirty: 0,
    });
  });

  it('a deploy file that is not 40-hex is ignored, not trusted', () => {
    const deployFile = path.join(tmp, 'bad');
    write(deployFile, { upstream: 'abc' });
    expect(computeServerCommit({ repoRoot, deployFile }).commitSource).toBe('git-head');
  });

  it('neither: NULL, unknown, NULL', () => {
    const plain = fs.mkdtempSync(path.join(tmp, 'plain-'));
    const none = { serverCommit: null, commitSource: 'unknown', codeDirty: null };
    expect(computeServerCommit({ repoRoot: plain, deployFile: path.join(tmp, 'absent') })).toEqual(
      none
    );
    expect(
      computeServerCommit({
        repoRoot,
        deployFile: path.join(tmp, 'absent'),
        runGit: () => ({ status: 128 }),
      })
    ).toEqual(none);
  });
});

describe('record-deployed-commit.sh and the reader', () => {
  const script = path.join(REPO, 'scripts', 'record-deployed-commit.sh');

  it('the real writer and the real reader agree (one format, two languages)', () => {
    const out = path.join(tmp, 'written');
    execFileSync('bash', [script, 'HEAD~1', out], { cwd: repoRoot, env: GIT_ENV });
    expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual({ upstream: X, head: Y });
    expect(computeServerCommit({ repoRoot, deployFile: out })).toEqual({
      serverCommit: X,
      commitSource: 'deploy-file',
      codeDirty: 0,
    });
  });

  it('a failing writer leaves no stale file', () => {
    const out = path.join(tmp, 'stale');
    write(out, { upstream: X, head: Y });
    const r = spawnSync('bash', [script, 'no-such-ref', out], { cwd: repoRoot, env: GIT_ENV });
    expect([r.status === 0, fs.existsSync(out)]).toEqual([false, false]);
  });
});

describe('makeServerCommitReader and the production seam', () => {
  it('the reader computes once, on the repository it is given', () => {
    const calls = [];
    const runGit = (args, cwd) => {
      calls.push([args[0], cwd]);
      const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
      return { status: r.status, stdout: r.stdout || '' };
    };
    const deployFile = path.join(tmp, 'absent');
    const reader = makeServerCommitReader({ repoRoot, deployFile, runGit });
    const a = reader.get();
    const b = reader.get();
    expect(b).toBe(a);
    expect(a).toEqual({ serverCommit: Y, commitSource: 'git-head', codeDirty: 0 });
    expect(calls).toEqual([
      ['rev-parse', repoRoot],
      ['diff', repoRoot],
    ]);
    // control: the memo is per reader
    makeServerCommitReader({ repoRoot, deployFile, runGit }).get();
    expect(calls).toHaveLength(4);
  });

  it('the test seam overrides the production reader, which is rooted at the repository', () => {
    const v = { serverCommit: 'a'.repeat(40), commitSource: 'deploy-file', codeDirty: 0 };
    _setTestServerCommit(v);
    try {
      expect(getServerCommit()).toBe(v);
    } finally {
      _setTestServerCommit(null); // getServerCommit() is not called after this: it would run git on the real tree
    }
    expect(REPO_ROOT).toBe(path.join(SERVER, '..'));
    expect(DEPLOY_FILE).toBe(path.join(REPO_ROOT, 'pipeline-output', '.deployed-commit'));
  });

  it('index.js reads the commit once at boot, after the research boot block', () => {
    const src = fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8');
    const at = src.indexOf("require('./lib/serverCommit').getServerCommit()");
    expect(at).toBeGreaterThan(src.indexOf('openAtBoot('));
    expect(at).toBeLessThan(src.indexOf('app.listen('));
  });
});
