/**
 * Git provenance checks for the term pass: a named layer-1 commit really holds the bytes
 * the run reads, and the files a paid run records are committed and clean.
 * Runs against a throwaway repository in the OS temp directory.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  gitBlobSha1,
  makeGit,
  resolveCommit,
  lsTreeBlobs,
  cleanTrackedProblems,
  filesAtCommitProblems,
} from '../ai-review/provenance.js';

let repo;
let git;
let first;
const sh = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-prov-'));
  sh(['init', '-q']);
  sh(['config', 'user.email', 't@example.invalid']);
  sh(['config', 'user.name', 't']);
  fs.mkdirSync(path.join(repo, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'a', 'b', 'one.md'), 'one\n');
  fs.writeFileSync(path.join(repo, 'a', 'b', 'two.md'), 'två\n');
  fs.writeFileSync(path.join(repo, 'top.md'), 'top');
  sh(['add', '.']);
  sh(['commit', '-q', '-m', 'first']);
  first = sh(['rev-parse', 'HEAD']);
  git = makeGit({ cwd: repo });
});

describe('gitBlobSha1', () => {
  it('equals git hash-object', () => {
    for (const name of ['a/b/one.md', 'a/b/two.md', 'top.md']) {
      const buf = fs.readFileSync(path.join(repo, name));
      expect(gitBlobSha1(buf)).toBe(sh(['hash-object', name]));
    }
  });
});

describe('resolveCommit', () => {
  it('resolves a ref to the full sha', () => {
    expect(resolveCommit(git, 'HEAD')).toBe(first);
    expect(resolveCommit(git, first.slice(0, 10))).toBe(first);
  });

  it('refuses a ref that names no commit', () => {
    expect(() => resolveCommit(git, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toThrow(/commit/);
    expect(() => resolveCommit(git, '--all')).toThrow(/ref/);
  });
});

describe('lsTreeBlobs', () => {
  it('maps every blob under a directory at a commit to its sha1', () => {
    const m = lsTreeBlobs(git, first, 'a');
    expect([...m.keys()].sort()).toEqual(['a/b/one.md', 'a/b/two.md']);
    expect(m.get('a/b/two.md')).toBe(sh(['hash-object', 'a/b/two.md']));
  });

  it('is empty for a directory the commit does not have', () => {
    expect(lsTreeBlobs(git, first, 'nope').size).toBe(0);
  });
});

describe('filesAtCommitProblems', () => {
  it('is empty when every file equals its committed blob', () => {
    expect(
      filesAtCommitProblems({ git, repoRoot: repo, commit: first, files: ['a/b/one.md', 'top.md'] })
    ).toEqual([]);
  });

  it('names a file whose working bytes differ from the commit, and a file the commit lacks', () => {
    const f = path.join(repo, 'a', 'b', 'one.md');
    const keep = fs.readFileSync(f);
    try {
      fs.writeFileSync(f, 'one, edited\n');
      fs.writeFileSync(path.join(repo, 'a', 'b', 'new.md'), 'new');
      const problems = filesAtCommitProblems({
        git,
        repoRoot: repo,
        commit: first,
        files: ['a/b/one.md', 'a/b/new.md', 'a/b/two.md'],
      });
      expect(problems).toHaveLength(2);
      expect(problems[0]).toMatch(/a\/b\/one\.md.*differs/);
      expect(problems[1]).toMatch(/a\/b\/new\.md.*not in/);
    } finally {
      fs.writeFileSync(f, keep);
      fs.rmSync(path.join(repo, 'a', 'b', 'new.md'));
    }
  });

  it('refuses an absolute or escaping path', () => {
    expect(() =>
      filesAtCommitProblems({
        git,
        repoRoot: repo,
        commit: first,
        files: [path.join(repo, 'top.md')],
      })
    ).toThrow(/relative/);
    expect(() =>
      filesAtCommitProblems({ git, repoRoot: repo, commit: first, files: ['../x'] })
    ).toThrow(/relative/);
  });
});

describe('cleanTrackedProblems', () => {
  it('is empty for tracked, unmodified files', () => {
    expect(cleanTrackedProblems(git, ['a/b/one.md', 'top.md'])).toEqual([]);
  });

  it('names an untracked file and a modified one', () => {
    const f = path.join(repo, 'top.md');
    const keep = fs.readFileSync(f);
    try {
      fs.writeFileSync(f, 'changed');
      fs.writeFileSync(path.join(repo, 'stray.md'), 'x');
      const problems = cleanTrackedProblems(git, ['top.md', 'stray.md', 'a/b/two.md']);
      expect(problems.join('\n')).toMatch(/top\.md.*modified/);
      expect(problems.join('\n')).toMatch(/stray\.md.*not tracked/);
      expect(problems).toHaveLength(2);
    } finally {
      fs.writeFileSync(f, keep);
      fs.rmSync(path.join(repo, 'stray.md'));
    }
  });

  it('names a directory path with an uncommitted change under it', () => {
    const f = path.join(repo, 'a', 'b', 'two.md');
    const keep = fs.readFileSync(f);
    try {
      fs.writeFileSync(f, 'changed');
      expect(cleanTrackedProblems(git, ['a'])).toEqual([expect.stringMatching(/a\/b\/two\.md/)]);
    } finally {
      fs.writeFileSync(f, keep);
    }
  });
});

describe('makeGit', () => {
  it('runs git in the given directory and returns stdout', () => {
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(first);
  });
});
