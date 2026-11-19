/**
 * G1.7 / spec §6.4: `gitFacts` on a throwaway repository. Layer 1's last commit names the last
 * commit that changed MT TEXT, so the content-free freeze markers (`*.locked`, which live in
 * 02-mt-output too) must not move it. History here: A adds the text, B is a HAND REPAIR, C is a
 * re-buy whose BODY mentions HAND REPAIR, D adds only a marker.
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { gitFacts } = require('../scripts/study-freeze');

const BOOK = 'efnafraedi-2e';
const REPAIR_SUBJECT = 'data(mt): HAND REPAIR — fix';
const work = mkdtempSync(path.join(tmpdir(), 'study-freeze-gitfacts-'));
const unitDir = path.join(work, 'books', BOOK, '02-mt-output', 'ch01');
const textFile = path.join(unitDir, 'm1-segments.is.md');
const markerFile = path.join(unitDir, 'm1-segments.locked');
const shas = {};

const git = (...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
const commit = (file, content, ...messages) => {
  writeFileSync(file, content);
  git('add', '--', path.relative(work, file));
  git('commit', ...messages.flatMap((m) => ['-m', m]));
  return git('rev-parse', 'HEAD');
};

let facts;
beforeAll(() => {
  git('init', '-q');
  mkdirSync(unitDir, { recursive: true });
  shas.A = commit(textFile, 'one\n', 'data(mt): first');
  shas.B = commit(textFile, 'two\n', REPAIR_SUBJECT);
  shas.C = commit(textFile, 'three\n', 'data(mt): re-buy', 'NO HAND REPAIR WAS NEEDED');
  shas.D = commit(markerFile, '{}\n', 'data(freeze): marker');
  facts = gitFacts({ book: BOOK, repoRoot: work });
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('gitFacts on a throwaway repository', () => {
  it("layer 1's last commit is the last one that changed MT text, not the marker commit", () => {
    expect(facts.layer1LastCommit).toBe(shas.C);
  });
  it('the marker commit is not layer 1 (control: it is HEAD)', () => {
    expect(shas.D).not.toBe(shas.C);
    expect(facts.baseCommit).toBe(shas.D);
  });
  it('handRepairs holds only the commit whose SUBJECT says so', () => {
    expect(facts.handRepairs).toEqual([{ commit: shas.B, subject: REPAIR_SUBJECT }]);
  });
  it('is not shallow', () => {
    expect(facts.shallow).toBe(false);
  });
  it('a clean tree has no dirty paths', () => {
    expect(facts.dirtyPaths).toEqual([]);
  });
  it('an untracked file in an input directory is a dirty path', () => {
    writeFileSync(path.join(unitDir, 'stray.txt'), 'x');
    expect(gitFacts({ book: BOOK, repoRoot: work }).dirtyPaths).not.toEqual([]);
  });
});
