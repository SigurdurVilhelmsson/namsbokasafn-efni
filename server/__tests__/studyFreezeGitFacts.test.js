/**
 * G1.7 / spec §6.4: `gitFacts` on a throwaway repository. Layer 1's last commit names the last
 * commit that changed MT TEXT, so the content-free freeze markers (`*.locked`, which live in
 * 02-mt-output too) must not move it. History here: A adds the text, B is a HAND REPAIR, C is a
 * re-buy whose BODY mentions HAND REPAIR, D adds only a marker.
 *
 * A second repository checks layer 1s against real `git ls-files`: the manifest records the
 * 02-mt-selected files git tracks, never a gitignored one (a gitignored file is invisible to the
 * dirty-input check, so recording it would make the manifest depend on local junk).
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const work = mkdtempSync(path.join(tmpdir(), 'study-freeze-gitfacts-'));
// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';
const study = require('../scripts/study-freeze');
const { gitFacts } = study;
const segmentParser = require('../services/segmentParser');
const { writeModule, writeRaw } = require('./helpers/servedFixture');

const BOOK = 'efnafraedi-2e';
const REPAIR_SUBJECT = 'data(mt): HAND REPAIR — fix';
const repo = path.join(work, 'history');
const unitDir = path.join(repo, 'books', BOOK, '02-mt-output', 'ch01');
const textFile = path.join(unitDir, 'm1-segments.is.md');
const markerFile = path.join(unitDir, 'm1-segments.locked');
const shas = {};

const gitIn =
  (cwd) =>
  (...args) =>
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
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
const git = gitIn(repo);
const commit = (file, content, ...messages) => {
  writeFileSync(file, content);
  git('add', '--', path.relative(repo, file));
  git('commit', ...messages.flatMap((m) => ['-m', m]));
  return git('rev-parse', 'HEAD');
};

let facts;
beforeAll(() => {
  mkdirSync(unitDir, { recursive: true });
  git('init', '-q');
  shas.A = commit(textFile, 'one\n', 'data(mt): first');
  shas.B = commit(textFile, 'two\n', REPAIR_SUBJECT);
  shas.C = commit(textFile, 'three\n', 'data(mt): re-buy', 'NO HAND REPAIR WAS NEEDED');
  shas.D = commit(markerFile, '{}\n', 'data(freeze): marker');
  facts = gitFacts({ book: BOOK, repoRoot: repo });
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
    expect(gitFacts({ book: BOOK, repoRoot: repo }).dirtyPaths).not.toEqual([]);
  });
});

describe('layer 1s on a real repository: tracked files only, never a gitignored one', () => {
  const lsRepo = path.join(work, 'layer1s');
  const g = gitIn(lsRepo);
  const books = path.join(lsRepo, 'books');
  const TRACKED = '02-mt-selected/ch01/m90001-selected.json';
  const IGNORED = '02-mt-selected/ch01/x.bak';
  let realBooksDir;
  let lsFacts;

  beforeAll(() => {
    mkdirSync(lsRepo, { recursive: true });
    g('init', '-q');
    writeFileSync(path.join(lsRepo, '.gitignore'), '*.bak\n');
    writeModule(books, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: 'm90001',
      en: [['m90001:para:a', 'English.']],
      mt: [['m90001:para:a', 'Íslenska.']],
    });
    writeRaw(
      books,
      `${BOOK}/${TRACKED}`,
      JSON.stringify({ module: 'm90001', entries: [{ segmentId: 'm90001:para:a', occurrence: 0 }] })
    );
    g('add', '-A');
    g('commit', '-q', '-m', 'fixture');
    writeRaw(books, `${BOOK}/${IGNORED}`, 'a local backup\n'); // after the commit, ignored
    realBooksDir = segmentParser.BOOKS_DIR;
    segmentParser._setTestBooksDir(books);
    lsFacts = gitFacts({ book: BOOK, repoRoot: lsRepo });
  });
  afterAll(() => segmentParser._setTestBooksDir(realBooksDir));

  it('control: x.bak is on disk and git ignores it', () => {
    expect(existsSync(path.join(books, BOOK, IGNORED))).toBe(true);
    expect(g('check-ignore', '--', `books/${BOOK}/${IGNORED}`)).toBe(`books/${BOOK}/${IGNORED}`);
  });
  it('the dirty-input check cannot see the ignored file (why it must not be recorded)', () => {
    expect(lsFacts.dirtyPaths).toEqual([]);
  });
  it('gitFacts lists the tracked 02-mt-selected files, book-relative', () => {
    expect(lsFacts.layer1sFiles).toEqual([TRACKED]);
  });
  it("the manifest's layer 1s holds the tracked file and not the ignored one", () => {
    const tag = `freeze-${BOOK}-2026-12-01`;
    const { header } = study.buildManifest({ book: BOOK, tag, git: lsFacts });
    expect(header.layers.layer1s.files.map((f) => f.path)).toEqual([TRACKED]);
  });
  it("a manifest write's temp directory (books/<book>/.freeze-tmp-*) is not a dirty input", () => {
    // where writeManifest stages a cut before renaming it into freeze/<tag>/
    writeRaw(books, `${BOOK}/.freeze-tmp-${BOOK}-x/freeze.json`, '{}\n');
    expect(gitFacts({ book: BOOK, repoRoot: lsRepo }).dirtyPaths).toEqual([]);
  });
});

describe('an uncommitted change to a 02-mt-fable file blocks a cut (deferred minor 9)', () => {
  const fableRepo = path.join(work, 'fable');
  const fableGit = gitIn(fableRepo);
  const rel = `books/${BOOK}/02-mt-fable/ch01/m1-segments.is.md`;
  const file = path.join(fableRepo, rel);

  beforeAll(() => {
    mkdirSync(path.dirname(file), { recursive: true });
    fableGit('init', '-q');
    writeFileSync(file, 'fable\n');
    fableGit('add', '--', rel);
    fableGit('commit', '-m', 'data(fable): layer');
  });

  it('control: the committed Fable file leaves the tree clean and the cut unrefused', () => {
    const clean = gitFacts({ book: BOOK, repoRoot: fableRepo });
    expect(clean.dirtyPaths).toEqual([]);
    expect(study.manifestRefusals({ book: BOOK, git: clean, base: [] })).toEqual([]);
  });

  it('the same file changed and not committed is a dirty input, and the cut is refused', () => {
    writeFileSync(file, 'fable, edited\n');
    const dirty = gitFacts({ book: BOOK, repoRoot: fableRepo });
    expect(dirty.dirtyPaths).toEqual([rel]);
    expect(study.manifestRefusals({ book: BOOK, git: dirty, base: [] })).toEqual([
      { reason: 'dirty-input', paths: [rel] },
    ]);
  });
});
